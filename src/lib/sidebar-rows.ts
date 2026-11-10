import type {
  PinnedPlaylist,
  PlaylistFolder,
} from "@/lib/store/pinned-playlists";

export type SidebarPlaylist = {
  id: string;
  title: string;
  thumbnailUrl?: string;
};
export type SidebarRow = SidebarPlaylist & {
  pinned: boolean;
  /** In the library fetch: only these can be filed, since a folder's ids
   *  are pruned against it. */
  inLibrary: boolean;
};

/**
 * The sidebar's playlist rows below Liked songs: pinned (stored order),
 * then folders (creation order, each in library order), then the rest in
 * library order. Hidden playlists and Liked songs itself are left out.
 */
export function sidebarSections(i: {
  library: SidebarPlaylist[];
  pinned: PinnedPlaylist[];
  hidden: string[];
  folders: PlaylistFolder[];
  likedId: string;
}): {
  pinned: SidebarRow[];
  folders: { folder: PlaylistFolder; rows: SidebarRow[] }[];
  rest: SidebarRow[];
} {
  const hidden = new Set(i.hidden);
  const lib = i.library.filter((p) => p.id !== i.likedId && !hidden.has(p.id));
  const libById = new Map(lib.map((p) => [p.id, p]));
  const pinnedIds = new Set(i.pinned.map((p) => p.id));
  const filed = new Set(i.folders.flatMap((f) => f.playlistIds));
  const row = (p: SidebarPlaylist, pinned: boolean): SidebarRow => ({
    ...p,
    pinned,
    inLibrary: libById.has(p.id),
  });

  return {
    // Prefer fresh library data for title/thumbnail, but keep a pin visible
    // even when it isn't in the library fetch (pinned from search results).
    pinned: i.pinned
      .filter((p) => p.id !== i.likedId && !hidden.has(p.id))
      .map((p) => row(libById.get(p.id) ?? p, true)),
    folders: i.folders.map((folder) => {
      const ids = new Set(folder.playlistIds);
      return {
        folder,
        rows: lib.filter((p) => ids.has(p.id)).map((p) => row(p, false)),
      };
    }),
    rest: lib
      .filter((p) => !pinnedIds.has(p.id) && !filed.has(p.id))
      .map((p) => row(p, false)),
  };
}
