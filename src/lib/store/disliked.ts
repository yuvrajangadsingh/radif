import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { safeLocalStorage } from "./safe-storage";

/**
 * Songs the listener has disliked, as far as Radif knows, for the queue to
 * skip. A rating made here (Like, Dislike, Remove rating) sets or clears it.
 * A dislike made in another app is learned the first time the song plays,
 * from the rating in the `/next` response the lyrics lookup already makes;
 * that path only ever adds, since a stale or signed-out answer must not undo
 * a dislike. Kept on this Mac, for the account that's signed in.
 */
type DislikedState = {
  ids: Record<string, true>;
  mark: (videoId: string, disliked: boolean) => void;
  clear: () => void;
};

export const useDislikedStore = create<DislikedState>()(
  persist(
    (set) => ({
      ids: {},
      mark: (videoId, disliked) =>
        set((s) => {
          if (!!s.ids[videoId] === disliked) return s;
          const ids = { ...s.ids };
          if (disliked) ids[videoId] = true;
          else delete ids[videoId];
          return { ids };
        }),
      clear: () => {
        clearedAt = Date.now();
        set({ ids: {} });
      },
    }),
    {
      name: "ytm-disliked",
      storage: createJSONStorage(() => safeLocalStorage),
    },
  ),
);

// The listener's last rating of each song made here: when it was sent, so an
// older one landing late doesn't win, and when it landed, so a `/next` sent
// before then doesn't overrule it. And when the set was last cleared (an
// account switch), so nothing sent before that lands after.
const ratedHere = new Map<string, { sent: number; done: number }>();
let clearedAt = 0;

/** A rating made in Radif, sent at `askedAt`: Dislike sets, Like and Remove
 *  rating clear. */
export function rateHere(
  videoId: string,
  disliked: boolean,
  askedAt = Date.now(),
): void {
  if (clearedAt >= askedAt) return;
  if ((ratedHere.get(videoId)?.sent ?? 0) > askedAt) return;
  ratedHere.set(videoId, { sent: askedAt, done: Date.now() });
  useDislikedStore.getState().mark(videoId, disliked);
}

/** A DISLIKE read from YouTube Music for a request sent at `askedAt`. */
export function learnDisliked(videoId: string, askedAt: number): void {
  if (clearedAt >= askedAt) return;
  if ((ratedHere.get(videoId)?.done ?? 0) >= askedAt) return;
  useDislikedStore.getState().mark(videoId, true);
}

export function isDisliked(videoId: string): boolean {
  return !!useDislikedStore.getState().ids[videoId];
}

// The floating window rates songs too; pick up its writes, as the settings
// store does.
if (typeof window !== "undefined" && window.addEventListener) {
  window.addEventListener("storage", (e) => {
    if (e.key === "ytm-disliked") void useDislikedStore.persist.rehydrate();
  });
}
