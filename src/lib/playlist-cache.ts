import type { QueryClient } from "@tanstack/react-query";
import type { ShelfItem } from "@/lib/innertube/types";

type PlaylistPages = {
  pages: { tracks: ShelfItem[]; trackCount?: number }[];
  pageParams: unknown[];
};

/**
 * Drops one playlist entry from every cached playlist page in place.
 * Invalidating instead would refetch every loaded page of the infinite
 * query, 100+ requests on a large playlist. setVideoId is unique per
 * entry, so other playlists and a duplicate of the same song are left alone.
 */
export async function dropPlaylistEntry(
  qc: QueryClient,
  playlistId: string,
  setVideoId: string,
) {
  const holds = (d: PlaylistPages | undefined) =>
    !!d?.pages.some((p) => p.tracks.some((t) => t.setVideoId === setVideoId));
  const bare = (id: unknown) =>
    typeof id === "string" && id.startsWith("VL") ? id.slice(2) : id;
  for (const query of qc
    .getQueryCache()
    .findAll({ queryKey: ["playlist-pages-v2"] })) {
    const key = query.queryKey;
    const { data, fetchStatus, fetchMeta, isInvalidated } = query.state;
    // The same playlist can be cached under its PL and VLPL ids.
    if (!holds(data as PlaylistPages) && bare(key[1]) !== bare(playlistId))
      continue;
    // A fetch in flight would land with the old pages and bring the row
    // back, so cancel it. A cancelled next page is fetched again on
    // scroll; a cancelled load or refresh is started again below.
    const restart =
      isInvalidated ||
      (fetchStatus !== "idle" &&
        !(fetchMeta as { fetchMore?: unknown } | null)?.fetchMore);
    await qc.cancelQueries({ queryKey: key, exact: true });
    const old = qc.getQueryData<PlaylistPages>(key);
    // Writing marks the query fresh, so only write when the row is there.
    if (old && holds(old)) {
      qc.setQueryData<PlaylistPages>(key, {
        ...old,
        pages: old.pages.map((p, i) => ({
          ...p,
          ...(i === 0 && p.trackCount ? { trackCount: p.trackCount - 1 } : {}),
          tracks: p.tracks.filter((t) => t.setVideoId !== setVideoId),
        })),
      });
    }
    // Keep a pending refresh pending.
    if (restart) void qc.invalidateQueries({ queryKey: key, exact: true });
  }
}
