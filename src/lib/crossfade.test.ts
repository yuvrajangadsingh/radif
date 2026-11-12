import { describe, expect, it } from "vitest";
import {
  effectiveEnd,
  fadeGains,
  fadeLength,
  fadeNow,
  handoffBlocked,
  nextHeadStart,
} from "./crossfade";

const base = {
  elementDuration: 200,
  duration: 200,
  metaDuration: 200,
  lastVocal: null,
  outroAllowed: true,
};

describe("effectiveEnd", () => {
  it("is the element's end for a normal file", () => {
    expect(effectiveEnd(base)).toBe(200);
  });

  it("is the corrected end of a doubled-header file", () => {
    expect(effectiveEnd({ ...base, elementDuration: 400 })).toBe(200);
  });

  it("is the metadata end when the file claims far more", () => {
    expect(
      effectiveEnd({
        ...base,
        elementDuration: 600,
        duration: 600,
        metaDuration: 261,
      }),
    ).toBe(263);
  });

  it("is the long-outro skip point when the vocals ended long ago", () => {
    expect(
      effectiveEnd({
        ...base,
        duration: 400,
        elementDuration: 400,
        metaDuration: 400,
        lastVocal: 150,
      }),
    ).toBe(210);
  });

  it("ignores the outro and metadata ends after a deliberate seek into the tail", () => {
    expect(
      effectiveEnd({
        ...base,
        duration: 400,
        elementDuration: 400,
        metaDuration: 400,
        lastVocal: 150,
        outroAllowed: false,
      }),
    ).toBe(400);
  });

  it("keeps a normal instrumental outro", () => {
    expect(effectiveEnd({ ...base, lastVocal: 120 })).toBe(200);
  });

  it("is null with nothing loaded", () => {
    expect(
      effectiveEnd({
        ...base,
        elementDuration: NaN,
        duration: 0,
        metaDuration: 0,
      }),
    ).toBeNull();
  });
});

describe("fadeLength", () => {
  it("is the setting for two full songs", () => {
    expect(fadeLength(6, 200, 240)).toBe(6);
  });

  it("is capped at a third of the shorter track", () => {
    expect(fadeLength(12, 200, 15)).toBe(5);
  });

  it("is 0 when either track is under 10 s", () => {
    expect(fadeLength(6, 200, 9)).toBe(0);
    expect(fadeLength(6, 9.9, 200)).toBe(0);
  });

  it("is 0 when off or a length is unknown", () => {
    expect(fadeLength(0, 200, 200)).toBe(0);
    expect(fadeLength(6, 200, NaN)).toBe(0);
  });
});

describe("fadeNow", () => {
  it("waits until end - length", () => {
    expect(fadeNow(193.9, 200, 6)).toBeNull();
    expect(fadeNow(194, 200, 6)).toBe(6);
  });

  it("fades over what's left after a seek into the window", () => {
    expect(fadeNow(197, 200, 6)).toBe(3);
  });

  it("doesn't start with under half a second left", () => {
    expect(fadeNow(199.6, 200, 6)).toBeNull();
  });

  it("never starts when the length is 0", () => {
    expect(fadeNow(199, 200, 0)).toBeNull();
  });

  it("ends at the effective end, not the file's end", () => {
    const end = effectiveEnd({ ...base, elementDuration: 400 })!;
    expect(fadeNow(193, end, 6)).toBeNull();
    expect(fadeNow(194, end, 6)).toBe(6);
  });
});

describe("fadeGains", () => {
  it("is equal power: full out at 0, full in at 1, no dip in the middle", () => {
    expect(fadeGains(0)).toEqual({ out: 1, in: 0 });
    const end = fadeGains(1);
    expect(end.out).toBeCloseTo(0);
    expect(end.in).toBe(1);
    const mid = fadeGains(0.5);
    expect(mid.out ** 2 + mid.in ** 2).toBeCloseTo(1);
    expect(mid.in).toBeCloseTo(Math.SQRT1_2);
  });

  it("clamps progress", () => {
    expect(fadeGains(-1)).toEqual({ out: 1, in: 0 });
    expect(fadeGains(2).in).toBe(1);
  });
});

describe("handoffBlocked", () => {
  const ok = {
    hasNext: true,
    repeatOne: false,
    casting: false,
    video: false,
    sleepAfterTrack: false,
  };
  it("allows a plain next track", () => {
    expect(handoffBlocked(ok)).toBeNull();
  });
  it("blocks repeat one, casting, video and sleep after this track", () => {
    expect(handoffBlocked({ ...ok, hasNext: false })).not.toBeNull();
    expect(handoffBlocked({ ...ok, repeatOne: true })).not.toBeNull();
    expect(handoffBlocked({ ...ok, casting: true })).not.toBeNull();
    expect(handoffBlocked({ ...ok, video: true })).not.toBeNull();
    expect(handoffBlocked({ ...ok, sleepAfterTrack: true })).not.toBeNull();
  });
});

describe("nextHeadStart", () => {
  it("moves the next join to a small overlap, clamped", () => {
    // Round 28: 500 ms overlapped by 205 ms.
    expect(nextHeadStart(500, -205)).toBe(310);
    // Round 27: 45 ms left a 450 ms gap.
    expect(nextHeadStart(45, 450)).toBe(510);
    // Already on target: unchanged.
    expect(nextHeadStart(310, -15)).toBe(310);
    // An odd join can't swing it past the clamp.
    expect(nextHeadStart(310, 2000)).toBe(600);
    expect(nextHeadStart(310, -900)).toBe(150);
  });
});
