import { describe, expect, it } from "vitest";
import { loadEveryPage } from "./load-every-page";

const pages = (n: number, failAt?: number) => {
  let i = 0;
  return () =>
    Promise.resolve({
      page: ++i,
      hasNextPage: i < n,
      isError: i === failAt,
    });
};

describe("loadEveryPage", () => {
  it("fetches until the pages run out and returns the last step", async () => {
    const last = await loadEveryPage({ hasNextPage: true }, pages(4), {
      pauseMs: 0,
    });
    expect(last).toEqual({ page: 4, hasNextPage: false, isError: false });
  });

  it("does nothing when everything is already loaded", async () => {
    expect(
      await loadEveryPage({ hasNextPage: false }, pages(4), { pauseMs: 0 }),
    ).toBeNull();
  });

  it("throws on a failed page or pages that never end", async () => {
    await expect(
      loadEveryPage({ hasNextPage: true }, pages(4, 2), { pauseMs: 0 }),
    ).rejects.toThrow("failed");
    await expect(
      loadEveryPage({ hasNextPage: true }, pages(1000), {
        pauseMs: 0,
        maxPages: 10,
      }),
    ).rejects.toThrow("too many");
  });
});
