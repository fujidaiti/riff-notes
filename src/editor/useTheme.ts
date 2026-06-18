import { useCallback, useEffect, useState } from "react";

type ThemePref = "auto" | "light" | "dark";
const THEME_KEY = "riff-notes:theme";
const CYCLE: ThemePref[] = ["auto", "light", "dark"];
const LABELS: Record<ThemePref, string> = { auto: "Auto", light: "Light", dark: "Dark" };

function applyTheme(pref: ThemePref): void {
  const mql = window.matchMedia?.("(prefers-color-scheme: dark)");
  const dark = pref === "dark" || (pref === "auto" && (mql?.matches ?? false));
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}

function readPref(): ThemePref {
  try {
    const v = localStorage.getItem(THEME_KEY);
    if (v === "light" || v === "dark" || v === "auto") return v;
  } catch {
    // ignore
  }
  return "auto";
}

// Apply theme before first React render to avoid flash (called at module load).
if (typeof window !== "undefined") applyTheme(readPref());

export function useTheme() {
  const [pref, setPref] = useState<ThemePref>(readPref);

  useEffect(() => {
    if (pref !== "auto") return;
    const mql = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!mql) return;
    const onChange = () => applyTheme("auto");
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [pref]);

  const cycle = useCallback(() => {
    setPref((cur) => {
      const next = CYCLE[(CYCLE.indexOf(cur) + 1) % CYCLE.length];
      try { localStorage.setItem(THEME_KEY, next); } catch { /* ignore */ }
      applyTheme(next);
      return next;
    });
  }, []);

  return { pref, label: LABELS[pref], cycle };
}
