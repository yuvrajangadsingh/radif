import { describe, expect, it, vi } from "vitest";
import type { QueueTrack } from "@/lib/store/playback";

// Same floating-window stub as playback.test.ts: no persist, no storage.
(globalThis as unknown as { window: unknown }).window = {
  location: { search: "?floating-player" },
  addEventListener: () => {},
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
};

// The feature ships hidden; test it as it will run once shipped.
vi.mock("@/lib/store/hidden-artists", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  HIDE_ARTIST_SHIPPED: true,
}));

const { usePlaybackStore } = await import("@/lib/store/playback");
const { useHiddenArtistsStore } = await import("@/lib/store/hidden-artists");
const { usePinnedPlaylistsStore } =
  await import("@/lib/store/pinned-playlists");
const { useSettingsStore } = await import("@/lib/store/settings");

const track = (videoId: string, artistId?: string): QueueTrack => ({
  videoId,
  title: videoId,
  thumbnails: [],
  artists: [{ id: artistId, name: artistId ?? "?" }],
});

function setup(queue: QueueTrack[], index: number, repeat = "off") {
  usePinnedPlaylistsStore.setState({ activeAccountId: "acct" });
  useHiddenArtistsStore.setState({
    byAccount: { acct: { UCHIDDEN: "Hidden" } },
  });
  useSettingsStore.setState({ skipDisliked: false });
  usePlaybackStore.setState({
    queue,
    index,
    repeat: repeat as "off",
    shuffle: false,
    playing: true,
  });
}

describe("next() passes over hidden artists", () => {
  it("skips their songs even with Skip disliked off", () => {
    setup([track("a", "UC1"), track("b", "UCHIDDEN"), track("c", "UC2")], 0);
    usePlaybackStore.getState().next();
    expect(usePlaybackStore.getState().index).toBe(2);
  });

  it("matches any credited artist, by id", () => {
    const feat: QueueTrack = {
      ...track("b"),
      artists: [
        { id: "UC1", name: "Main" },
        { id: "UCHIDDEN", name: "Hidden" },
      ],
    };
    setup([track("a", "UC1"), feat, track("c", "UC2")], 0);
    usePlaybackStore.getState().next();
    expect(usePlaybackStore.getState().index).toBe(2);
  });

  it("stops when only hidden songs are left", () => {
    setup([track("a", "UC1"), track("b", "UCHIDDEN")], 0);
    usePlaybackStore.getState().next();
    expect(usePlaybackStore.getState().playing).toBe(false);
  });

  it("doesn't repeat a hidden artist's song under repeat one", () => {
    setup([track("a", "UCHIDDEN"), track("b", "UC1")], 0, "one");
    usePlaybackStore.getState().next();
    expect(usePlaybackStore.getState().index).toBe(1);
  });

  it("plays a song whose artists carry no id", () => {
    setup([track("a", "UC1"), track("b"), track("c", "UC2")], 0);
    usePlaybackStore.getState().next();
    expect(usePlaybackStore.getState().index).toBe(1);
  });
});
