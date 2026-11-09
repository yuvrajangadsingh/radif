/**
 * Which queue slot is playing, as the audio engine sees it: an id that stays
 * the same while the playing entry only moves (an earlier row removed or
 * moved shifts `index`), and changes when another track takes over.
 *
 * The engine reloads when this changes. Keyed on `index` alone, removing a
 * row above the playing song restarted it.
 */
export type PlayingSlot = {
  entry: unknown;
  index: number;
  videoId: string | undefined;
  id: number;
};

export function followSlot(
  prev: PlayingSlot,
  entry: unknown,
  index: number,
  videoId: string | undefined,
  /** The store still holds a stream url. Every playback transition (next,
   *  prev, goTo, a new queue, removing the playing row) clears it; an edit
   *  around the song (remove or move another row, shuffle on) doesn't. */
  loaded: boolean,
): PlayingSlot {
  if (entry === prev.entry && index === prev.index) return prev;
  // The same entry somewhere else (a shift), or a new entry for the same song
  // (a queue rebuilt around it, Start radio moving it to the front): still the
  // same playback, unless a transition cleared the stream (next or goTo onto
  // a duplicate, repeat-all reshuffling the same entry to the front). The
  // store's slotChange decides which landings count as a transition.
  const sameSlot = loaded && (entry === prev.entry || videoId === prev.videoId);
  return { entry, index, videoId, id: sameSlot ? prev.id : prev.id + 1 };
}
