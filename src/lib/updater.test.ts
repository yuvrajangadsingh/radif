import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("@tauri-apps/plugin-updater", () => ({
  Update: class {
    constructor(meta: object) {
      Object.assign(this, meta);
    }
  },
}));
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: vi.fn() }));
vi.mock("@/lib/app-log", () => ({ appLog: vi.fn() }));
const toast = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() });
vi.mock("sonner", () => ({ toast }));

const { checkForUpdates } = await import("./updater");
const { useUpdateStore } = await import("@/lib/store/update");

beforeEach(() => {
  vi.stubEnv("DEV", false);
  invoke.mockReset();
  toast.success.mockReset();
  toast.error.mockReset();
  useUpdateStore.getState().reset();
});
afterEach(() => vi.unstubAllEnvs());

describe("checkForUpdates", () => {
  it("passes a timeout to the check", async () => {
    invoke.mockResolvedValue(null);
    await checkForUpdates({ silent: true });
    expect(invoke).toHaveBeenCalledWith("check_for_update", {
      timeoutMs: 30_000,
    });
  });

  it("a manual check during a slow startup check reports that check's answer", async () => {
    let finish: (u: unknown) => void = () => {};
    invoke.mockReturnValueOnce(new Promise((r) => (finish = r)));
    const startup = checkForUpdates({ silent: true });
    const manual = checkForUpdates({ silent: false });
    finish(null);
    await Promise.all([startup, manual]);
    expect(invoke).toHaveBeenCalledTimes(1);
    // Before, the manual check returned at once and said nothing.
    expect(toast.success).toHaveBeenCalledWith("You're on the latest version.", expect.anything());
  });

  it("a failed startup check is tried once more", async () => {
    invoke
      .mockRejectedValueOnce(new Error("timed out"))
      .mockResolvedValueOnce({ version: "9.9.9" });
    await checkForUpdates({ silent: true });
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(useUpdateStore.getState().phase).toBe("available");
  });

  it("a failed manual check says so, with the error", async () => {
    invoke.mockRejectedValueOnce(new Error("timed out"));
    await checkForUpdates({ silent: false });
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalledWith(
      "Couldn't check for updates",
      expect.objectContaining({ description: "Error: timed out" }),
    );
  });

  it("a check that ends during an install leaves the install alone", async () => {
    let finish: (u: unknown) => void = () => {};
    invoke.mockReturnValueOnce(new Promise((r) => (finish = r)));
    const pending = checkForUpdates({ silent: true });
    useUpdateStore.getState().setReady();
    finish({ version: "9.9.9" });
    await pending;
    expect(useUpdateStore.getState().phase).toBe("ready");
  });
});
