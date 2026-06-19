import { SHORTCUTS } from "../shortcuts";
import { Dialog } from "./Dialog";

export function HelpDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Keyboard & Mouse Shortcuts">
      <table style={{ borderCollapse: "collapse", fontSize: 13 }}>
        <tbody>
          {SHORTCUTS.map((s) => (
            <tr key={s.keys}>
              <td style={{ padding: "4px 12px 4px 0", whiteSpace: "nowrap", color: "var(--ink-soft)" }}>{s.keys}</td>
              <td style={{ padding: "4px 0" }}>{s.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Dialog>
  );
}
