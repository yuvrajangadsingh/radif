import { describe, expect, it } from "vitest";
import { followSlot, type PlayingSlot } from "./playing-slot";

const a = { videoId: "a" };
const b = { videoId: "b" };
const start: PlayingSlot = { entry: a, index: 3, videoId: "a", id: 7 };

describe("followSlot", () => {
  it("keeps the slot when the playing entry only moves", () => {
    expect(followSlot(start, a, 2, "a", true).id).toBe(7);
    expect(followSlot(start, a, 5, "a", true).id).toBe(7);
  });

  it("keeps the slot when the queue is rebuilt around the same song", () => {
    expect(followSlot(start, { videoId: "a" }, 3, "a", true).id).toBe(7);
    // Start radio moves it to the front of a new queue (QA r4 N1).
    expect(followSlot(start, { videoId: "a" }, 0, "a", true).id).toBe(7);
  });

  it("moves on for another track", () => {
    expect(followSlot(start, b, 4, "b", true).id).toBe(8);
    expect(followSlot(start, b, 3, "b", true).id).toBe(8);
  });

  it("moves on when a transition cleared the stream, even for the same entry", () => {
    expect(followSlot(start, a, 0, "a", false).id).toBe(8);
    expect(followSlot(start, { videoId: "a" }, 3, "a", false).id).toBe(8);
  });

  it("returns the same object when nothing changed", () => {
    expect(followSlot(start, a, 3, "a", false)).toBe(start);
  });
});
