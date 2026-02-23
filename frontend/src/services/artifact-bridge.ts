/**
 * ArtifactBridge - Bridges SSE artifact events to Unreal Engine via Pixel Streaming
 *
 * Listens for `artifact_ready` SSE events and sends LoadArtifact messages
 * to UE via the Pixel Streaming emitUIInteraction channel.
 * When Pixel Streaming is not connected, artifacts are queued and
 * forwarded once the connection is re-established.
 */

import { jobService, JobEvent } from './job-service';

/** Shape of the PixelStreaming instance (subset used by this bridge) */
interface PixelStreamingHandle {
  emitUIInteraction(descriptor: Record<string, unknown>): void;
}

/** Artifact data as received from the SSE event */
interface ArtifactEventData {
  artifact_id: string;
  dataset: string;
  format: string;
  bounds: number[];
  download_url: string;
}

/** Message sent to UE via emitUIInteraction */
interface LoadArtifactMessage {
  type: 'LoadArtifact';
  artifact_id: string;
  dataset: string;
  format: string;
  bounds: number[];
  download_url: string;
}

type WarningCallback = (message: string) => void;

class ArtifactBridge {
  private pixelStreaming: PixelStreamingHandle | null = null;
  private queue: LoadArtifactMessage[] = [];
  private warningCallback: WarningCallback | null = null;
  private unsubscribe: (() => void) | null = null;

  /**
   * Set (or clear) the active Pixel Streaming instance.
   * When a non-null handle is provided, any queued artifacts are flushed.
   */
  setPixelStreaming(ps: PixelStreamingHandle | null): void {
    this.pixelStreaming = ps;

    if (ps && this.queue.length > 0) {
      this.flushQueue();
    }
  }

  /**
   * Register a warning callback (e.g. to show a notification when PS is offline).
   */
  onWarning(callback: WarningCallback): void {
    this.warningCallback = callback;
  }

  /**
   * Start listening for artifact SSE events.
   */
  start(): void {
    if (this.unsubscribe) {
      return;
    }

    this.unsubscribe = jobService.onJobEvent((event: JobEvent) => {
      if (event.type === 'artifact_ready') {
        this.handleArtifactReady(event.data as unknown as ArtifactEventData);
      }
    });
  }

  /**
   * Stop listening and clear queued artifacts.
   */
  stop(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.queue = [];
  }

  // ---- private ----

  private handleArtifactReady(data: ArtifactEventData): void {
    const message = this.buildMessage(data);

    if (this.pixelStreaming) {
      this.sendToUE(message);
    } else {
      this.queue.push(message);
      const warning = `Pixel Streaming not connected. Artifact "${data.dataset}" queued for delivery.`;
      console.warn(warning);
      if (this.warningCallback) {
        this.warningCallback(warning);
      }
    }
  }

  private buildMessage(data: ArtifactEventData): LoadArtifactMessage {
    const backendBase =
      import.meta.env.VITE_BACKEND_BASE_URL?.trim() || window.location.origin;

    // Ensure no double-slash when joining base and relative path
    const base = backendBase.replace(/\/+$/, '');
    const relative = data.download_url.startsWith('/')
      ? data.download_url
      : `/${data.download_url}`;

    return {
      type: 'LoadArtifact',
      artifact_id: data.artifact_id,
      dataset: data.dataset,
      format: data.format,
      bounds: data.bounds,
      download_url: `${base}${relative}`,
    };
  }

  private sendToUE(message: LoadArtifactMessage): void {
    try {
      this.pixelStreaming!.emitUIInteraction(message as unknown as Record<string, unknown>);
      console.info(`Sent LoadArtifact to UE: ${message.artifact_id} (${message.dataset})`);
    } catch (error) {
      console.error('Failed to send LoadArtifact to UE:', error);
    }
  }

  private flushQueue(): void {
    const pending = [...this.queue];
    this.queue = [];

    for (const message of pending) {
      this.sendToUE(message);
    }

    if (pending.length > 0) {
      console.info(`Flushed ${pending.length} queued artifact(s) to UE.`);
    }
  }
}

// Export singleton instance
export const artifactBridge = new ArtifactBridge();
