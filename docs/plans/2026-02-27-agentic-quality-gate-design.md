# Agentic Quality Gate & Catalog Curation

**Date:** 2026-02-27
**Status:** Draft

## Problem

The upload wizard (v1) ingests files into a versioned catalog but has no quality
checks, no ownership tracking, and no mechanism to detect issues before or after
ingestion. Files belong to everyone, duplicates create silent new versions, and
corrupt or misconfigured data enters the catalog unchecked.

## Goals

1. **Data quality gate** — an AI agent inspects uploaded files between upload and
   ingest, returning advisory pass/warn/fail verdicts with natural-language
   explanations.
2. **Post-upload catalog curation** — on-demand agent review of the full catalog
   to detect duplicates, inconsistencies, and health issues.

## Non-goals

- Authentication / multi-tenant ownership (separate effort)
- Hard-blocking ingestion on agent failures
- Scheduled/automatic curation (on-demand only for v1)

---

## Architecture

```
Browser (Svelte)
  Upload Wizard                        Dataset Catalog
  ┌─────────────────────────┐          ┌─────────────────────┐
  │ 1. Select files         │          │ "Review Catalog"    │
  │ 2. Review candidates    │          │      [button]       │
  │    [Analyze Quality]    │          │         │           │
  │     ↓ SSE stream        │          │         ↓ SSE       │
  │    ✓ pass / ⚠ warn / ✗  │          │  Health report      │
  │ 3. Ingest               │          │  Duplicates, issues │
  └─────────────────────────┘          └─────────────────────┘
              │                                  │
     POST /quality-check                POST /catalog-review
              │                                  │
  Atlas Backend (FastAPI)
  ┌──────────────────────────────────────────────────────────┐
  │  quality_gate.py              catalog_review.py          │
  │  Spawns claude -p             Spawns claude -p           │
  │  Parses JSON verdict          Parses JSON report         │
  │  Streams via SSE              Streams via SSE            │
  └────────────────────┬─────────────────────┬───────────────┘
                       │ subprocess (stdio)  │
  Claude CLI (claude -p)
  with dtcc-agent MCP tools
  ┌──────────────────────────────────────────────────────────┐
  │  Tools: load → inspect_object → spatial_query → render   │
  │  Returns: structured JSON verdict/report                 │
  └──────────────────────────────────────────────────────────┘
```

### Integration pattern

Atlas backend spawns `claude -p` (Claude CLI print mode) as a subprocess with:
- A structured prompt containing file paths and candidate metadata
- `--output-format json` for parseable results
- `--mcp-config` pointing to a config file that registers dtcc-agent as an MCP
  server

This avoids needing an Anthropic API key in the backend — Claude CLI uses its own
authentication. The dtcc-agent MCP server gives Claude access to 25+ geospatial
tools and 109 dtcc-core operations.

### MCP configuration

```json
{
  "mcpServers": {
    "dtcc-agent": {
      "command": "conda",
      "args": ["run", "-n", "fenicsx-env", "python", "-m", "dtcc_agent"]
    }
  }
}
```

---

## Quality Gate: per-candidate checks

### Checks performed

| Check               | dtcc-agent tools used         | Verdict           |
|---------------------|-------------------------------|-------------------|
| File loadable       | `run_operation("io.load_*")`  | fail if corrupt   |
| CRS present & valid | `inspect_object` → CRS field  | warn if missing   |
| CRS matches coords  | `inspect_object` → bounds+CRS | warn on mismatch  |
| Bounds reasonable    | `inspect_object` / `spatial_query` | warn/fail    |
| Point cloud classes  | `inspect_object` → classification | warn if 100% unclassified |
| Feature count        | `inspect_object` → count      | fail if zero      |
| Geometry validity    | `inspect_object`              | warn on issues    |
| Duplicate detection  | SHA256 vs catalog entries     | warn if duplicate |
| Thumbnail            | `render_object` → PNG         | always generate   |

### Standardized issue codes

```
CORRUPT_FILE      - file cannot be loaded (fail)
MISSING_CRS       - no coordinate reference system (warn)
CRS_MISMATCH      - CRS doesn't match coordinate values (warn)
BOUNDS_DEGENERATE - zero-area or implausible bounds (warn)
BOUNDS_OFFWORLD   - coordinates outside valid range (fail)
EMPTY_DATASET     - zero features/points (fail)
LOW_FEATURES      - suspiciously few features (warn)
UNCLASSIFIED      - point cloud fully unclassified (warn)
EXACT_DUPLICATE   - SHA256 matches existing catalog entry (warn)
GEOMETRY_ERRORS   - invalid geometries detected (warn)
```

