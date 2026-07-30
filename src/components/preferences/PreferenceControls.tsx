import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { normalizeSpeedLimit } from "@/lib/speed-limit";

/** Rows share one label/control grid so every tab lines up. */
export function PreferenceRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div className="min-w-0">
        <p className="text-sm">{label}</p>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

/** aria2 speed limits are strings like "0", "512K", "2M". */
export function SpeedInput({
  value,
  onCommit,
  normalize = normalizeSpeedLimit,
  title = "0 = unlimited; bare numbers are KB/s",
}: {
  value: string;
  onCommit: (value: string) => void;
  normalize?: (value: string) => string;
  title?: string;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  const commit = () => {
    const next = normalize(draft);
    setDraft(next);
    if (next !== value) onCommit(next);
  };

  return (
    <Input
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        }
      }}
      className="w-28 text-right font-mono text-xs"
      placeholder="0"
      title={title}
    />
  );
}

export function NumberInput({
  value,
  min,
  max,
  onCommit,
}: {
  value: number;
  min: number;
  max: number;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);

  const commit = () => {
    const parsed = Number(draft);
    const next = Number.isFinite(parsed)
      ? Math.min(max, Math.max(min, parsed))
      : value;
    setDraft(String(next));
    if (next !== value) onCommit(next);
  };

  return (
    <Input
      type="number"
      min={min}
      max={max}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        }
      }}
      className="w-28 text-right"
    />
  );
}
