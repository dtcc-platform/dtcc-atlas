# Upload Wizard Team Review Script

Use this in a 30-minute design review.

## 1. Setup (2 min)
- Goal: validate UX direction for user-uploaded data becoming first-class in Atlas.
- Scope of this review: flow clarity and key decisions, not final UI polish.

## 2. Walkthrough (12 min)
- Frame 1: discoverability (`Upload Data` in primary workflow).
- Frame 2: low-friction file/folder drop.
- Frame 3: auto-detection transparency (confidence + warnings).
- Frame 4: user confirmation where automation is uncertain.
- Frame 5: ingestion progress and partial-failure handling.
- Frame 6: confirmation that uploaded datasets are usable immediately.

## 3. Questions To Ask The Team (10 min)
1. Is the entry point right for both novice and expert users?
2. Is detection feedback understandable enough to trust?
3. Where should we force explicit user confirmation (CRS, role, low confidence)?
4. Is partial success acceptable in v1, or do we require all-or-nothing?
5. Should upload be available to all users or role-restricted initially?

## 4. Decisions To Capture (5 min)
- Decision A: wizard container (`modal` vs `side panel` vs `page`).
- Decision B: required fields before ingest (`name`, `role`, `crs`).
- Decision C: default behavior for low-confidence detections.
- Decision D: what appears in v1 completion screen (open dataset, set as preferred source, etc.).

## 5. Immediate Follow-Up
- Convert approved flow into:
  - annotated wireframes
  - component/state map
  - API contract for scan/ingest/status
- Schedule a second review specifically for failure and recovery UX.

