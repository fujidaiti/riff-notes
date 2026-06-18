import type { Project } from "../core/model/types";
import { deserializeProject } from "../core/serialize";

// The embed reads its project from one of three sources, in priority order:
//   1. a global injected by the host page (window.__RIFF_PROJECT__),
//   2. a `?p=` query param holding base64url-encoded serialized JSON,
//   3. nothing -> caller falls back to a demo/empty project.
// All go through deserializeProject so the same validation applies.

declare global {
  interface Window {
    __RIFF_PROJECT__?: unknown;
  }
}

function fromBase64Url(s: string): string {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  // Decode UTF-8 bytes.
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function hydrateProject(): Project | null {
  if (typeof window === "undefined") return null;

  if (window.__RIFF_PROJECT__ != null) {
    const p = deserializeProject(window.__RIFF_PROJECT__);
    if (p) return p;
  }

  const param = new URLSearchParams(window.location.search).get("p");
  if (param) {
    try {
      return deserializeProject(JSON.parse(fromBase64Url(param)));
    } catch {
      return null;
    }
  }

  return null;
}
