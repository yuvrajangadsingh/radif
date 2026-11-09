import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlaybackState, QueueTrack } from "@/lib/store/playback";

// The store decides at import time whether to wrap itself in
// zustand/persist (main window) or stay plain (floating mirror).
// Present ourselves as the floating window so construction skips
// persist + localStorage (which isn't available under the node test
// env). `next()` — the reducer under test — is identical in both
// variants, so this only sidesteps the storage plumbing.
(globalThis as unknown as { window: unknown }).window = {
  location: { search: "?floating-player" },
};

const { usePlaybackStore, resumePoint, createThrottledStorage, noPickSince } =
  await import("@/lib/store/playback");

function track(videoId: string): QueueTrack {
  return { videoId, title: videoId, thumbnails: [] };
}

/** Reset to a known "mid-playback" baseline, then apply the overrides. */
function setup(partial: Partial<PlaybackState>): void {
  usePlaybackStore.setState({
    queue: [],
    index: -1,
    repeat: "off",
    shuffle: false,
    playing: true,
    status: "ready",
    streamUrl: "blob:prev",
    position: 42,
    pendingSeek: undefined,
    ...partial,
  });
}

describe("playback next()", () => {
  beforeEach(() => setup({}));

  it("replays the current track in place for repeat-one", () => {
    setup({ queue: [track("a"), track("b")], index: 0, repeat: "one" });
    usePlaybackStore.getState().next();
    const s = usePlaybackStore.getState();
    expect(s.index).toBe(0);
    expect(s.pendingSeek).toBe(0);
    expect(s.position).toBe(0);
    expect(s.playing).toBe(true);
  });

  it("replays in place for repeat-all on a single-track queue", () => {
    // Regression: wrapping a length-1 queue lands on the same index, so
    // the "loading" path never restarts the (already-ended) element and
    // playback used to stall on the loader — the "first click does
    // nothing" bug. It must route through pendingSeek like repeat-one.
    setup({
      queue: [track("a")],
      index: 0,
      repeat: "all",
      status: "ready",
      streamUrl: "blob:a",
    });
    usePlaybackStore.getState().next();
    const s = usePlaybackStore.getState();
    expect(s.index).toBe(0);
    expect(s.pendingSeek).toBe(0);
    expect(s.playing).toBe(true);
    // Must NOT take the load path (which would stall on a same-index track).
    expect(s.status).not.toBe("loading");
    expect(s.streamUrl).toBe("blob:a");
  });

  it("wraps a multi-track queue back to the first track for repeat-all", () => {
    setup({ queue: [track("a"), track("b")], index: 1, repeat: "all" });
    usePlaybackStore.getState().next();
    const s = usePlaybackStore.getState();
    expect(s.index).toBe(0);
    expect(s.status).toBe("loading");
    expect(s.streamUrl).toBeUndefined();
    expect(s.pendingSeek).toBeUndefined();
    expect(s.playing).toBe(true);
  });

  it("stops at the end of the queue when repeat is off", () => {
    setup({ queue: [track("a"), track("b")], index: 1, repeat: "off" });
    usePlaybackStore.getState().next();
    const s = usePlaybackStore.getState();
    expect(s.index).toBe(1);
    expect(s.playing).toBe(false);
    expect(s.position).toBe(0);
    expect(s.pendingSeek).toBe(0);
  });

  it("counts a queue end so the engine can tell it from a pause", () => {
    setup({ queue: [track("a"), track("b")], index: 0, repeat: "off" });
    const before = usePlaybackStore.getState().queueEnded;
    usePlaybackStore.getState().next();
    expect(usePlaybackStore.getState().queueEnded).toBe(before);
    usePlaybackStore.getState().next();
    expect(usePlaybackStore.getState().queueEnded).toBe(before + 1);
    expect(usePlaybackStore.getState().playing).toBe(false);
  });

  it("advances to the next track mid-queue", () => {
    setup({
      queue: [track("a"), track("b"), track("c")],
      index: 0,
      repeat: "off",
    });
    usePlaybackStore.getState().next();
    const s = usePlaybackStore.getState();
    expect(s.index).toBe(1);
    expect(s.status).toBe("loading");
    expect(s.playing).toBe(true);
  });

  it("is a no-op on an empty queue", () => {
    setup({ queue: [], index: -1, repeat: "all", playing: false });
    usePlaybackStore.getState().next();
    expect(usePlaybackStore.getState().index).toBe(-1);
  });
});

