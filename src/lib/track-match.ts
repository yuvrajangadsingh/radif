import type { ShelfItem } from "@/lib/innertube/types";

/** Does a track's title, album or artist line contain `query`? `query` is
 *  already trimmed and lowercased. The playlist filter and the search across
 *  playlists both use this. */
export function trackMatches(t: ShelfItem, query: string): boolean {
  if (!query) return true;
  return [
    t.title,
    t.album,
    t.subtitle,
    ...(t.artists?.map((a) => a.name) ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(query);
}
