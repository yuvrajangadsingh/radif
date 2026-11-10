import type { ShelfItem } from "@/lib/innertube/types";
import type { PlaylistSortMode } from "@/lib/store/playlist-sort";

/** The sort fix-up ships hidden until QA passes it: album, the labels, this
 *  comparator, Play following the view, a cancellable full load. Delete in
 *  the release that ships it. */
export const SORT_FIXUP_SHIPPED = false;

// One collator for every compare, in the system locale: base sensitivity
// so case doesn't split titles and, where the locale treats them as one
// letter, accents don't either (English: "éclair" with "Eclair"; Swedish
// keeps ä apart). Numeric, so "Track 2" < "Track 10". Each script sorts in
// its own order (Devanagari, Gurmukhi, Latin).
const collator = new Intl.Collator(undefined, {
  sensitivity: "base",
  numeric: true,
});

/** Empty text sorts last; equal keys keep playlist order. */
function byText(key: (t: ShelfItem) => string | undefined, desc = false) {
  return (a: ShelfItem, b: ShelfItem) => {
    const x = key(a)?.trim() ?? "";
    const y = key(b)?.trim() ?? "";
    if (!x || !y) return (x ? 0 : 1) - (y ? 0 : 1);
    return desc ? collator.compare(y, x) : collator.compare(x, y);
  };
}

function byNumber(key: (t: ShelfItem) => number | undefined, desc = false) {
  return (a: ShelfItem, b: ShelfItem) => {
    const x = key(a);
    const y = key(b);
    if (x === undefined || y === undefined)
      return (x === undefined ? 1 : 0) - (y === undefined ? 1 : 0);
    return desc ? y - x : x - y;
  };
}

const artist = (t: ShelfItem) => t.artists?.[0]?.name ?? t.subtitle;

/**
 * The view order for a playlist. Never touches the playlist itself.
 * Array.prototype.sort is stable, so ties keep playlist order.
 */
export function sortTracks(
  tracks: ShelfItem[],
  mode: PlaylistSortMode,
): ShelfItem[] {
  if (mode === "default" || tracks.length < 2) return tracks;
  // Rows carry no date added: this is a plain reverse, which is "oldest
  // first" only for Liked songs (served newest first).
  if (mode === "date-added-asc") return tracks.slice().reverse();
  const compare = {
    "title-asc": byText((t) => t.title),
    "title-desc": byText((t) => t.title, true),
    "artist-asc": byText(artist),
    "album-asc": byText((t) => t.album),
    "duration-asc": byNumber((t) => t.duration),
    "duration-desc": byNumber((t) => t.duration, true),
  }[mode];
  return tracks.slice().sort(compare);
}