// A pending server-side shuffle continuation belongs to the queue it was
// created with — any action that replaces the queue must drop it, or the
// audio engine would append the OLD playlist's shuffle tail onto whatever
// the user played next.
describe("queueContinuation lifecycle", () => {
  beforeEach(() => setup({}));

  it("survives appends but is cleared when the queue is replaced", () => {
    setup({ queue: [track("a")], index: 0, queueContinuation: "tok1" });
    const s = usePlaybackStore.getState();
    s.appendToQueue([track("b")]);
    expect(usePlaybackStore.getState().queueContinuation).toBe("tok1");
    s.setQueue([track("c")], 0);
    expect(usePlaybackStore.getState().queueContinuation).toBeUndefined();
  });

  it("is cleared by playNow", () => {
    setup({ queue: [track("a")], index: 0, queueContinuation: "tok1" });
    usePlaybackStore.getState().playNow(track("b"));
    expect(usePlaybackStore.getState().queueContinuation).toBeUndefined();
  });

  it("is cleared by clearQueue", () => {
    setup({ queue: [track("a")], index: 0, queueContinuation: "tok1" });
    usePlaybackStore.getState().clearQueue();
    expect(usePlaybackStore.getState().queueContinuation).toBeUndefined();
  });

  it("setQueueContinuation sets and clears the token", () => {
    usePlaybackStore.getState().setQueueContinuation("tok2");
    expect(usePlaybackStore.getState().queueContinuation).toBe("tok2");
    usePlaybackStore.getState().setQueueContinuation(undefined);
    expect(usePlaybackStore.getState().queueContinuation).toBeUndefined();
  });
});

describe("resumePoint", () => {
  const t = { ...track("a"), duration: 200 };

  it("resumes the saved playhead of the current track", () => {
    expect(resumePoint(t, 73)).toEqual({ videoId: "a", seconds: 73 });
    expect(resumePoint(track("b"), 73)).toEqual({ videoId: "b", seconds: 73 });
  });

  it("starts over near the start or the end, or with nothing saved", () => {
    expect(resumePoint(t, 4)).toBeUndefined();
    expect(resumePoint(t, 195)).toBeUndefined();
    expect(resumePoint(t, undefined)).toBeUndefined();
    expect(resumePoint(undefined, 73)).toBeUndefined();
  });
});

describe("createThrottledStorage", () => {
  it("keeps writing while changes never stop, the newest value each time", () => {
    vi.useFakeTimers();
    const saved: string[] = [];
    Object.assign(globalThis.window as object, {
      setTimeout,
      clearTimeout,
      localStorage: { setItem: (_: string, v: string) => saved.push(v) },
    });
    const storage = createThrottledStorage(1000);
    // A position tick every 250 ms for 3 s: the old debounce wrote nothing.
    for (let i = 1; i <= 12; i++) {
      void storage.setItem("k", String(i));
      vi.advanceTimersByTime(250);
    }
    expect(saved).toEqual(["4", "8", "12"]);
    vi.useRealTimers();
  });
});

describe("launch resume", () => {
  const resume = { videoId: "a", seconds: 73 };

  it("survives a queue edit that keeps the track, not a seek or a new track", () => {
    usePlaybackStore.setState({
      queue: [track("x"), track("a"), track("b")],
      index: 1,
      pendingSeek: undefined,
      resumeAt: resume,
    });
    usePlaybackStore.setState({ queue: [track("a"), track("b")], index: 0 });
    expect(usePlaybackStore.getState().resumeAt).toEqual(resume);

    usePlaybackStore.setState({ pendingSeek: 20 });
    expect(usePlaybackStore.getState().resumeAt).toBeUndefined();

    usePlaybackStore.setState({ pendingSeek: undefined, resumeAt: resume });
    usePlaybackStore.setState({ index: 1 });
    expect(usePlaybackStore.getState().resumeAt).toBeUndefined();
  });
});

