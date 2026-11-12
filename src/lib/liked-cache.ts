import type { QueryClient } from "@tanstack/react-query";

/**
 * The Storage tab's in-library walk (Liked songs + every playlist + albums)
 * is stale after a rating or a playlist edit. It's dozens of requests, so
 * it walks again only if the tab is open, else when it next opens. A walk
 * still in flight is cancelled first, or its older answer would land and
 * count as fresh for another 30 minutes.
 */
export function markLibraryTracksStale(qc: QueryClient): void {
  const key = ["library-tracks"];
  void qc
    .cancelQueries({ queryKey: key })
    .then(() => qc.invalidateQueries({ queryKey: key }));
}

/**
 * The Library cards show each playlist's track count, so an add or a
 * removal makes ["library", "playlists"] stale. A first load in flight
 * would be reused by the refetch and land with the old count, so it's
 * cancelled first, as above.
 */
export function markLibraryPlaylistsStale(qc: QueryClient): void {
  const key = ["library", "playlists"];
  void qc
    .cancelQueries({ queryKey: key })
    .then(() => qc.invalidateQueries({ queryKey: key }));
}

/**
 * A like, unlike or dislike changes more than the heart-fill cache
 * (["liked-songs"]): Library, Songs, its search, the Liked Songs playlist
 * page (LM or VLLM) and the Storage tab are built from the same list.
 * They're heavy, so invalidating refetches only what's on screen; the rest
 * refetches when it's next opened.
 */
export function invalidateLikedLists(qc: QueryClient): void {
  void qc.invalidateQueries({ queryKey: ["library", "liked-songs-pages"] });
  // A first walk in flight would be reused by the refetch and land with
  // the old list, so cancel it before asking again.
  const all = ["library", "liked-songs-all"];
  void qc
    .cancelQueries({ queryKey: all })
    .then(() => qc.invalidateQueries({ queryKey: all }));
  void qc.invalidateQueries({
    predicate: (q) =>
      q.queryKey[0] === "playlist-pages-v2" &&
      (q.queryKey[1] === "LM" || q.queryKey[1] === "VLLM"),
  });
  markLibraryTracksStale(qc);
}
