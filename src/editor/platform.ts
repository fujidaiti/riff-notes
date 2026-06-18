// Cross-platform "create / fine-grained" modifier: Cmd on macOS, Ctrl
// elsewhere. Use this instead of checking metaKey/ctrlKey directly.
export const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.platform);

export function isCreateModifier(ev: { metaKey: boolean; ctrlKey: boolean }): boolean {
  return IS_MAC ? ev.metaKey : ev.ctrlKey;
}
