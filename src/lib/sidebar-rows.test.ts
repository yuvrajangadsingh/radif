import { describe, expect, it } from "vitest";
import { sidebarSections } from "./sidebar-rows";

const pl = (id: string) => ({ id, title: id });
const ids = (rows: { id: string }[]) => rows.map((r) => r.id);

describe("sidebarSections", () => {
  const library = ["VLLM", "A", "B", "C", "D", "E"].map(pl);
  const folder = (id: string, playlistIds: string[]) => ({
    id,
    name: id,
    playlistIds,
    collapsed: false,
  });

  it("orders pinned, then folders, then the rest, and leaves out hidden and Liked", () => {
    const s = sidebarSections({
      library,
      pinned: [pl("D"), pl("SEARCHED")],
      hidden: ["E"],
      folders: [folder("f1", ["C", "A"]), folder("f2", [])],
      likedId: "VLLM",
    });
    expect(ids(s.pinned)).toEqual(["D", "SEARCHED"]);
    expect(s.pinned.map((r) => r.inLibrary)).toEqual([true, false]);
    // Library order inside a folder, not the order they were filed.
    expect(s.folders.map((f) => [f.folder.id, ids(f.rows)])).toEqual([
      ["f1", ["A", "C"]],
      ["f2", []],
    ]);
    expect(ids(s.rest)).toEqual(["B"]);
  });

  it("is the old order with no folders", () => {
    const s = sidebarSections({
      library,
      pinned: [pl("C")],
      hidden: [],
      folders: [],
      likedId: "VLLM",
    });
    expect([...ids(s.pinned), ...ids(s.rest)]).toEqual([
      "C",
      "A",
      "B",
      "D",
      "E",
    ]);
  });

  it("doesn't show a filed id the library no longer has", () => {
    const s = sidebarSections({
      library,
      pinned: [],
      hidden: [],
      folders: [folder("f1", ["GONE", "B"])],
      likedId: "VLLM",
    });
    expect(ids(s.folders[0].rows)).toEqual(["B"]);
  });
});
