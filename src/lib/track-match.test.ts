import { describe, expect, it } from "vitest";
import { trackMatches } from "./track-match";

const t = {
  id: "a",
  kind: "song" as const,
  title: "Tum Ho",
  album: "Rockstar",
  artists: [{ name: "Mohit Chauhan" }],
  thumbnails: [],
};

describe("trackMatches", () => {
  it("matches the title, album or an artist, case already folded", () => {
    expect(trackMatches(t, "tum")).toBe(true);
    expect(trackMatches(t, "rockstar")).toBe(true);
    expect(trackMatches(t, "mohit")).toBe(true);
    expect(trackMatches(t, "kun faya")).toBe(false);
    expect(trackMatches(t, "")).toBe(true);
  });
});
