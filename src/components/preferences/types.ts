import type { Settings } from "@/store/settings";

export type UpdateSetting = <Key extends keyof Settings>(
  key: Key,
  value: Settings[Key]
) => void;