describe("landing on the slot already playing", () => {
  const playing = {
    queue: [track("a")],
    index: 0,
    status: "ready" as const,
    streamUrl: "blob:a",
    position: 42,
    duration: 200,
  };
  const kept = () => {
    const s = usePlaybackStore.getState();
    expect(s.status).toBe("ready");
    expect(s.streamUrl).toBe("blob:a");
    expect(s.position).toBe(42);
    expect(s.duration).toBe(200);
    expect(s.playing).toBe(true);
  };

  it("keeps playing when a queue replaces it with the same song first", () => {
    setup(playing);
    usePlaybackStore.getState().setQueue([track("a"), track("b")], 0);
    expect(usePlaybackStore.getState().queue).toHaveLength(2);
    kept();
  });

  it("keeps playing through goTo on its own slot", () => {
    setup({ ...playing, queue: [track("a"), track("b")] });
    usePlaybackStore.getState().goTo(0);
    kept();
    // Paused too: the engine sees the same slot and wouldn't reload it.
    setup({ ...playing, queue: [track("a"), track("b")], playing: false });
    usePlaybackStore.getState().goTo(0);
    kept();
  });

  it("keeps playing when Start radio replaces the queue around it", () => {
    setup(playing);
    usePlaybackStore
      .getState()
      .playNow({ kind: "song", id: "a", title: "a", thumbnails: [] }, [
        track("b"),
      ]);
    expect(usePlaybackStore.getState().queue).toHaveLength(2);
    kept();
  });

  it("keeps playing when Start radio moves it from later in the queue (QA r4 N1)", () => {
    setup({
      ...playing,
      queue: [track("x"), track("y"), track("a")],
      index: 2,
    });
    usePlaybackStore
      .getState()
      .playNow({ kind: "song", id: "a", title: "a", thumbnails: [] }, [
        track("b"),
      ]);
    expect(usePlaybackStore.getState().index).toBe(0);
    kept();
  });

  it("keeps a paused song where it paused when Start radio moves it (QA r5 N1)", () => {
    setup({
      ...playing,
      queue: [track("x"), track("y"), track("a")],
      index: 2,
      playing: false,
    });
    usePlaybackStore
      .getState()
      .playNow({ kind: "song", id: "a", title: "a", thumbnails: [] }, [
        track("b"),
      ]);
    expect(usePlaybackStore.getState().index).toBe(0);
    expect(usePlaybackStore.getState().pendingSeek).toBeUndefined();
    kept();
  });

  it("starts a finished song over when Start radio moves it", () => {
    setup({ ...playing, queue: [track("x"), track("a")], index: 1 });
    usePlaybackStore.getState().next();
    expect(usePlaybackStore.getState().pendingSeek).toBe(0);
    // The engine rewinds the paused element and consumes the seek.
    usePlaybackStore.getState().clearPendingSeek();
    usePlaybackStore
      .getState()
      .playNow({ kind: "song", id: "a", title: "a", thumbnails: [] }, [
        track("b"),
      ]);
    const s = usePlaybackStore.getState();
    expect(s.streamUrl).toBe("blob:a");
    expect(s.position).toBe(0);
    expect(s.playing).toBe(true);
  });

  it("still reloads for another song or another slot of the same song", () => {
    setup(playing);
    usePlaybackStore.getState().setQueue([track("b")], 0);
    expect(usePlaybackStore.getState().status).toBe("loading");
    setup({ ...playing, queue: [track("a"), track("a")] });
    usePlaybackStore.getState().goTo(1);
    expect(usePlaybackStore.getState().status).toBe("loading");
    expect(usePlaybackStore.getState().streamUrl).toBeUndefined();
  });

  it("reloads a failed song when its row or play is clicked (QA r8 N2)", () => {
    setup({ ...playing, status: "error", playing: false });
    const before = usePlaybackStore.getState().reloads;
    usePlaybackStore.getState().toggle();
    const s = usePlaybackStore.getState();
    expect(s.status).toBe("loading");
    expect(s.streamUrl).toBeUndefined();
    expect(s.playing).toBe(true);
    expect(s.reloads).toBe(before + 1);
    // A failed one that still wants to play pauses (the sleep timer).
    setup({ ...playing, status: "error" });
    usePlaybackStore.getState().toggle();
    expect(usePlaybackStore.getState().playing).toBe(false);
    expect(usePlaybackStore.getState().reloads).toBe(before + 1);
    // A healthy one just pauses.
    setup(playing);
    usePlaybackStore.getState().toggle();
    expect(usePlaybackStore.getState().playing).toBe(false);
    expect(usePlaybackStore.getState().streamUrl).toBe("blob:a");
  });

  it("reloads a failed song on its own slot", () => {
    setup({ ...playing, queue: [track("a"), track("b")], status: "error" });
    const before = usePlaybackStore.getState().reloads;
    usePlaybackStore.getState().goTo(0);
    expect(usePlaybackStore.getState().status).toBe("loading");
    expect(usePlaybackStore.getState().streamUrl).toBeUndefined();
    expect(usePlaybackStore.getState().reloads).toBe(before + 1);
    // A healthy one keeps playing and doesn't ask for a reload.
    setup({ ...playing, queue: [track("a"), track("b")] });
    usePlaybackStore.getState().goTo(0);
    expect(usePlaybackStore.getState().reloads).toBe(before + 1);
    setup({ ...playing, status: "error", playing: false });
    usePlaybackStore
      .getState()
      .playNow({ kind: "song", id: "a", title: "a", thumbnails: [] }, [
        track("b"),
      ]);
    expect(usePlaybackStore.getState().streamUrl).toBeUndefined();
  });

  it("reloads for two copies, a failed song and a paused load", () => {
    const radio = () =>
      usePlaybackStore
        .getState()
        .playNow({ kind: "song", id: "a", title: "a", thumbnails: [] }, [
          track("b"),
        ]);
    // Play on the second a of [a, b, a] while the first plays.
    setup({ ...playing, queue: [track("a"), track("b"), track("a")] });
    usePlaybackStore
      .getState()
      .setQueue([track("a"), track("b"), track("a")], 2);
    expect(usePlaybackStore.getState().streamUrl).toBeUndefined();
    // The same after a row above was removed: [x, a, b, a] at 3, playing at 0.
    setup({ ...playing, queue: [track("a"), track("b"), track("a")] });
    usePlaybackStore
      .getState()
      .setQueue([track("x"), track("a"), track("b"), track("a")], 3);
    expect(usePlaybackStore.getState().streamUrl).toBeUndefined();
    setup({
      ...playing,
      queue: [track("x"), track("a")],
      index: 1,
      status: "error",
    });
    radio();
    expect(usePlaybackStore.getState().streamUrl).toBeUndefined();
    // Paused while its stream was still loading.
    setup({
      ...playing,
      queue: [track("x"), track("a")],
      index: 1,
      status: "loading",
      playing: false,
    });
    radio();
    expect(usePlaybackStore.getState().streamUrl).toBeUndefined();
  });
});

