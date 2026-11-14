import { describe, expect, it } from "vitest";
import { blocksInAppPageLoad } from "./modified-link-click";

const PAGE = "tauri://localhost/home";
type Mods = Partial<
  Record<"metaKey" | "ctrlKey" | "shiftKey" | "altKey", boolean>
>;
const click = (mods: Mods = {}, button = 0) => ({
  button,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  defaultPrevented: false,
  ...mods,
});
const link = (href: string, download = false) => ({ href, download });

describe("blocksInAppPageLoad", () => {
  it("blocks Cmd, Shift and middle clicks on an in-app link", () => {
    expect(
      blocksInAppPageLoad(
        click({ metaKey: true }),
        link("tauri://localhost/explore"),
        PAGE,
      ),
    ).toBe(true);
    expect(
      blocksInAppPageLoad(
        click({ shiftKey: true }),
        link("tauri://localhost/playlist/LM?x=1#t"),
        PAGE,
      ),
    ).toBe(true);
    expect(
      blocksInAppPageLoad(
        click({}, 1),
        link("tauri://localhost/explore"),
        PAGE,
      ),
    ).toBe(true);
  });

  it("matches the dev server by host and port", () => {
    const dev = "http://localhost:1420/home";
    expect(
      blocksInAppPageLoad(
        click({ ctrlKey: true }),
        link("http://localhost:1420/search?q=a"),
        dev,
      ),
    ).toBe(true);
    expect(
      blocksInAppPageLoad(
        click({ ctrlKey: true }),
        link("http://localhost:9999/"),
        dev,
      ),
    ).toBe(false);
  });

  it("leaves plain, right, handled, external and download clicks alone", () => {
    const url = "tauri://localhost/explore";
    expect(blocksInAppPageLoad(click(), link(url), PAGE)).toBe(false);
    expect(
      blocksInAppPageLoad(click({ metaKey: true }, 2), link(url), PAGE),
    ).toBe(false);
    expect(
      blocksInAppPageLoad(
        { ...click({ metaKey: true }), defaultPrevented: true },
        link(url),
        PAGE,
      ),
    ).toBe(false);
    expect(
      blocksInAppPageLoad(
        click({ metaKey: true }),
        link("https://music.youtube.com/"),
        PAGE,
      ),
    ).toBe(false);
    expect(
      blocksInAppPageLoad(click({ metaKey: true }), link(url, true), PAGE),
    ).toBe(false);
    expect(blocksInAppPageLoad(click({ metaKey: true }), null, PAGE)).toBe(
      false,
    );
  });
});
