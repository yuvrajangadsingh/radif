import { describe, expect, it } from "vitest";
import { InfiniteQueryObserver, QueryClient } from "@tanstack/react-query";
import { dropPlaylistEntry } from "./playlist-cache";

const row = (id: string, setVideoId: string) => ({ id, setVideoId }) as never;
type Pages = {
  pages: { trackCount?: number; tracks: { setVideoId: string }[] }[];
};

describe("dropPlaylistEntry", () => {
  it("removes the entry from the page the playlist route reads", async () => {
    const qc = new QueryClient();
    qc.setQueryData(["playlist-pages-v2", "PL1"], {
      pages: [
        { trackCount: 3, tracks: [row("a", "s1"), row("a", "s2")] },
        { tracks: [row("b", "s3")] },
      ],
      pageParams: [undefined, "c1"],
    });
    qc.setQueryData(["playlist-pages-v2", "PL2"], {
      pages: [{ tracks: [row("a", "t1")] }],
      pageParams: [undefined],
    });
    await qc.invalidateQueries({ queryKey: ["playlist-pages-v2", "PL2"] });

    await dropPlaylistEntry(qc, "PL1", "s1");

    const pl1 = qc.getQueryData<Pages>(["playlist-pages-v2", "PL1"]);
    expect(pl1?.pages.map((p) => p.tracks.map((t) => t.setVideoId))).toEqual([
      ["s2"],
      ["s3"],
    ]);
    expect(pl1?.pages[0].trackCount).toBe(2);
    const pl2 = qc.getQueryData<Pages>(["playlist-pages-v2", "PL2"]);
    expect(pl2?.pages[0].tracks.map((t) => t.setVideoId)).toEqual(["t1"]);
    // Another playlist's pending refresh survives.
    expect(qc.getQueryState(["playlist-pages-v2", "PL2"])?.isInvalidated).toBe(
      true,
    );
  });

  it("a page fetch in flight doesn't bring the row back", async () => {
    const qc = new QueryClient();
    let release: () => void = () => {};
    const obs = new InfiniteQueryObserver(qc, {
      queryKey: ["playlist-pages-v2", "PL1"],
      initialPageParam: undefined as string | undefined,
      queryFn: async ({ pageParam }) => {
        if (!pageParam)
          return { tracks: [row("a", "s1")], continuationToken: "c1" };
        await new Promise<void>((r) => (release = r));
        return { tracks: [row("b", "s2")], continuationToken: undefined };
      },
      getNextPageParam: (last: { continuationToken?: string }) =>
        last.continuationToken,
    });
    const unsub = obs.subscribe(() => {});
    await obs.refetch();
    const next = obs.fetchNextPage();

    await dropPlaylistEntry(qc, "PL1", "s1");
    release();
    await next;

    const pl1 = qc.getQueryData<Pages>(["playlist-pages-v2", "PL1"]);
    expect(
      pl1?.pages.flatMap((p) => p.tracks.map((t) => t.setVideoId)),
    ).not.toContain("s1");
    unsub();
  });

  it("a refresh in flight is started again, without the row", async () => {
    const qc = new QueryClient();
    let server = ["s1", "s2"];
    let gate: Promise<void> = Promise.resolve();
    const obs = new InfiniteQueryObserver(qc, {
      queryKey: ["playlist-pages-v2", "PL1"],
      initialPageParam: undefined as string | undefined,
      queryFn: async () => {
        const snapshot = [...server];
        await gate;
        return {
          tracks: snapshot.map((s) => row("a", s)),
          continuationToken: undefined,
        };
      },
      getNextPageParam: (last: { continuationToken?: string }) =>
        last.continuationToken,
    });
    const unsub = obs.subscribe(() => {});
    await obs.refetch();
    let release: () => void = () => {};
    gate = new Promise<void>((r) => (release = r));
    server = ["s1", "s2", "s3"]; // an Add landed; its refresh is in flight
    void obs.refetch();

    server = ["s2", "s3"];
    await dropPlaylistEntry(qc, "PL1", "s1");
    release();
    await new Promise((r) => setTimeout(r, 0));
    await qc.getQueryCache().find({ queryKey: ["playlist-pages-v2", "PL1"] })
      ?.promise;

    const pl1 = qc.getQueryData<Pages>(["playlist-pages-v2", "PL1"]);
    expect(
      pl1?.pages.flatMap((p) => p.tracks.map((t) => t.setVideoId)),
    ).toEqual(["s2", "s3"]);
    unsub();
  });

  it("a first load under the VL alias is started again", async () => {
    const qc = new QueryClient();
    let server = ["s1", "s2"];
    let release: () => void = () => {};
    let gate = new Promise<void>((r) => (release = r));
    const obs = new InfiniteQueryObserver(qc, {
      queryKey: ["playlist-pages-v2", "VLPL1"],
      initialPageParam: undefined as string | undefined,
      queryFn: async () => {
        const snapshot = [...server];
        await gate;
        return {
          tracks: snapshot.map((s) => row("a", s)),
          continuationToken: undefined,
        };
      },
      getNextPageParam: (last: { continuationToken?: string }) =>
        last.continuationToken,
    });
    const unsub = obs.subscribe(() => {});
    await new Promise((r) => setTimeout(r, 0));

    server = ["s2"];
    const first = release;
    gate = Promise.resolve();
    await dropPlaylistEntry(qc, "PL1", "s1");
    first();
    await new Promise((r) => setTimeout(r, 0));
    await qc.getQueryCache().find({ queryKey: ["playlist-pages-v2", "VLPL1"] })
      ?.promise;

    const pl = qc.getQueryData<Pages>(["playlist-pages-v2", "VLPL1"]);
    expect(pl?.pages.flatMap((p) => p.tracks.map((t) => t.setVideoId))).toEqual(
      ["s2"],
    );
    unsub();
  });
});
