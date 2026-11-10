import { beforeEach, describe, expect, it } from "vitest";
import { usePinnedPlaylistsStore } from "./pinned-playlists";
import {
  byHiddenArtist,
  hiddenArtists,
  useHiddenArtistsStore,
} from "./hidden-artists";

const store = () => useHiddenArtistsStore.getState();

beforeEach(() => {
  usePinnedPlaylistsStore.setState({ activeAccountId: "acct" });
  useHiddenArtistsStore.setState({ byAccount: {} });
});

describe("hidden artists", () => {
  it("hides and unhides by id, per account", () => {
    store().hide({ id: "UC1", name: "One" });
    expect(hiddenArtists()).toEqual({ UC1: "One" });
    usePinnedPlaylistsStore.setState({ activeAccountId: "other" });
    expect(hiddenArtists()).toEqual({});
    usePinnedPlaylistsStore.setState({ activeAccountId: "acct" });
    store().unhide("UC1");
    expect(hiddenArtists()).toEqual({});
  });

  it("an empty name still hides and unhides", () => {
    store().hide({ id: "UC1", name: "" });
    expect(byHiddenArtist({ artists: [{ id: "UC1" }] })).toBe(true);
    store().unhide("UC1");
    expect(hiddenArtists()).toEqual({});
  });

  it("Undo after an account switch unhides in the account it hid in", () => {
    store().hide({ id: "UC1", name: "One" });
    usePinnedPlaylistsStore.setState({ activeAccountId: "other" });
    store().hide({ id: "UC1", name: "One" });
    store().unhide("UC1", "acct");
    expect(store().byAccount).toEqual({ acct: {}, other: { UC1: "One" } });
  });

  it("does nothing signed out", () => {
    usePinnedPlaylistsStore.setState({ activeAccountId: null });
    store().hide({ id: "UC1", name: "One" });
    expect(store().byAccount).toEqual({});
  });

  it("matches by artist id, not name", () => {
    store().hide({ id: "UC1", name: "Same Name" });
    expect(byHiddenArtist({ artists: [{ id: "UC2" }, { id: "UC1" }] })).toBe(
      true,
    );
    // A namesake with another id, or a row with no ids, isn't caught.
    expect(byHiddenArtist({ artists: [{ id: "UC9" }] })).toBe(false);
    expect(byHiddenArtist({ artists: [{}] })).toBe(false);
    expect(byHiddenArtist({})).toBe(false);
  });
});
