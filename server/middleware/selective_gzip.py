"""GZip middleware that skips compression for SSE responses."""

import gzip
import io
from collections.abc import Sequence

from starlette.datastructures import Headers, MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send


class SelectiveGZipMiddleware:
    """
    Apply GZip compression to HTTP responses except configured paths and SSE.

    This keeps regular JSON/file responses compressed while preserving
    `text/event-stream` behavior for low-latency SSE delivery.
    """

    def __init__(
        self,
        app: ASGIApp,
        minimum_size: int = 500,
        compresslevel: int = 9,
        skip_paths: Sequence[str] | None = None,
    ) -> None:
        self.app = app
        self.minimum_size = minimum_size
        self.compresslevel = compresslevel
        self.skip_paths = tuple(skip_paths or ())

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        path = scope.get("path", "")
        if path in self.skip_paths:
            await self.app(scope, receive, send)
            return

        headers = Headers(scope=scope)
        if "gzip" in headers.get("Accept-Encoding", ""):
            responder = _SelectiveGZipResponder(
                self.app,
                self.minimum_size,
                compresslevel=self.compresslevel,
            )
            await responder(scope, receive, send)
            return

        await self.app(scope, receive, send)


class _SelectiveGZipResponder:
    """Internal response handler based on Starlette's GZip responder."""

    def __init__(self, app: ASGIApp, minimum_size: int, compresslevel: int = 9) -> None:
        self.app = app
        self.minimum_size = minimum_size
        self.send: Send = _unattached_send
        self.initial_message: Message = {}
        self.started = False
        self.content_encoding_set = False
        self.skip_compression = False
        self.gzip_buffer = io.BytesIO()
        self.gzip_file = gzip.GzipFile(
            mode="wb",
            fileobj=self.gzip_buffer,
            compresslevel=compresslevel,
        )

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        self.send = send
        with self.gzip_buffer, self.gzip_file:
            await self.app(scope, receive, self.send_with_gzip)

    async def send_with_gzip(self, message: Message) -> None:
        message_type = message["type"]

        if message_type == "http.response.start":
            # Delay sending headers unless we decide to bypass compression.
            self.initial_message = message
            headers = Headers(raw=self.initial_message["headers"])
            self.content_encoding_set = "content-encoding" in headers
            content_type = headers.get("content-type", "")

            # Never gzip SSE responses to avoid buffering streamed events.
            if content_type.startswith("text/event-stream"):
                self.skip_compression = True
                self.started = True
                await self.send(self.initial_message)
            return

        if self.skip_compression:
            await self.send(message)
            return

        if message_type == "http.response.body" and self.content_encoding_set:
            if not self.started:
                self.started = True
                await self.send(self.initial_message)
            await self.send(message)
            return

        if message_type == "http.response.body" and not self.started:
            self.started = True
            body = message.get("body", b"")
            more_body = message.get("more_body", False)

            if len(body) < self.minimum_size and not more_body:
                await self.send(self.initial_message)
                await self.send(message)
                return

            if not more_body:
                self.gzip_file.write(body)
                self.gzip_file.close()
                body = self.gzip_buffer.getvalue()

                headers = MutableHeaders(raw=self.initial_message["headers"])
                headers["Content-Encoding"] = "gzip"
                headers["Content-Length"] = str(len(body))
                headers.add_vary_header("Accept-Encoding")
                message["body"] = body

                await self.send(self.initial_message)
                await self.send(message)
                return

            headers = MutableHeaders(raw=self.initial_message["headers"])
            headers["Content-Encoding"] = "gzip"
            headers.add_vary_header("Accept-Encoding")
            del headers["Content-Length"]

            self.gzip_file.write(body)
            message["body"] = self.gzip_buffer.getvalue()
            self.gzip_buffer.seek(0)
            self.gzip_buffer.truncate()

            await self.send(self.initial_message)
            await self.send(message)
            return

        if message_type == "http.response.body":
            body = message.get("body", b"")
            more_body = message.get("more_body", False)

            self.gzip_file.write(body)
            if not more_body:
                self.gzip_file.close()

            message["body"] = self.gzip_buffer.getvalue()
            self.gzip_buffer.seek(0)
            self.gzip_buffer.truncate()

            await self.send(message)


async def _unattached_send(message: Message) -> None:
    raise RuntimeError("send awaitable not set")  # pragma: no cover
