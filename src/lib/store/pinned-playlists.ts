import { create } from "zustand";
import { persist } from "zustand/middleware";

export type PinnedPlaylist = {
  /** Whatever id is used in the `/playlist/$id` route — typically the
   *  browseId (e.g. `VLPLxxxxx`). We store whatever the caller hands us
   *  so the link path stays consistent with how they navigated. */
  id: string;
  title: string;
  thumbnailUrl?: string;
};

/** Sidebar folders ship hidden until QA passes them. Delete in the
 *  release that ships them. */
export const FOLDERS_SHIPPED = false;

/** A local sidebar folder. One level: it holds playlists, not folders. */
export type PlaylistFolder = {
  id: string;
  name: string;
  playlistIds: string[];
  collapsed: boolean;
};

// Bucket sentinel for pre-multi-account pins. Real account ids start
// with `acct-` from `generate_account_id`, so the `__legacy__` key
// can't collide.
const LEGACY_KEY = "__legacy__";

type State = {
  /**
   * Active account id from the multi-account system. `null` while
   * signed out or before the boot-time sync hook has resolved. Not
   * persisted — every launch reads it fresh from Rust via
   * `useAccountMetaBackfill`, which also re-syncs it whenever the
   * `accounts-changed` listener fires.
   *
   * Pinning is a signed-in-only feature: when this is `null`, the
   * selectors return an empty list and the actions are no-ops. We
   * never write to an "anonymous" bucket — that would orphan pins
   * the moment the user signed in.
   */
  activeAccountId: string | null;
  /**
   * Pinned playlists keyed by account id. Pre-multi-account pins
   * from the legacy single-list layout live in `__legacy__` until
   * the first signed-in launch hands them off (see
   * `setActiveAccount`).
   */
  byAccount: Record<string, PinnedPlaylist[]>;
  /**
   * Hidden playlist ids keyed by account. A hidden playlist is dropped
   * from the sidebar entirely; it still appears in the Library, which is
   * where it gets un-hidden. Hiding and pinning are mutually exclusive —
   * `hide` drops any pin and `pin` clears any hide — so a playlist is
   * always in exactly one of {pinned, normal, hidden}.
   */
  hiddenByAccount: Record<string, string[]>;
  /**
   * Sidebar folders keyed by account. Local only. A playlist is in at most
   * one place: pinned, in one folder, unfiled, or hidden. Moving it into a
   * folder unpins and unhides it; pinning or hiding takes it out. An id
   * the library no longer has just doesn't show, and comes back in place
   * if the playlist does (a partial library fetch, say).
   */
  foldersByAccount: Record<string, PlaylistFolder[]>;
  setActiveAccount: (id: string | null) => void;
  pin: (p: PinnedPlaylist) => void;
  unpin: (id: string) => void;
  hide: (id: string) => void;
  unhide: (id: string) => void;
  reorder: (from: number, to: number) => void;
  /** New folder, optionally holding `playlistId`; returns its id (or null
   *  when signed out). */
  createFolder: (name: string, playlistId?: string) => string | null;
  renameFolder: (folderId: string, name: string) => void;
  /** Its playlists go back to unfiled. */
  deleteFolder: (folderId: string) => void;
  moveToFolder: (playlistId: string, folderId: string) => void;
  removeFromFolder: (playlistId: string) => void;
  toggleFolder: (folderId: string) => void;
};

const withoutPlaylist = (folders: PlaylistFolder[], id: string) =>
  folders.some((f) => f.playlistIds.includes(id))
    ? folders.map((f) =>
        f.playlistIds.includes(id)
          ? { ...f, playlistIds: f.playlistIds.filter((x) => x !== id) }
          : f,
      )
    : folders;

/**
 * Local pinned-playlist registry. Persisted in localStorage so the
 * sidebar looks the same between sessions, and scoped per-account so
 * switching back to a previous profile brings its pins back. `Liked
 * Songs` is always rendered by the sidebar regardless of what's
 * stored here.
 */
