// Single source of truth for keyboard shortcuts. Both the keydown handler
// (useKeyboardShortcuts) and the Help dialog read from this list so the docs
// can never drift from the behavior. `mod` renders as ⌘ on macOS, Ctrl
// elsewhere.
import { IS_MAC } from "./platform";

export interface Shortcut {
  keys: string;
  description: string;
}

const mod = IS_MAC ? "⌘" : "Ctrl";

export const SHORTCUTS: Shortcut[] = [
  { keys: "Space", description: "Play / pause" },
  { keys: "Enter", description: "Rewind to start" },
  { keys: "R", description: "Record" },
  { keys: `${mod}-click empty cell`, description: "Create a note" },
  { keys: "Drag note", description: "Move; drag the edges to resize" },
  { keys: `${mod}-click note`, description: "Cycle velocity" },
  { keys: "Shift-click note", description: "Add / remove from selection" },
  { keys: "Backspace / Delete", description: "Delete selected notes" },
  { keys: `${mod}+Z / ${mod}+Shift+Z`, description: "Undo / redo" },
  { keys: `${mod}+C / ${mod}+X / ${mod}+V`, description: "Copy / cut / paste" },
  { keys: `${mod}+A`, description: "Toggle annotations" },
  { keys: `${mod}+← / ${mod}+→`, description: "Nudge selected notes ±¼ step" },
  { keys: `${mod}+S`, description: "Save project as JSON" },
  { keys: "Q", description: "Quantize selected notes" },
  { keys: "?", description: "Show this help" },
];
