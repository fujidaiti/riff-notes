import { useEffect, useRef } from "react";
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

  // Clamp to viewport after mount.
  const style: React.CSSProperties = { position: "fixed", left: x, top: y };

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
