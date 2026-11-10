import { describe, expect, it } from "vitest";
import type { ShelfItem } from "@/lib/innertube/types";
import { sortTracks } from "./playlist-sort";

const t = (id: string, fields: Partial<ShelfItem> = {}): ShelfItem =>
  ({ id, kind: "song", title: id, thumbnails: [], ...fields }) as ShelfItem;
const ids = (list: ShelfItem[]) => list.map((x) => x.id);

describe("sortTracks", () => {
  it("leaves playlist order alone by default", () => {
    const list = [t("b"), t("a")];
    expect(sortTracks(list, "default")).toBe(list);
  });

  it("ignores case and accents in titles", () => {
    const list = [
      t("1", { title: "zebra" }),
      t("2", { title: "Éclair" }),
      t("3", { title: "apple" }),
      t("4", { title: "eclair" }),
    ];
    // Éclair and eclair compare equal, so they keep playlist order.
    expect(ids(sortTracks(list, "title-asc"))).toEqual(["3", "2", "4", "1"]);
  });

  it("puts Track 2 before Track 10", () => {
    const list = [t("10", { title: "Track 10" }), t("2", { title: "Track 2" })];
    expect(ids(sortTracks(list, "title-asc"))).toEqual(["2", "10"]);
  });

  it("sorts Hindi and Punjabi titles by their own script order", () => {
    const list = [
      t("kh", { title: "खामोशी" }),
      t("k", { title: "कभी" }),
      t("pa", { title: "ਪਿਆਰ" }),
      t("ka", { title: "ਕਦੇ" }),
    ];
    const out = ids(sortTracks(list, "title-asc"));
    expect(out.indexOf("k")).toBeLessThan(out.indexOf("kh"));
    expect(out.indexOf("ka")).toBeLessThan(out.indexOf("pa"));
  });

  it("keeps playlist order on ties, ascending and descending", () => {
    const list = [
      t("a1", { artists: [{ name: "Same" }] }),
      t("b", { artists: [{ name: "Other" }] }),
      t("a2", { artists: [{ name: "same" }] }),
    ];
    expect(ids(sortTracks(list, "artist-asc"))).toEqual(["b", "a1", "a2"]);
    const titles = [t("x", { title: "A" }), t("y", { title: "a" })];
    expect(ids(sortTracks(titles, "title-desc"))).toEqual(["x", "y"]);
  });

  it("sorts by album, with no album last", () => {
    const list = [
      t("none"),
      t("b", { album: "Beta" }),
      t("a", { album: "alpha" }),
    ];
    expect(ids(sortTracks(list, "album-asc"))).toEqual(["a", "b", "none"]);
  });

  it("sorts by duration, unknown last both ways", () => {
    const list = [
      t("u"),
      t("long", { duration: 300 }),
      t("short", { duration: 60 }),
    ];
    expect(ids(sortTracks(list, "duration-asc"))).toEqual([
      "short",
      "long",
      "u",
    ]);
    expect(ids(sortTracks(list, "duration-desc"))).toEqual([
      "long",
      "short",
      "u",
    ]);
  });

  it("reverses for date added (oldest), without touching the input", () => {
    const list = [t("new"), t("old")];
    expect(ids(sortTracks(list, "date-added-asc"))).toEqual(["old", "new"]);
    expect(ids(list)).toEqual(["new", "old"]);
  });
});
