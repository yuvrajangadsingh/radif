import { describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/plugin-http", () => ({ fetch: vi.fn() }));
vi.mock("@/lib/app-log", () => ({ appLog: vi.fn() }));
(globalThis as unknown as { window: unknown }).window = {
  location: { search: "?floating-player" },
  addEventListener: () => {},
};

const { listenPayload, listenThreshold, validateToken } =
  await import("./listenbrainz");
const { fetch } = await import("@tauri-apps/plugin-http");

const track = {
  videoId: "abc",
  title: "Tum Ho",
  artists: [{ name: "Mohit Chauhan - Topic" }],
  album: "Rockstar",
  thumbnails: [],
};

describe("listenThreshold", () => {
  it("is half the track or 4 minutes, whichever is less", () => {
    expect(listenThreshold(200)).toBe(100);
    expect(listenThreshold(600)).toBe(240);
    expect(listenThreshold(20)).toBe(10);
    expect(listenThreshold(0)).toBe(240);
  });
});

describe("listenPayload", () => {
  it("builds a listen with the cleaned artist and the song's link", () => {
    expect(listenPayload(track, 312.4, 1700000000)).toEqual({
      listened_at: 1700000000,
      track_metadata: {
        artist_name: "Mohit Chauhan",
        track_name: "Tum Ho",
        release_name: "Rockstar",
        additional_info: {
          media_player: "Radif",
          submission_client: "Radif",
          music_service: "music.youtube.com",
          origin_url: "https://music.youtube.com/watch?v=abc",
          duration_ms: 312400,
        },
      },
    });
  });

  it("leaves out listened_at for playing_now and an unknown length", () => {
    const p = listenPayload({ ...track, album: undefined }, 0);
    expect(p).not.toHaveProperty("listened_at");
    expect(p.track_metadata).not.toHaveProperty("release_name");
    expect(p.track_metadata.additional_info).not.toHaveProperty("duration_ms");
  });
});

describe("validateToken", () => {
  const answer = (status: number, body: unknown) =>
    vi.mocked(fetch).mockResolvedValueOnce({
      status,
      ok: status < 400,
      json: async () => body,
      text: async () => JSON.stringify(body),
    } as Response);

  it("returns the user for a valid token and null for a rejected one", async () => {
    answer(200, { valid: true, user_name: "yuvi" });
    expect(await validateToken("t")).toBe("yuvi");
    answer(200, { valid: false });
    expect(await validateToken("t")).toBeNull();
    answer(401, {});
    expect(await validateToken("t")).toBeNull();
  });

  it("throws on a server error, which says nothing about the token", async () => {
    answer(503, {});
    await expect(validateToken("t")).rejects.toThrow("503");
  });
});