describe("shuffle after Play next", () => {
  beforeEach(() => setup({}));

  it("keeps Play next songs at the top and shuffles the rest", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const rest = "cdefghijkl".split("").map(track);
    setup({ queue: [track("a"), track("b"), ...rest], index: 0 });
    const s = usePlaybackStore.getState();
    s.enqueueNext(track("x"));
    s.playNextAt(5); // "e", from Up next
    s.setShuffle(true);
    const q = usePlaybackStore.getState().queue.map((t) => t.videoId);
    expect(q.slice(0, 3)).toEqual(["a", "e", "x"]);
    // Math.random 0 makes Fisher-Yates a fixed rotation of the rest.
    expect(q.slice(3)).toEqual("cdfghijklb".split(""));
    expect(usePlaybackStore.getState().index).toBe(0);
    vi.restoreAllMocks();
  });

  it("keeps them at the top when a queue is set with shuffle on (Undo)", () => {
    const queue = [track("a"), { ...track("x"), queuedNext: true }];
    queue.push(..."bcdefgh".split("").map(track));
    setup({ shuffle: true });
    usePlaybackStore.getState().setQueue(queue, 0);
    const q = usePlaybackStore.getState().queue.map((t) => t.videoId);
    expect(q.slice(0, 2)).toEqual(["a", "x"]);
  });

  it("uses up the place when a removed row or a new queue makes it current", () => {
    setup({ queue: [track("a"), track("b")], index: 0 });
    usePlaybackStore.getState().enqueueNext(track("x"));
    usePlaybackStore.getState().removeAt(0);
    expect(usePlaybackStore.getState().queue[0].queuedNext).toBeUndefined();
    setup({});
    usePlaybackStore
      .getState()
      .setQueue([{ ...track("y"), queuedNext: true }, track("z")], 0);
    expect(usePlaybackStore.getState().queue[0].queuedNext).toBeUndefined();
  });

  it("uses up a song's place once it's reached", () => {
    setup({ queue: [track("a"), track("b"), track("c")], index: 0 });
    usePlaybackStore.getState().enqueueNext(track("x"));
    usePlaybackStore.getState().next();
    expect(usePlaybackStore.getState().queue[1].queuedNext).toBeUndefined();
    usePlaybackStore.getState().playNextAt(3);
    usePlaybackStore.getState().goTo(2);
    expect(usePlaybackStore.getState().queue[2].queuedNext).toBeUndefined();
    // Skipped past, then reached with Previous.
    setup({ queue: [track("a"), track("b")], index: 0, position: 0 });
    usePlaybackStore.getState().enqueueNext(track("x"));
    usePlaybackStore.getState().goTo(2);
    usePlaybackStore.setState({ position: 0 });
    usePlaybackStore.getState().prev();
    expect(usePlaybackStore.getState().index).toBe(1);
    expect(usePlaybackStore.getState().queue[1].queuedNext).toBeUndefined();
  });

  it("lets a dragged Play next song be shuffled (QA r9 N2)", () => {
    setup({ queue: "abcdef".split("").map(track), index: 0 });
    usePlaybackStore.getState().playNextAt(4); // "e" to the top
    usePlaybackStore.getState().moveTrack(1, 4); // dragged down
    expect(usePlaybackStore.getState().queue[4].queuedNext).toBeUndefined();
  });

  it("moves an Up next row right after the playing song", () => {
    setup({ queue: [track("a"), track("b"), track("c")], index: 1 });
    usePlaybackStore.getState().playNextAt(0); // history row: ignored
    usePlaybackStore.getState().playNextAt(1); // the playing one: ignored
    expect(usePlaybackStore.getState().queue.map((t) => t.videoId)).toEqual([
      "a",
      "b",
      "c",
    ]);
    usePlaybackStore.getState().playNextAt(2);
    const s = usePlaybackStore.getState();
    expect(s.queue[2].queuedNext).toBe(true);
    expect(s.index).toBe(1);
  });
});

