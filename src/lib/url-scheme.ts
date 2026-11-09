import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useNavigate } from "@tanstack/react-router";
import { usePlaybackStore } from "@/lib/store/playback";

/**
 * What a `radif://` URL may do: playback and opening search. No likes,
 * playlist edits, settings or account actions, so a web page that opens one
 * can't change those; what it plays still counts as played. The URLs, documented in the README:
 * radif://play, pause, toggle, next, previous, and radif://search?q=...
 */
export type UrlAction =
  | { kind: "play" | "pause" | "toggle" | "next" | "previous" }
  | { kind: "search"; q: string };

const PLAIN = ["play", "pause", "toggle", "next", "previous"] as const;

export function parseRadifUrl(raw: string): UrlAction | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "radif:") return null;
  // radif://play has it as the host; radif:play as the path.
  const name = (url.hostname || url.pathname).replace(/^\/+|\/+$/g, "");
  const plain = PLAIN.find((p) => p === name);
  if (plain) return { kind: plain };
  if (name === "search") {
    const q = url.searchParams.get("q")?.trim();
    return q ? { kind: "search", q } : null;
  }
  return null;
}

// A page that opens links in a loop gets one action per burst, and at most
// one every 300 ms: what plays still counts as played (history, scrobbles).
const MIN_GAP_MS = 300;

/** Mounted once in AppShell: drains the URLs Rust queued
 *  (`src-tauri/src/url_scheme.rs`) on mount and on each `radif-url`. */
export function useUrlScheme(): void {
  const navigate = useNavigate();
  useEffect(() => {
    let lastAt = 0;
    const drain = async () => {
      const urls = await invoke<string[]>("radif_url_drain").catch(() => []);
      const a = urls.length ? parseRadifUrl(urls[urls.length - 1]) : null;
      if (!a || Date.now() - lastAt < MIN_GAP_MS) return;
      lastAt = Date.now();
      const pb = usePlaybackStore.getState();
      // Through toggle(), not setPlaying: it's what reaches a cast receiver.
      if (a.kind === "search") {
        void navigate({ to: "/search", search: { q: a.q } });
      } else if (a.kind === "play") {
        if (pb.queue.length > 0 && !pb.playing) pb.toggle();
      } else if (a.kind === "pause") {
        if (pb.playing) pb.toggle();
      } else if (a.kind === "toggle") {
        pb.toggle();
      } else if (a.kind === "next") {
        pb.next();
      } else {
        pb.prev();
      }
    };
    let cancelled = false;
    let dispose: (() => void) | undefined;
    // Listen first, then drain: a URL queued in between is still caught.
    void listen("radif-url", () => void drain()).then((un) => {
      if (cancelled) {
        un();
        return;
      }
      dispose = un;
      void drain();
    });
    return () => {
      cancelled = true;
      dispose?.();
    };
  }, [navigate]);
}