### Prompt structure

```
You are a geospatial data quality inspector for the DTCC Atlas platform.
You have access to dtcc-agent MCP tools for loading and inspecting files.

## Task
Inspect the following upload candidates and return a quality verdict for each.

## Candidates
1. Name: "{name}", Type: {type}, Path: {abs_path}
   Sidecars: {sidecar_list}
...

## Existing catalog datasets (for duplicate detection)
{catalog_summary_with_sha256}

## Instructions
For each candidate:
1. Load the file using the appropriate io operation
2. Inspect the loaded object for CRS, bounds, feature count, metadata
3. Check for issues (missing CRS, degenerate bounds, corrupt data, duplicates)
4. Render a thumbnail if possible
5. Return your verdict as JSON

## Output format
Return ONLY a JSON object:
{
  "candidates": [
    {
      "name": "...",
      "verdict": "pass" | "warn" | "fail",
      "issues": [
        {"severity": "warn", "code": "MISSING_CRS", "message": "..."}
      ],
      "metadata": {"crs": "...", "bounds": [...], "feature_count": 1234},
      "thumbnail_path": "...",
      "summary": "Human-readable summary"
    }
  ]
}
```

---

## Catalog Curation: on-demand review

Triggered by "Review Catalog" button in the dataset management view.

### Checks performed

| Check                  | What it catches                                    |
|------------------------|----------------------------------------------------|
| Cross-dataset duplicates | Same data under different names (SHA256 + bounds) |
| Stale versions         | Old versions superseded by newer uploads           |
| CRS inconsistency      | Datasets in same area using different CRS          |
| Coverage gaps          | Missing data types for a geographic area           |
| Naming consistency     | Inconsistent naming conventions across datasets    |

### Output

Health report JSON streamed via SSE, displayed as a dashboard card with issues
grouped by dataset and severity.

---

## Data model changes

New columns on existing tables (no new tables):

```sql
-- upload_batches
ALTER TABLE upload_batches ADD COLUMN quality_check_status TEXT;
  -- NULL | "running" | "completed" | "failed"
ALTER TABLE upload_batches ADD COLUMN quality_check_result TEXT;
  -- Full agent verdict JSON

-- upload_candidates
ALTER TABLE upload_candidates ADD COLUMN verdict TEXT;
  -- "pass" | "warn" | "fail" | NULL
ALTER TABLE upload_candidates ADD COLUMN verdict_issues TEXT;
  -- JSON array of issue objects
ALTER TABLE upload_candidates ADD COLUMN verdict_summary TEXT;
  -- Natural language summary from agent
ALTER TABLE upload_candidates ADD COLUMN thumbnail_path TEXT;
  -- Path to rendered thumbnail PNG

-- uploaded_datasets
ALTER TABLE uploaded_datasets ADD COLUMN last_review_at TEXT;
  -- Timestamp of last catalog curation review
ALTER TABLE uploaded_datasets ADD COLUMN review_issues TEXT;
  -- JSON array of issues found during review
```

---

## New backend files

| File                          | Purpose                                    |
|-------------------------------|--------------------------------------------|
| `server/upload/quality_gate.py` | Spawn claude -p, parse verdict, update DB |
| `server/upload/catalog_review.py` | Spawn claude -p for catalog-wide scan   |
| `server/upload/sse.py`        | SSE streaming helper (shared)              |
| `.mcp.json` (project root)    | MCP config for claude -p subprocess        |

## New API endpoints

| Method | Path                                              | Purpose            |
|--------|---------------------------------------------------|--------------------|
| POST   | `/api/v1/uploads/batches/{id}/quality-check`      | Trigger quality gate |
| GET    | `/api/v1/uploads/batches/{id}/quality-check/stream` | SSE verdict stream |
| POST   | `/api/v1/catalog/review`                          | Trigger catalog review |
| GET    | `/api/v1/catalog/review/stream`                   | SSE report stream  |

## Frontend changes

- **UploadWizard.svelte:** "Analyze Quality" button in step 2 (review). Verdict
  badges per candidate (pass/warn/fail). Expandable explanations. Thumbnails.
- **Dataset catalog view:** "Review Catalog" button. Health report panel with
  issues grouped by dataset.

---

## Cost & latency

- Quality gate: ~10-30s per batch, ~$0.01-0.05 per candidate (Claude CLI usage)
- Catalog review: ~30-60s for typical catalog, cost scales with dataset count
- Both are on-demand and advisory — they never block the user