describe("Undo after Clear queue (QA r9)", () => {
  it("puts the queue back where it was, paused or playing", () => {
    const queue = [track("a"), track("b"), track("c")];
    for (const playing of [false, true]) {
      setup({
        queue,
        index: 1,
        position: 6.7,
        playing,
        queueContinuation: "t",
      });
      usePlaybackStore.getState().clearQueue();
      expect(usePlaybackStore.getState().queue).toHaveLength(0);
      usePlaybackStore.getState().undoClear();
      const s = usePlaybackStore.getState();
      expect(s.queue).toBe(queue);
      expect(s.index).toBe(1);
      expect(s.playing).toBe(playing);
      expect(s.position).toBe(6.7);
      expect(s.resumeAt).toEqual({ videoId: "b", seconds: 6.7 });
      expect(s.queueContinuation).toBe("t");
      expect(s.cleared).toBeUndefined();
    }
  });

  it("drops a seek meant for what played since the clear", () => {
    setup({ queue: [track("a")], index: 0, position: 73, playing: false });
    usePlaybackStore.getState().clearQueue();
    usePlaybackStore.getState().playNow(track("b"));
    usePlaybackStore.setState({ pendingSeek: 20 });
    usePlaybackStore.getState().undoClear();
    const s = usePlaybackStore.getState();
    expect(s.pendingSeek).toBeUndefined();
    expect(s.resumeAt).toEqual({ videoId: "a", seconds: 73 });
  });

  it("does nothing without a clear to undo", () => {
    setup({ queue: [track("a")], index: 0, cleared: undefined });
    usePlaybackStore.getState().undoClear();
    expect(usePlaybackStore.getState().queue).toHaveLength(1);
  });
});

describe("noPickSince (QA r13 N1)", () => {
  it("turns false on the listener's queue actions only", () => {
    setup({ queue: [track("a"), track("b"), track("c")], index: 0 });
    const still = noPickSince();
    usePlaybackStore.getState().patchTrackDuration("b", 200);
    usePlaybackStore.getState().next();
    usePlaybackStore.getState().appendToQueue([track("r")]);
    expect(still()).toBe(true);
    usePlaybackStore.getState().goTo(0);
    expect(still()).toBe(false);
    for (const act of [
      () => usePlaybackStore.getState().playNextAt(3),
      () => usePlaybackStore.getState().setQueue([track("a"), track("b")], 1),
      () => usePlaybackStore.getState().enqueueNext(track("n")),
    ]) {
      const fresh = noPickSince();
      act();
      expect(fresh()).toBe(false);
    }
  });
});
