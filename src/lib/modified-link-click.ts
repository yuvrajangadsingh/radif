/**
 * The router's <Link> leaves a Cmd/Ctrl/Shift/Alt click, and a middle
 * click, to the browser ("open in a new tab"). In the app's webview there
 * are no tabs: WebKit follows the href as a full page load, which restarts
 * the whole app and stops playback (QA r41). For a link inside the app,
 * such a click's page load is blocked; the click then does nothing.
 *
 * True when the click's default action should be prevented.
 */
export function blocksInAppPageLoad(
  e: {
    button: number;
    metaKey: boolean;
    ctrlKey: boolean;
    shiftKey: boolean;
    altKey: boolean;
    defaultPrevented: boolean;
  },
  a: { href: string; download: boolean } | null,
  /** The page's own URL (location.href). */
  page: string,
): boolean {
  if (e.defaultPrevented || !a || a.download) return false;
  const modified = e.metaKey || e.ctrlKey || e.shiftKey || e.altKey;
  if (!(e.button === 1 || (e.button === 0 && modified))) return false;
  // Protocol and host, not .origin: a custom scheme such as the bundled
  // app's tauri://localhost has an opaque origin ("null").
  const base = new URL(page);
  const url = new URL(a.href, base);
  return url.protocol === base.protocol && url.host === base.host;
}