export const usePinnedPlaylistsStore = create<State>()(
  persist(
    (set, get) => ({
      activeAccountId: null,
      byAccount: {},
      hiddenByAccount: {},
      foldersByAccount: {},
      setActiveAccount: (id) =>
        set((s) => {
          const next = { ...s.byAccount };
          // Adopt the legacy bucket onto the first account we see.
          // Before multi-account the store kept a single pinned list
          // with no owner; the first signed-in launch under the new
          // layout claims it. Skip the adopt on sign-out — we'd
          // rather hold the legacy bucket for a future sign-in than
          // park it somewhere it can't be reached.
          if (
            id !== null &&
            next[LEGACY_KEY] !== undefined &&
            (next[id] === undefined || next[id].length === 0)
          ) {
            next[id] = next[LEGACY_KEY];
            delete next[LEGACY_KEY];
          }
          return { activeAccountId: id, byAccount: next };
        }),
      pin: (p) =>
        set((s) => {
          // Pinning is a signed-in-only feature. Anonymous pins would
          // orphan the moment the user signed in (we'd have no
          // account to attach them to), so we just drop the call.
          if (s.activeAccountId === null) return s;
          const key = s.activeAccountId;
          const list = s.byAccount[key] ?? [];
          const hidden = s.hiddenByAccount[key] ?? [];
          const wasHidden = hidden.includes(p.id);
          const alreadyPinned = list.some((x) => x.id === p.id);
          const folders = s.foldersByAccount[key] ?? [];
          const inFolder = folders.some((f) => f.playlistIds.includes(p.id));
          // No-op only when there's genuinely nothing to change.
          if (alreadyPinned && !wasHidden && !inFolder) return s;
          return {
            foldersByAccount: inFolder
              ? { ...s.foldersByAccount, [key]: withoutPlaylist(folders, p.id) }
              : s.foldersByAccount,
            byAccount: alreadyPinned
              ? s.byAccount
              : { ...s.byAccount, [key]: [...list, p] },
            // Pinning implies visible, so it supersedes any hide.
            hiddenByAccount: wasHidden
              ? { ...s.hiddenByAccount, [key]: hidden.filter((x) => x !== p.id) }
              : s.hiddenByAccount,
          };
        }),
      hide: (id) =>
        set((s) => {
          if (s.activeAccountId === null) return s;
          const key = s.activeAccountId;
          const hidden = s.hiddenByAccount[key] ?? [];
          const list = s.byAccount[key] ?? [];
          const alreadyHidden = hidden.includes(id);
          const wasPinned = list.some((x) => x.id === id);
          const folders = s.foldersByAccount[key] ?? [];
          const inFolder = folders.some((f) => f.playlistIds.includes(id));
          if (alreadyHidden && !wasPinned && !inFolder) return s;
          return {
            foldersByAccount: inFolder
              ? { ...s.foldersByAccount, [key]: withoutPlaylist(folders, id) }
              : s.foldersByAccount,
            hiddenByAccount: alreadyHidden
              ? s.hiddenByAccount
              : { ...s.hiddenByAccount, [key]: [...hidden, id] },
            // Hiding supersedes pinning — drop any pin so the two never
            // coexist (an invisible-but-pinned playlist is meaningless).
            byAccount: wasPinned
              ? { ...s.byAccount, [key]: list.filter((x) => x.id !== id) }
              : s.byAccount,
          };
        }),
      unhide: (id) =>
        set((s) => {
          if (s.activeAccountId === null) return s;
          const key = s.activeAccountId;
          const hidden = s.hiddenByAccount[key] ?? [];
          if (!hidden.includes(id)) return s;
          return {
            hiddenByAccount: {
              ...s.hiddenByAccount,
              [key]: hidden.filter((x) => x !== id),
            },
          };
        }),
      unpin: (id) =>
        set((s) => {
          if (s.activeAccountId === null) return s;
          const key = s.activeAccountId;
          const list = s.byAccount[key] ?? [];
          return {
            byAccount: {
              ...s.byAccount,
              [key]: list.filter((x) => x.id !== id),
            },
          };
        }),
      reorder: (from, to) =>
        set((s) => {
          if (s.activeAccountId === null) return s;
          if (from === to || from < 0 || to < 0) return s;
          const key = s.activeAccountId;
          const list = s.byAccount[key] ?? [];
          if (from >= list.length || to >= list.length) return s;
          const next = list.slice();
          const [moved] = next.splice(from, 1);
          next.splice(to, 0, moved);
          return { byAccount: { ...s.byAccount, [key]: next } };
        }),
      createFolder: (name, playlistId) => {
        const key = get().activeAccountId;
        if (key === null) return null;
        const id = `folder-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
        set((s) => ({
          foldersByAccount: {
            ...s.foldersByAccount,
            [key]: [
              ...(s.foldersByAccount[key] ?? []),
              { id, name, playlistIds: [], collapsed: false },
            ],
          },
        }));
        if (playlistId) get().moveToFolder(playlistId, id);
        return id;
      },
      renameFolder: (folderId, name) =>
        updateFolders(set, (folders) =>
          folders.map((f) => (f.id === folderId ? { ...f, name } : f)),
        ),
      deleteFolder: (folderId) =>
        updateFolders(set, (folders) =>
          folders.filter((f) => f.id !== folderId),
        ),
      toggleFolder: (folderId) =>
        updateFolders(set, (folders) =>
          folders.map((f) =>
            f.id === folderId ? { ...f, collapsed: !f.collapsed } : f,
          ),
        ),
      removeFromFolder: (playlistId) =>
        updateFolders(set, (folders) => withoutPlaylist(folders, playlistId)),
      moveToFolder: (playlistId, folderId) =>
        set((s) => {
          if (s.activeAccountId === null) return s;
          const key = s.activeAccountId;
          const folders = s.foldersByAccount[key] ?? [];
          if (!folders.some((f) => f.id === folderId)) return s;
          return {
            foldersByAccount: {
              ...s.foldersByAccount,
              [key]: withoutPlaylist(folders, playlistId).map((f) =>
                f.id === folderId
                  ? { ...f, playlistIds: [...f.playlistIds, playlistId] }
                  : f,
              ),
            },
            byAccount: {
              ...s.byAccount,
              [key]: (s.byAccount[key] ?? []).filter((x) => x.id !== playlistId),
            },
            hiddenByAccount: {
              ...s.hiddenByAccount,
              [key]: (s.hiddenByAccount[key] ?? []).filter(
                (x) => x !== playlistId,
              ),
            },
          };
        }),
    }),
    {
      name: "ytm-pinned-playlists",
      version: 2,
      // Persist only the per-account maps. `activeAccountId` lives in
      // RAM and is re-derived from Rust on every launch.
      partialize: (s) => ({
        byAccount: s.byAccount,
        hiddenByAccount: s.hiddenByAccount,
        foldersByAccount: s.foldersByAccount,
      }),
      // v0/v1: `{ pinned: [...] }` (no version field, the absence
      //         counts as version 0). Promote the list into the
      //         `__legacy__` bucket so the first sign-in claims it.
      // v2:    `{ byAccount: { ... } }` (current).
      // `hiddenByAccount` and `foldersByAccount` (added after v2) are
      // additive fields: older
      // persisted blobs simply omit them and the store's initial `{}`
      // fills the gap via persist's shallow merge — no version bump
      // needed.
      migrate: (persistedState, version) => {
        if (version < 2) {
          const legacy =
            (persistedState as { pinned?: PinnedPlaylist[] } | null)?.pinned;
          return {
            byAccount:
              Array.isArray(legacy) && legacy.length > 0
                ? { [LEGACY_KEY]: legacy }
                : {},
            hiddenByAccount: {},
          };
        }
        return persistedState as {
          byAccount: Record<string, PinnedPlaylist[]>;
          hiddenByAccount?: Record<string, string[]>;
        };
      },
    },
  ),
);

/** Current account's pinned list. Returns `[]` when signed out —
 *  pinning is a signed-in-only feature. */
export function usePinned(): PinnedPlaylist[] {
  return usePinnedPlaylistsStore((s) => {
    if (s.activeAccountId === null) return EMPTY;
    return s.byAccount[s.activeAccountId] ?? EMPTY;
  });
}

export function useIsPinned(id: string): boolean {
  return usePinnedPlaylistsStore((s) => {
    if (s.activeAccountId === null) return false;
    return (s.byAccount[s.activeAccountId] ?? []).some((p) => p.id === id);
  });
}

/** Current account's hidden playlist ids. `[]` when signed out. */
export function useHidden(): string[] {
  return usePinnedPlaylistsStore((s) => {
    if (s.activeAccountId === null) return EMPTY_IDS;
    return s.hiddenByAccount[s.activeAccountId] ?? EMPTY_IDS;
  });
}

export function useIsHidden(id: string): boolean {
  return usePinnedPlaylistsStore((s) => {
    if (s.activeAccountId === null) return false;
    return (s.hiddenByAccount[s.activeAccountId] ?? []).includes(id);
  });
}

/** Current account's folders. `[]` when signed out. */
export function useFolders(): PlaylistFolder[] {
  return usePinnedPlaylistsStore((s) => {
    if (s.activeAccountId === null) return EMPTY_FOLDERS;
    return s.foldersByAccount[s.activeAccountId] ?? EMPTY_FOLDERS;
  });
}

/** Apply `fn` to the current account's folders; a no-op when signed out
 *  or when `fn` returns the same list. */
function updateFolders(
  set: (fn: (s: State) => Partial<State> | State) => void,
  fn: (folders: PlaylistFolder[]) => PlaylistFolder[],
) {
  set((s) => {
    if (s.activeAccountId === null) return s;
    const key = s.activeAccountId;
    const folders = s.foldersByAccount[key] ?? [];
    const next = fn(folders);
    if (next === folders) return s;
    return { foldersByAccount: { ...s.foldersByAccount, [key]: next } };
  });
}

// Stable references for the empty lists — avoids forcing re-renders of
// `usePinned()` / `useHidden()` consumers when the lookup misses (zustand
// uses referential equality on selector returns by default).
const EMPTY: PinnedPlaylist[] = [];
const EMPTY_IDS: string[] = [];
const EMPTY_FOLDERS: PlaylistFolder[] = [];
