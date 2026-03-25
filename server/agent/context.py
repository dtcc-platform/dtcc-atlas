"""Build context string for agent system prompt from Atlas session state."""


def build_context(
    client_context: dict,
    available_datasets: list[str],
) -> str:
    """Build a context block to append to the agent system prompt.

    Args:
        client_context: Dict from WebSocket message with keys:
            - bbox: list[float] | None (EPSG:3006 coordinates)
            - activeDataset: str | None
        available_datasets: List of dataset names from dtcc_core.datasets.list()

    Returns:
        Multi-line context string for system prompt injection.
    """
    lines = ["Current Atlas session context:"]

    bbox = client_context.get("bbox")
    if bbox and isinstance(bbox, list) and len(bbox) == 4:
        lines.append(f"- Bounding box: [{', '.join(str(v) for v in bbox)}] (EPSG:3006)")

    active = client_context.get("activeDataset")
    if active:
        lines.append(f"- Active dataset in UI: {active}")

    if available_datasets:
        names = ", ".join(available_datasets)
        lines.append(f"- Available datasets: [{names}]")

    return "\n".join(lines)
