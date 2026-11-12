import { describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import {
  invalidateLikedLists,
  markLibraryPlaylistsStale,
  markLibraryTracksStale,
} from "./liked-cache";

const tick = () => new Promise((r) => setTimeout(r, 0));

describe("invalidateLikedLists", () => {
  it("marks every list built from Liked songs stale, and nothing else", async () => {
    const qc = new QueryClient();
    const keys = [
      ["library", "liked-songs-pages"],
      ["library", "liked-songs-all"],
      ["playlist-pages-v2", "LM"],
      ["playlist-pages-v2", "VLLM"],
      ["library-tracks"],
      ["playlist-pages-v2", "PLxLMy"],
      ["library", "playlists"],
    ];
    for (const k of keys) qc.setQueryData(k, { pages: [] });

    invalidateLikedLists(qc);
    await tick();

    const stale = keys.map((k) => qc.getQueryState(k)?.isInvalidated);
    expect(stale).toEqual([true, true, true, true, true, false, false]);
  });
});

describe("markLibraryTracksStale", () => {
  it("an older walk still in flight can't land as fresh", async () => {
    const qc = new QueryClient();
    let release: (v: string[]) => void = () => {};
    const walk = qc
      .fetchQuery({
        queryKey: ["library-tracks"],
        queryFn: () => new Promise<string[]>((r) => (release = r)),
      })
      .catch(() => {});

    markLibraryTracksStale(qc);
    await tick();
    release(["old"]);
    await walk;

    expect(qc.getQueryData(["library-tracks"])).toBeUndefined();
  });
});

describe("markLibraryPlaylistsStale", () => {
  it("a first load still in flight can't land as fresh", async () => {
    const qc = new QueryClient();
    let release: (v: string[]) => void = () => {};
    const load = qc
      .fetchQuery({
        queryKey: ["library", "playlists"],
        queryFn: () => new Promise<string[]>((r) => (release = r)),
      })
      .catch(() => {});

    markLibraryPlaylistsStale(qc);
    await tick();
    release(["old"]);
    await load;

    expect(qc.getQueryData(["library", "playlists"])).toBeUndefined();
  });
});
