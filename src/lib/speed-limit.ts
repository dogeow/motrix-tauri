/** Smallest BT upload ceiling aria2 can enforce without block-sized bursts. */
export const MIN_STABLE_BT_UPLOAD_LIMIT = 16 * 1024;

/**
 * Normalize a user-entered speed for storage and display.
 * Bare numbers mean KiB/s. Accepts 512K, 2M, 1KB, 1.5M, and similar forms.
 */
export function normalizeSpeedLimit(
  value: string | number | null | undefined
): string {
  const raw = String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
  if (!raw || raw === "0") return "0";

  // 1KB/S, 1MB/S → drop /S; 1KIB/1MIB → K/M; 1KB/1MB → K/M.
  let speed = raw.replace(/\/S$/, "");
  speed = speed
    .replace(/KIB$/, "K")
    .replace(/MIB$/, "M")
    .replace(/GIB$/, "G");
  speed = speed
    .replace(/KB$/, "K")
    .replace(/MB$/, "M")
    .replace(/GB$/, "G");

  if (/^\d+(?:\.\d+)?$/.test(speed)) return `${speed}K`;
  if (/^\d+(?:\.\d+)?[KMG]$/.test(speed)) return speed;
  return "0";
}

/** Convert a normalized speed to integer bytes per second. */
export function speedLimitBytes(
  value: string | number | null | undefined
): number {
  const normalized = normalizeSpeedLimit(value);
  if (normalized === "0") return 0;

  const match = normalized.match(/^(\d+(?:\.\d+)?)([KMG])$/);
  if (!match) return 0;

  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) return 0;

  const multiplier =
    match[2] === "K"
      ? 1024
      : match[2] === "M"
        ? 1024 * 1024
        : 1024 * 1024 * 1024;
  return Math.round(amount * multiplier);
}

/** Clamp unsupported sub-block BT upload limits to the stable minimum. */
export function normalizeUploadSpeedLimit(
  value: string | number | null | undefined
): string {
  const normalized = normalizeSpeedLimit(value);
  const bytes = speedLimitBytes(normalized);
  return bytes > 0 && bytes < MIN_STABLE_BT_UPLOAD_LIMIT
    ? "16K"
    : normalized;
}

/** Convert a user-facing speed into the unit-bearing format aria2 expects. */
export function speedLimitToAria2(
  value: string | number | null | undefined
): string {
  const normalized = normalizeSpeedLimit(value);
  return normalized === "0" ? "0" : normalized;
}
