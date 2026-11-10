import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { usePinnedPlaylistsStore } from "./pinned-playlists";
import { safeLocalStorage } from "./safe-storage";

/** Ships hidden until QA passes it. Delete in the release that ships it. */
export const HIDE_ARTIST_SHIPPED = false;

/**
 * Artists the listener chose to hide ("Hide this artist"): their songs are
 * skipped in the queue and radio, the way disliked songs are. Matched by the
 * artist's channel/browse id, never the name, so a namesake isn't caught.
 * Built only by the listener, kept on this Mac, per account (the account
 * the pinned-playlists store tracks). Nothing here decides for them.
 */
type HiddenArtistsState = {
  /** account id -> artist id -> display name */
  byAccount: Record<string, Record<string, string>>;
  hide: (artist: { id: string; name: string }) => void;
  /** `forAccount`: the account a hide was made under (an Undo after a
   *  switch must not touch the new account). Defaults to the current. */
  unhide: (artistId: string, forAccount?: string | null) => void;
};

const account = () => usePinnedPlaylistsStore.getState().activeAccountId;
// Membership by key: a parser can hand over an artist with an empty name.
export const hasArtist = (
  map: Record<string, string> | undefined,
  id: string,
): boolean => !!map && Object.prototype.hasOwnProperty.call(map, id);

export const useHiddenArtistsStore = create<HiddenArtistsState>()(
  persist(
    (set) => ({
      byAccount: {},
      hide: ({ id, name }) =>
        set((s) => {
          const key = account();
          if (key === null || hasArtist(s.byAccount[key], id)) return s;
          return {
            byAccount: {
              ...s.byAccount,
              [key]: { ...s.byAccount[key], [id]: name },
            },
          };
        }),
      unhide: (artistId, forAccount) =>
        set((s) => {
          const key = forAccount === undefined ? account() : forAccount;
          if (key === null || !hasArtist(s.byAccount[key], artistId)) return s;
          const next = { ...s.byAccount[key] };
          delete next[artistId];
          return { byAccount: { ...s.byAccount, [key]: next } };
        }),
    }),
    {
      name: "ytm-hidden-artists",
      storage: createJSONStorage(() => safeLocalStorage),
    },
  ),
);

/** The current account's hidden artists, id -> name. */
export function hiddenArtists(): Record<string, string> {
  const key = account();
  return key === null
    ? {}
    : (useHiddenArtistsStore.getState().byAccount[key] ?? {});
}

/** Whether any of the track's artists is hidden. A track whose artists
 *  carry no id can't be matched, and plays. */
export function byHiddenArtist(track: {
  artists?: { id?: string }[];
}): boolean {
  const hidden = hiddenArtists();
  return !!track.artists?.some((a) => a.id && hasArtist(hidden, a.id));
}
