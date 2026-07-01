"""SQLite catalog for upload batches, candidates, and ingested datasets."""

from __future__ import annotations

import json
import secrets
import sqlite3
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class UploadCatalog:
    """Persistence layer for upload workflow state."""

    def __init__(self, db_path: Path):
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self._init_schema()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_schema(self) -> None:
        with self._lock, self._connect() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS upload_batches (
                    id TEXT PRIMARY KEY,
                    name TEXT,
                    created_at TEXT NOT NULL,
                    status TEXT NOT NULL,
                    root_dir TEXT NOT NULL,
                    file_count INTEGER NOT NULL,
                    total_bytes INTEGER NOT NULL
                );

                CREATE TABLE IF NOT EXISTS upload_files (
                    id TEXT PRIMARY KEY,
                    batch_id TEXT NOT NULL,
                    rel_path TEXT NOT NULL,
                    abs_path TEXT NOT NULL,
                    ext TEXT NOT NULL,
                    size INTEGER NOT NULL,
                    sha256 TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY(batch_id) REFERENCES upload_batches(id)
                );

                CREATE TABLE IF NOT EXISTS upload_candidates (
                    id TEXT PRIMARY KEY,
                    batch_id TEXT NOT NULL,
                    candidate_key TEXT NOT NULL,
                    name TEXT NOT NULL,
                    title TEXT NOT NULL,
                    inferred_type TEXT NOT NULL,
                    role TEXT NOT NULL,
                    confidence TEXT NOT NULL,
                    primary_rel_path TEXT NOT NULL,
                    group_rel_paths_json TEXT NOT NULL,
                    warnings_json TEXT NOT NULL,
                    metadata_json TEXT NOT NULL,
                    detected_format TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY(batch_id) REFERENCES upload_batches(id)
                );

                CREATE TABLE IF NOT EXISTS uploaded_datasets (
                    id TEXT PRIMARY KEY,
                    dataset_name TEXT NOT NULL,
                    title TEXT NOT NULL,
                    version INTEGER NOT NULL,
                    inferred_type TEXT NOT NULL,
                    role TEXT NOT NULL,
                    source_batch_id TEXT NOT NULL,
                    storage_dir TEXT NOT NULL,
                    primary_file TEXT NOT NULL,
                    detected_format TEXT NOT NULL,
                    crs TEXT,
                    bounds_json TEXT,
                    metadata_json TEXT NOT NULL,
                    status TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_upload_files_batch
                    ON upload_files(batch_id);

                CREATE INDEX IF NOT EXISTS idx_upload_candidates_batch
                    ON upload_candidates(batch_id);

                CREATE INDEX IF NOT EXISTS idx_uploaded_datasets_name_version
                    ON uploaded_datasets(dataset_name, version);

                CREATE TABLE IF NOT EXISTS sessions (
                    id             TEXT PRIMARY KEY,
                    created_at     TEXT NOT NULL,
                    last_accessed  TEXT NOT NULL,
                    state_json     TEXT NOT NULL DEFAULT '{}',
                    bookmarks_json TEXT NOT NULL DEFAULT '[]'
                );
                """
            )

            # Backward-compatible schema migration for existing DBs.
            columns = {
                row["name"] for row in conn.execute("PRAGMA table_info(upload_batches)").fetchall()
            }
            if "name" not in columns:
                conn.execute("ALTER TABLE upload_batches ADD COLUMN name TEXT")

            # Quality-gate columns — added in v2 schema migration.
            _migrations: list[str] = [
                "ALTER TABLE upload_batches ADD COLUMN quality_check_status TEXT",
                "ALTER TABLE upload_batches ADD COLUMN quality_check_result TEXT",
                "ALTER TABLE upload_candidates ADD COLUMN verdict TEXT",
                "ALTER TABLE upload_candidates ADD COLUMN verdict_issues TEXT",
                "ALTER TABLE upload_candidates ADD COLUMN verdict_summary TEXT",
                "ALTER TABLE upload_candidates ADD COLUMN thumbnail_path TEXT",
                "ALTER TABLE uploaded_datasets ADD COLUMN last_review_at TEXT",
                "ALTER TABLE uploaded_datasets ADD COLUMN review_issues TEXT",
                "ALTER TABLE upload_batches ADD COLUMN session_id TEXT",
            ]
            for stmt in _migrations:
                try:
                    conn.execute(stmt)
                except sqlite3.OperationalError:
                    pass  # column already exists

    def create_batch(
        self,
        batch_id: str,
        name: str | None,
        root_dir: str,
        file_count: int,
        total_bytes: int,
        status: str = "uploaded",
        session_id: str | None = None,
    ) -> None:
        created_at = _utc_now_iso()
        with self._lock, self._connect() as conn:
            conn.execute(
                """
                INSERT INTO upload_batches
                (id, name, created_at, status, root_dir, file_count, total_bytes, session_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (batch_id, name, created_at, status, root_dir, file_count, total_bytes, session_id),
            )

    def update_batch_status(self, batch_id: str, status: str) -> None:
        with self._lock, self._connect() as conn:
            conn.execute(
                "UPDATE upload_batches SET status = ? WHERE id = ?",
                (status, batch_id),
            )

    def update_quality_check(
        self, batch_id: str, status: str, result: Any
    ) -> None:
        """Update quality check status and JSON result on a batch."""
        with self._lock, self._connect() as conn:
            conn.execute(
                """
                UPDATE upload_batches
                SET quality_check_status = ?, quality_check_result = ?
                WHERE id = ?
                """,
                (status, json.dumps(result), batch_id),
            )

    def add_batch_files(self, batch_id: str, file_records: list[dict[str, Any]]) -> None:
        created_at = _utc_now_iso()
        rows = [
            (
                r["id"],
                batch_id,
                r["rel_path"],
                r["abs_path"],
                r["ext"],
                int(r["size"]),
                r["sha256"],
                created_at,
            )
            for r in file_records
        ]
        with self._lock, self._connect() as conn:
            conn.executemany(
                """
                INSERT INTO upload_files
                (id, batch_id, rel_path, abs_path, ext, size, sha256, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                rows,
            )

    def replace_candidates(self, batch_id: str, candidates: list[dict[str, Any]]) -> None:
        created_at = _utc_now_iso()
        with self._lock, self._connect() as conn:
            conn.execute("DELETE FROM upload_candidates WHERE batch_id = ?", (batch_id,))
            conn.executemany(
                """
                INSERT INTO upload_candidates
                (
                    id, batch_id, candidate_key, name, title, inferred_type, role,
                    confidence, primary_rel_path, group_rel_paths_json, warnings_json,
                    metadata_json, detected_format, created_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                [
                    (
                        c["id"],
                        batch_id,
                        c["candidate_key"],
                        c["name"],
                        c["title"],
                        c["inferred_type"],
                        c["role"],
                        c["confidence"],
                        c["primary_rel_path"],
                        json.dumps(c.get("group_rel_paths", [])),
                        json.dumps(c.get("warnings", [])),
                        json.dumps(c.get("metadata", {})),
                        c.get("detected_format", ""),
                        created_at,
                    )
                    for c in candidates
                ],
            )

    def get_batch(self, batch_id: str) -> dict[str, Any] | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM upload_batches WHERE id = ?",
                (batch_id,),
            ).fetchone()
        return dict(row) if row else None

    def list_batches_by_session(self, session_id: str) -> list[dict[str, Any]]:
        """Return all batches belonging to *session_id*, most recent first."""
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT * FROM upload_batches
                WHERE session_id = ?
                ORDER BY created_at DESC
                """,
                (session_id,),
            ).fetchall()
        return [dict(r) for r in rows]

    def list_batch_files(self, batch_id: str) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT id, rel_path, abs_path, ext, size, sha256
                FROM upload_files
                WHERE batch_id = ?
                ORDER BY rel_path
                """,
                (batch_id,),
            ).fetchall()
        return [dict(r) for r in rows]

    def list_candidates(self, batch_id: str) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT *
                FROM upload_candidates
                WHERE batch_id = ?
                ORDER BY name
                """,
                (batch_id,),
            ).fetchall()
        return [self._decode_candidate(dict(r)) for r in rows]

    @staticmethod
    def _decode_candidate(candidate: dict[str, Any]) -> dict[str, Any]:
        candidate["group_rel_paths"] = json.loads(candidate["group_rel_paths_json"])
        candidate["warnings"] = json.loads(candidate["warnings_json"])
        candidate["metadata"] = json.loads(candidate["metadata_json"])
        candidate.pop("group_rel_paths_json", None)
        candidate.pop("warnings_json", None)
        candidate.pop("metadata_json", None)
        # Decode verdict_issues from JSON string if present.
        vi = candidate.get("verdict_issues")
        if isinstance(vi, str):
            candidate["verdict_issues"] = json.loads(vi)
        return candidate

    def insert_uploaded_dataset(self, record: dict[str, Any]) -> None:
        created_at = _utc_now_iso()
        with self._lock, self._connect() as conn:
            conn.execute(
                """
                INSERT INTO uploaded_datasets
                (
                    id, dataset_name, title, version, inferred_type, role,
                    source_batch_id, storage_dir, primary_file, detected_format, crs,
                    bounds_json, metadata_json, status, created_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    record["id"],
                    record["dataset_name"],
                    record["title"],
                    int(record["version"]),
                    record["inferred_type"],
                    record["role"],
                    record["source_batch_id"],
                    record["storage_dir"],
                    record["primary_file"],
                    record.get("detected_format", ""),
                    record.get("crs"),
                    json.dumps(record.get("bounds")),
                    json.dumps(record.get("metadata", {})),
                    record.get("status", "active"),
                    created_at,
                ),
            )

    def next_dataset_version(self, dataset_name: str) -> int:
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT MAX(version) AS max_version
                FROM uploaded_datasets
                WHERE dataset_name = ?
                """,
                (dataset_name,),
            ).fetchone()
        max_version = row["max_version"] if row and row["max_version"] is not None else 0
        return int(max_version) + 1

    def list_uploaded_datasets(self, latest_only: bool = True) -> list[dict[str, Any]]:
        with self._connect() as conn:
            if latest_only:
                rows = conn.execute(
                    """
                    SELECT u.*, b.created_at AS batch_created_at, b.name AS batch_name
                    FROM uploaded_datasets u
                    JOIN (
                      SELECT dataset_name, MAX(version) AS max_version
                      FROM uploaded_datasets
                      WHERE status = 'active'
                      GROUP BY dataset_name
                    ) latest
                    ON u.dataset_name = latest.dataset_name
                    AND u.version = latest.max_version
                    LEFT JOIN upload_batches b ON b.id = u.source_batch_id
                    WHERE u.status = 'active'
                    ORDER BY u.dataset_name
                    """
                ).fetchall()
            else:
                rows = conn.execute(
                    """
                    SELECT u.*, b.created_at AS batch_created_at, b.name AS batch_name
                    FROM uploaded_datasets u
                    LEFT JOIN upload_batches b ON b.id = u.source_batch_id
                    ORDER BY dataset_name, version DESC
                    """
                ).fetchall()
        return [self._decode_uploaded_dataset(dict(r)) for r in rows]

    def get_uploaded_dataset_by_name(self, dataset_name: str) -> dict[str, Any] | None:
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT *
                FROM uploaded_datasets
                WHERE dataset_name = ? AND status = 'active'
                ORDER BY version DESC
                LIMIT 1
                """,
                (dataset_name,),
            ).fetchone()
        if not row:
            return None
        return self._decode_uploaded_dataset(dict(row))

    @staticmethod
    def _decode_uploaded_dataset(record: dict[str, Any]) -> dict[str, Any]:
        record["bounds"] = (
            json.loads(record["bounds_json"]) if record.get("bounds_json") else None
        )
        record["metadata"] = json.loads(record["metadata_json"])
        record.pop("bounds_json", None)
        record.pop("metadata_json", None)
        return record

    def update_candidate_verdict(
        self,
        candidate_id: str,
        verdict: str,
        issues: Any,
        summary: str,
        thumbnail_path: str | None = None,
    ) -> None:
        """Update verdict fields on a candidate."""
        with self._lock, self._connect() as conn:
            conn.execute(
                """
                UPDATE upload_candidates
                SET verdict = ?, verdict_issues = ?, verdict_summary = ?,
                    thumbnail_path = ?
                WHERE id = ?
                """,
                (verdict, json.dumps(issues), summary, thumbnail_path, candidate_id),
            )

    def update_dataset_review(
        self, dataset_id: str, review_issues: Any
    ) -> None:
        """Update review timestamp and issues on a dataset."""
        with self._lock, self._connect() as conn:
            conn.execute(
                """
                UPDATE uploaded_datasets
                SET last_review_at = ?, review_issues = ?
                WHERE id = ?
                """,
                (_utc_now_iso(), json.dumps(review_issues), dataset_id),
            )

    # ------------------------------------------------------------------
    # Session management
    # ------------------------------------------------------------------

    def create_session(self) -> str:
        """Create a new session and return its 8-char ID."""
        now = _utc_now_iso()
        with self._lock, self._connect() as conn:
            while True:
                session_id = secrets.token_urlsafe(6)
                existing = conn.execute(
                    "SELECT 1 FROM sessions WHERE id = ?", (session_id,)
                ).fetchone()
                if existing is None:
                    break
            conn.execute(
                """
                INSERT INTO sessions (id, created_at, last_accessed)
                VALUES (?, ?, ?)
                """,
                (session_id, now, now),
            )
        return session_id

    def get_session(self, session_id: str) -> dict[str, Any] | None:
        """Return a session dict by ID, or None if not found."""
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM sessions WHERE id = ?", (session_id,)
            ).fetchone()
        return dict(row) if row else None

    def touch_session(self, session_id: str) -> None:
        """Update the last_accessed timestamp of a session."""
        with self._lock, self._connect() as conn:
            conn.execute(
                "UPDATE sessions SET last_accessed = ? WHERE id = ?",
                (_utc_now_iso(), session_id),
            )

    def update_session_state(self, session_id: str, state: Any) -> None:
        """Update the state_json column for a session."""
        with self._lock, self._connect() as conn:
            conn.execute(
                "UPDATE sessions SET state_json = ? WHERE id = ?",
                (json.dumps(state), session_id),
            )

    def update_session_bookmarks(self, session_id: str, bookmarks: Any) -> None:
        """Update the bookmarks_json column for a session."""
        with self._lock, self._connect() as conn:
            conn.execute(
                "UPDATE sessions SET bookmarks_json = ? WHERE id = ?",
                (json.dumps(bookmarks), session_id),
            )
