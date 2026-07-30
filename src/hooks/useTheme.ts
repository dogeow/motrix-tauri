import { useEffect, useState } from "react";
import { useSettingsStore } from "@/store/settings";

export type ResolvedTheme = "light" | "dark";

/** Follow the OS unless the user pinned a theme in preferences. */
export function useTheme(): ResolvedTheme {
  const theme = useSettingsStore((state) => state.settings.theme);
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() =>
    resolveTheme(theme)
  );

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const resolved = resolveTheme(theme, media.matches);
      document.documentElement.classList.toggle("dark", resolved === "dark");
      setResolvedTheme(resolved);
    };

    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);

  return resolvedTheme;
}

function resolveTheme(
  theme: "system" | ResolvedTheme,
  systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches
): ResolvedTheme {
  if (theme === "system") return systemDark ? "dark" : "light";
  return theme;
}
