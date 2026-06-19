import { useEffect, useLayoutEffect, useRef, useState } from "react";
import styles from "./ContextMenu.module.css";

export interface ContextMenuItem {
  label: string;
  onClick: () => void;
  danger?: boolean;
}

export interface ContextMenuSep {
  sep: true;
}

export type ContextMenuEntry = ContextMenuItem | ContextMenuSep;

export interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuEntry[];
  onClose: () => void;
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });

  useEffect(() => {
    const close = (ev: MouseEvent | KeyboardEvent) => {
      if ("key" in ev) {
        if (ev.key !== "Escape") return;
      } else {
        if (ref.current?.contains(ev.target as Node)) return;
      }
      onClose();
    };
    document.addEventListener("pointerdown", close, true);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close, true);
      document.removeEventListener("keydown", close);
    };
  }, [onClose]);

  // Clamp to viewport after the menu has been measured.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const left = Math.min(x, window.innerWidth - width - 4);
    const top = Math.min(y, window.innerHeight - height - 4);
    setPos({ left: Math.max(4, left), top: Math.max(4, top) });
  }, [x, y]);

  const style: React.CSSProperties = { position: "fixed", left: pos.left, top: pos.top };

  return (
    <div
      ref={ref}
      className={styles.menu}
      style={style}
    >
      {items.map((item, i) =>
        "sep" in item ? (
          <div key={i} className={styles.sep} />
        ) : (
          <button
            key={i}
            className={`${styles.item} ${item.danger ? styles.danger : ""}`}
            onClick={() => { item.onClick(); onClose(); }}
          >
            {item.label}
          </button>
        )
      )}
    </div>
  );
}
