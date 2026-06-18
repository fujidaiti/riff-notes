import { useEffect, useState } from "react";

export interface CellSize {
  cellW: number;
  cellH: number;
}

function read(): CellSize {
  if (typeof window === "undefined") return { cellW: 22, cellH: 22 };
  const cs = getComputedStyle(document.documentElement);
  const cellW = parseFloat(cs.getPropertyValue("--cell-w")) || 22;
  const cellH = parseFloat(cs.getPropertyValue("--cell-h")) || 22;
  return { cellW, cellH };
}

/**
 * Reads the --cell-w/--cell-h CSS variables that are the single source of truth
 * for grid cell dimensions. Re-reads on window resize (in case the theme or
 * zoom changes them).
 */
export function useCellSize(): CellSize {
  const [size, setSize] = useState<CellSize>(read);
  useEffect(() => {
    const onResize = () => setSize(read());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return size;
}
