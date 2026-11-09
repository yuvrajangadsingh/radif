import { describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({ useNavigate: vi.fn() }));
vi.mock("@/lib/store/playback", () => ({ usePlaybackStore: {} }));
vi.mock("@/lib/store/premium", () => ({ usePremiumStore: {} }));

const { parseRadifUrl, waitsForPremium } = await import("./url-scheme");

describe("parseRadifUrl", () => {
  it("reads the playback actions, either way they're written", () => {
    for (const k of ["play", "pause", "toggle", "next", "previous"]) {
      expect(parseRadifUrl(`radif://${k}`)).toEqual({ kind: k });
      expect(parseRadifUrl(`radif://${k}/`)).toEqual({ kind: k });
      expect(parseRadifUrl(`radif:${k}`)).toEqual({ kind: k });
    }
  });

  it("opens search with a query and nothing without one", () => {
    expect(parseRadifUrl("radif://search?q=tum%20ho")).toEqual({
      kind: "search",
      q: "tum ho",
    });
    expect(parseRadifUrl("radif://search")).toBeNull();
    expect(parseRadifUrl("radif://search?q=%20")).toBeNull();
  });

  it("refuses anything else", () => {
    expect(parseRadifUrl("radif://like")).toBeNull();
    expect(parseRadifUrl("radif://playlist/add?id=x")).toBeNull();
    expect(parseRadifUrl("https://play")).toBeNull();
    expect(parseRadifUrl("not a url")).toBeNull();
  });
});

describe("waitsForPremium (QA r14 N1)", () => {
  it("holds playback until the Premium check answers, never search", () => {
    for (const kind of ["play", "toggle", "next"] as const) {
      expect(waitsForPremium({ kind }, null)).toBe(true);
      expect(waitsForPremium({ kind }, "premium")).toBe(false);
      expect(waitsForPremium({ kind }, "free")).toBe(false);
    }
    expect(waitsForPremium({ kind: "search", q: "x" }, null)).toBe(false);
  });
});
