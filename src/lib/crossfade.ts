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
/** How early the next track is loaded into the idle element. */
export const PREP_LEAD_S = 20;

/**
 * Gapless: how long before the outgoing track's end the incoming one is
 * started, to cover the time it takes to start making sound. B's `playing`
 * event comes 13 to 33 ms after play(), but its sound comes much later:
 * round 27 recorded the app's output at 45 ms and found 397 to 485 ms of
 * silence at all 4 changes on Alive 2007, with A played to its file's end
 * and B from its start. The earlier rounds (90, 60, 45 ms) timed `playing`,
 * so they never saw it. 500 covers the measured start-up; the low end
 * would overlap by about 60 ms.
 */
export const GAPLESS_HEAD_START_MS = 500;
/** B ramps up from 0 over this long, so a small overlap can't click. */
export const GAPLESS_RAMP_MS = 15;

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
