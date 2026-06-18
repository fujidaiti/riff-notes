// Monotonic-per-session unique id generator. Matches the legacy scheme:
// <base36 counter>-<last 4 chars of base36 timestamp>. The counter guarantees
// uniqueness within a session even if two ids are minted in the same ms.
let uidCounter = 1;

export function uid(): string {
  return (uidCounter++).toString(36) + "-" + Date.now().toString(36).slice(-4);
}

/** Test-only: reset the counter so id sequences are deterministic. */
export function resetUidCounter(): void {
  uidCounter = 1;
}
