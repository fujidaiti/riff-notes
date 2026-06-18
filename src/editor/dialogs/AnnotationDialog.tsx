import { useEffect, useState } from "react";
import type { Annotation } from "../../core/model/types";
import { useDispatch } from "../../state/context";
import { Dialog } from "./Dialog";
import styles from "./Dialog.module.css";

export function AnnotationDialog({
  sheetId,
  annotation,
  open,
  onClose,
}: {
  sheetId: string;
  annotation: Annotation | null;
  open: boolean;
  onClose: () => void;
}) {
  const dispatch = useDispatch();
  const [text, setText] = useState("");

  useEffect(() => {
    if (annotation) setText(annotation.text);
  }, [annotation]);

  if (!annotation) return null;

  return (
    <Dialog open={open} onClose={onClose} title="Annotation">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        style={{ width: "100%", boxSizing: "border-box", font: "inherit" }}
        autoFocus
      />
      <div className={styles.row} style={{ justifyContent: "space-between" }}>
        <button
          className={styles.toggle}
          onClick={() => {
            dispatch({ type: "DELETE_ANNOTATION", sheetId, id: annotation.id });
            onClose();
          }}
        >
          Delete
        </button>
        <span>
          <button className={styles.toggle} onClick={onClose}>
            Cancel
          </button>
          <button
            className={`${styles.toggle} ${styles.on}`}
            onClick={() => {
              dispatch({ type: "UPDATE_ANNOTATION", sheetId, id: annotation.id, text });
              onClose();
            }}
          >
            Save
          </button>
        </span>
      </div>
    </Dialog>
  );
}
