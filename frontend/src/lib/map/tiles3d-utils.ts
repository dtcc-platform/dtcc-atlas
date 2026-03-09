export function parseTilesetAssetIds(value: string | undefined): number[] {
  if (!value) return [];

  const parsed = value
    .split(',')
    .map((token) => token.trim())
    .filter((token) => token.length > 0)
    .map((token) => Number.parseInt(token, 10))
    .filter((id) => Number.isInteger(id) && id > 0);

  return Array.from(new Set(parsed));
}
