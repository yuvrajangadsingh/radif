import { describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/plugin-http", () => ({ fetch: vi.fn() }));

import { pickBest, type LyricsSource } from "./sources";
import { useLyricsSkip } from "./skip";
import type { Lyrics } from "./types";

const timed: Lyrics = { kind: "timed", lines: [{ start: 0, text: "a" }] };
const plain: Lyrics = { kind: "plain", text: "a" };

describe("pickBest", () => {
  const data: Partial<Record<LyricsSource, Lyrics | null>> = {
    ytmusic: plain,
    lrclib: timed,
  };
  const get = (s: LyricsSource) => data[s];

  it("prefers timed, then source order", () => {
    expect(pickBest(get, [])).toBe("lrclib");
  });

  it("passes over skipped sources, timed first", () => {
    expect(pickBest(get, ["lrclib"])).toBe("ytmusic");
    expect(pickBest(get, ["ytmusic", "lrclib"])).toBe(null);
  });
});

describe("pickBest with off-title YouTube Music text (QA r8 N1)", () => {
  // QA round 8's six titles that are never sung: YouTube Music's plain text
  // for their videos fails the title check against the right lyrics.
  const titles = [
    "Subterranean Homesick Blues",
    "Smells Like Teen Spirit",
    "Bullet with Butterfly Wings",
    "Motion Picture Soundtrack",
    "Desert Island Disk",
    "Tomorrow Never Knows",
  ];
  const marked: Lyrics = { kind: "plain", text: "a", offTitle: true };

  it.each(titles)("%s: LRCLIB wins when it has anything", () => {
    for (const lrclib of [timed, plain]) {
      const d = { ytmusic: marked, lrclib };
      expect(pickBest((s) => d[s], [])).toBe("lrclib");
    }
  });

  it.each(titles)("%s: shown when LRCLIB answers with nothing", () => {
    for (const lrclib of [null, undefined]) {
      const d = { ytmusic: marked, lrclib };
      expect(
        pickBest(
          (s) => d[s],
          [],
          () => true,
        ),
      ).toBe("ytmusic");
    }
  });

  it.each(titles)("%s: held back while LRCLIB is still looking", () => {
    const d = { ytmusic: marked, lrclib: undefined };
    expect(
      pickBest(
        (s) => d[s],
        [],
        (s) => s === "ytmusic",
      ),
    ).toBeNull();
  });
});

describe("useLyricsSkip", () => {
  it("keeps the 200 most recently touched tracks", () => {
    const { skip } = useLyricsSkip.getState();
    for (let i = 0; i < 205; i++) skip(`v${i}`, "lrclib");
    skip("v0", "ytmusic");
    const byVideo = useLyricsSkip.getState().byVideo;
    expect(Object.keys(byVideo)).toHaveLength(200);
    // v0..v5 fell off; v0 came back as the newest.
    expect(byVideo.v5).toBeUndefined();
    expect(byVideo.v6).toEqual(["lrclib"]);
    expect(byVideo.v0).toEqual(["ytmusic"]);
    expect(byVideo.v204).toEqual(["lrclib"]);
    skip("v204", "ytmusic");
    expect(useLyricsSkip.getState().byVideo.v204).toEqual([
      "lrclib",
      "ytmusic",
    ]);
    useLyricsSkip.getState().reset("v204");
    expect(useLyricsSkip.getState().byVideo.v204).toBeUndefined();
  });
});
