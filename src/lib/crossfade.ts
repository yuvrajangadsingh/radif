/**
 * Crossfade and gapless schedule. Pure so it's unit-testable; the audio
 * engine feeds it live values and owns the two elements.
 */
import { OUTRO_GRACE_S, OUTRO_TAIL_MIN_S } from "@/lib/outro";

/** Either track shorter than this never fades. */
export const MIN_TRACK_S = 10;
/** A fade with less than this left isn't worth starting. */
export const MIN_FADE_S = 0.5;
/** How long a skip mid-fade takes to silence the outgoing element. Pausing
 *  it at volume clicks. */
export const SKIP_RAMP_MS = 150;
/** How far the app's audio output runs behind a volume change or a pause:
 *  a pause is heard about 0.3 s later (QA rounds 27 and 29). A ramp that
 *  ends in a pause is dropped with the queued audio, so an element keeps
 *  playing at 0 this long before it's stopped. */
export const OUTPUT_DELAY_MS = 300;
/** How early the next track is loaded into the idle element. */
export const PREP_LEAD_S = 20;

/**
 * Gapless: how long before the outgoing track's end the incoming one is
 * started. B's sound comes 264 to 444 ms after its play(), and it varies
 * that much from one join to the next (QA round 30, from the output: head
 * start plus the measured gap or overlap), so no head start can land a
 * join exactly. Started 500 ms early, B is heard by 56 ms before A's end
 * at the slowest measured start, so there's no gap. It comes up from
 * silence under A over the last GAPLESS_BLEND_MS (gaplessGain), so a fast
 * start overlaps A by up to 236 ms, blended rather than at full. A plays
 * untouched to its end. Exact joins need Web Audio scheduling (backlog).
 */
export const GAPLESS_HEAD_START_MS = 500;
/** How long before A's end B rises from 0 to full: 500 - 264, so even the
 *  fastest measured start is heard from (nearly) 0. */
export const GAPLESS_BLEND_MS = 240;

/** B's gain at `msToEnd` before A's end: 0 until the blend window, then
 *  up the crossfade's equal-power curve to full at A's end. */
export function gaplessGain(msToEnd: number): number {
  return fadeGains(1 - msToEnd / GAPLESS_BLEND_MS).in;
}

/**
 * Where the current track actually stops: the earliest of the element's
 * real end, the corrected end of a doubled-header file, the metadata-end
 * guard and the long-outro skip. These mirror the guards in audio-engine.ts
 * that call advanceAfterTrack, so a fade ends where playback would have.
 * `outroAllowed` is false once the user seeked into the tail on purpose.
 */
export function effectiveEnd(i: {
  elementDuration: number;
  duration: number;
  metaDuration: number;
  lastVocal: number | null;
  outroAllowed: boolean;
}): number | null {
  const ends: number[] = [];
  const raw = i.elementDuration;
  if (Number.isFinite(raw) && raw > 0) ends.push(raw);
  if (i.duration > 0 && raw > 0) {
    const ratio = raw / i.duration;
    if (ratio > 1.8 && ratio < 2.2) ends.push(i.duration);
  }
  if (i.outroAllowed) {
    const meta = i.metaDuration;
    if (meta > 60 && raw > meta * 1.5) ends.push(meta + 2);
    const v = i.lastVocal;
    if (v && v < i.duration && i.duration - v > OUTRO_TAIL_MIN_S) {
      ends.push(v + OUTRO_GRACE_S);
    }
  }
  return ends.length ? Math.min(...ends) : null;
}

/** The fade length for this pair: the setting, capped at a third of the
 *  shorter track; 0 when off or when either track is under MIN_TRACK_S. */
export function fadeLength(
  settingS: number,
  currentS: number,
  nextS: number,
): number {
  if (settingS <= 0) return 0;
  const shorter = Math.min(currentS, nextS);
  if (!(shorter >= MIN_TRACK_S)) return 0;
  return Math.min(settingS, shorter / 3);
}

/**
 * Whether to start the fade now, and over how long. It starts at
 * `end - length`; a playhead already past that (a seek into the window)
 * fades over the time that's left.
 */
export function fadeNow(
  position: number,
  end: number,
  length: number,
): number | null {
  if (length <= 0 || position < end - length) return null;
  const left = end - position;
  return left >= MIN_FADE_S ? Math.min(length, left) : null;
}

/** Equal-power gains at progress t (0..1), so the middle doesn't dip. */
export function fadeGains(t: number): { out: number; in: number } {
  const x = Math.max(0, Math.min(1, t));
  return { out: Math.cos((x * Math.PI) / 2), in: Math.sin((x * Math.PI) / 2) };
}

/** Why no crossfade or gapless handoff for this track, or null when allowed. */
export function handoffBlocked(i: {
  hasNext: boolean;
  repeatOne: boolean;
  casting: boolean;
  video: boolean;
  sleepAfterTrack: boolean;
}): string | null {
  if (!i.hasNext) return "no next track";
  if (i.repeatOne) return "repeat one";
  if (i.casting) return "casting";
  if (i.video) return "video";
  if (i.sleepAfterTrack) return "sleep after this track";
  return null;
}
