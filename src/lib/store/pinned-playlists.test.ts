import { beforeEach, describe, expect, it } from "vitest";
import { usePinnedPlaylistsStore } from "./pinned-playlists";

const store = () => usePinnedPlaylistsStore.getState();
const folders = () => store().foldersByAccount.acct ?? [];

beforeEach(() => {
  usePinnedPlaylistsStore.setState({
    activeAccountId: "acct",
    byAccount: {},
    hiddenByAccount: {},
    foldersByAccount: {},
  });
});

describe("playlist folders", () => {
  it("a playlist is in one place: moving into a folder unpins it and takes it out of another", () => {
    store().pin({ id: "PL1", title: "One" });
    const a = store().createFolder("A", "PL1")!;
    expect(store().byAccount.acct).toEqual([]);
    expect(folders()[0].playlistIds).toEqual(["PL1"]);

    const b = store().createFolder("B")!;
    store().moveToFolder("PL1", b);
    expect(folders().map((f) => [f.id, f.playlistIds])).toEqual([
      [a, []],
      [b, ["PL1"]],
    ]);
  });

  it("pinning or hiding takes a playlist out of its folder", () => {
    store().createFolder("A", "PL1");
    store().createFolder("B", "PL2");
    store().pin({ id: "PL1", title: "One" });
    store().hide("PL2");
    expect(folders().map((f) => f.playlistIds)).toEqual([[], []]);
    expect(store().hiddenByAccount.acct).toEqual(["PL2"]);
  });

  it("deleting a folder leaves its playlists unfiled", () => {
    const a = store().createFolder("A", "PL1")!;
    store().deleteFolder(a);
    expect(folders()).toEqual([]);
    expect(store().byAccount.acct ?? []).toEqual([]);
  });

  it("renames and toggles collapse", () => {
    const a = store().createFolder("A")!;
    store().renameFolder(a, "Gym");
    store().toggleFolder(a);
    expect(folders()[0]).toMatchObject({ name: "Gym", collapsed: true });
  });

  it("does nothing signed out", () => {
    usePinnedPlaylistsStore.setState({ activeAccountId: null });
    expect(store().createFolder("A")).toBeNull();
    expect(store().foldersByAccount).toEqual({});
  });
});
