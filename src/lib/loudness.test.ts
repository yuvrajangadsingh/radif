import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/app-log", () => ({ appLog: vi.fn() }));
vi.mock("@/lib/player-info", () => ({ playerInfo: vi.fn() }));
vi.mock("@/lib/store/accounts", () => ({ useAccounts: vi.fn() }));
vi.mock("@/lib/store/settings", () => ({ useSettingsStore: vi.fn() }));

const { loudnessGain, trackGain } = await import("./loudness");
const { playerInfo } = await import("@/lib/player-info");

describe("loudnessGain", () => {
  // The values YouTube returned on Nov 6 for these tracks.
  it("turns a loud track down to the target", () => {
    const loon = { loudnessDb: -2.5100002, loudnessTargetLkfs: -7 };
    expect(loudnessGain(loon)).toBeCloseTo(10 ** (-4.49 / 20), 3);
    expect(loudnessGain({ loudnessDb: -0.58 })).toBeCloseTo(
      10 ** (-6.42 / 20),
      3,
    );
  });

  it("leaves a track at or below the target alone", () => {
    expect(loudnessGain({ loudnessDb: -7.22, loudnessTargetLkfs: -7 })).toBe(1);
  });

  it("is 1 when YouTube gave no measurement", () => {
    expect(loudnessGain(undefined)).toBe(1);
    expect(loudnessGain({})).toBe(1);
    expect(loudnessGain({ loudnessDb: "loud" })).toBe(1);
  });
});

describe("trackGain", () => {
  const loud = { playerConfig: { audioConfig: { loudnessDb: -0.58 } } };

  it("asks once per track and keeps the answer", async () => {
    const ask = vi.mocked(playerInfo);
    ask.mockReset().mockResolvedValue(loud as never);
    const first = await trackGain("kept", "acc", null);
    expect(first).toBeCloseTo(10 ** (-6.42 / 20), 3);
    expect(await trackGain("kept", "acc", null)).toBe(first);
    expect(ask).toHaveBeenCalledTimes(1);
  });

  it("doesn't keep a response with no loudness", async () => {
    const ask = vi.mocked(playerInfo);
    ask.mockReset().mockResolvedValueOnce({} as never);
    expect(await trackGain("unmeasured", "acc", null)).toBe(1);
    ask.mockResolvedValue(loud as never);
    expect(await trackGain("unmeasured", "acc", null)).toBeLessThan(1);
    expect(ask).toHaveBeenCalledTimes(2);
  });

  it("doesn't keep a failure", async () => {
    const ask = vi.mocked(playerInfo);
    ask.mockReset().mockRejectedValueOnce(new Error("offline"));
    await expect(trackGain("flaky", "acc", null)).rejects.toThrow("offline");
    ask.mockResolvedValue(loud as never);
    expect(await trackGain("flaky", "acc", null)).toBeLessThan(1);
    expect(ask).toHaveBeenCalledTimes(2);
  });
});
