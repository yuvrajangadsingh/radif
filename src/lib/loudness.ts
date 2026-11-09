import { useEffect, useState } from "react";
import { appLog } from "@/lib/app-log";
import { playerInfo } from "@/lib/player-info";
import { useAccounts } from "@/lib/store/accounts";
import { useSettingsStore } from "@/lib/store/settings";

/**
 * Tracks louder than this are turned down to it. YouTube Music's own reference
 * is -7 LKFS, and attenuating to that changed nothing on the four tracks
 * measured (-7.58 to -14.22), so this sits where those actually differ.
 */
const TARGET_LKFS = -14;
const YOUTUBE_REFERENCE_LKFS = -7;

/** Element gain from `playerConfig.audioConfig`. `loudnessDb` is the track
 *  relative to YouTube's reference. Only ever turns down: at full slider an
 *  element has no room above 1, so boosting would make the same setting behave
 *  differently at different volumes. */
export function loudnessGain(audioConfig: unknown): number {
  const c = audioConfig as
    { loudnessDb?: unknown; loudnessTargetLkfs?: unknown } | null | undefined;
  if (typeof c?.loudnessDb !== "number") return 1;
  const reference =
    typeof c.loudnessTargetLkfs === "number"
      ? c.loudnessTargetLkfs
      : YOUTUBE_REFERENCE_LKFS;
  return Math.min(1, 10 ** ((TARGET_LKFS - (c.loudnessDb + reference)) / 20));
}

// A track's loudness doesn't change, so its gain is kept for the session.
// ponytail: unbounded, a number per track played or queued next; cap it if
// sessions ever run to tens of thousands of tracks.
const gains = new Map<string, number>();

/** The gain for one track, asked once per session. A failure or a response
 *  with no loudness isn't kept. */
export function trackGain(
  videoId: string,
  account: string,
  pageId: string | null,
): Promise<number> {
  const hit = gains.get(videoId);
  if (hit !== undefined) return Promise.resolve(hit);
  return playerInfo(videoId, account, pageId).then((player) => {
    const config = player?.playerConfig?.audioConfig;
    const gain = loudnessGain(config);
    appLog(
      `[loudness] ${videoId}: loudnessDb ${config?.loudnessDb} gain ${gain.toFixed(3)}`,
    );
    // Only a measurement is kept: a response without one (a playability or
    // auth failure answered 200) is asked again next time.
    if (typeof config?.loudnessDb === "number") gains.set(videoId, gain);
    return gain;
  });
}

/** The gain for what's playing, 1 while the setting is off. A track already
 *  asked about (played before, or fetched while the one before it played)
 *  starts at its own gain; a new one keeps the previous gain until its
 *  answer lands, 0.5 to 1 s. Once it does, the next track's is fetched. */
export function useLoudnessGain(
  videoId: string | undefined,
  nextVideoId: string | undefined,
): number {
  const enabled = useSettingsStore((s) => s.normalizeVolume);
  const active = useAccounts().data?.find((a) => a.isActive);
  const account = active?.id;
  const pageId = active?.pageId ?? null;
  const [gain, setGain] = useState(1);
  useEffect(() => {
    if (!enabled || !videoId || !account) {
      setGain(1);
      return;
    }
    let stale = false;
    trackGain(videoId, account, pageId).then(
      (next) => {
        if (stale) return;
        setGain(next);
        if (nextVideoId && nextVideoId !== videoId) {
          trackGain(nextVideoId, account, pageId).catch(() => {
            /* asked again when it plays */
          });
        }
      },
      (e: unknown) => {
        if (stale) return;
        appLog(
          `[loudness] ${videoId} failed: ${e instanceof Error ? e.name : "request failed"}`,
        );
        setGain(1);
      },
    );
    return () => {
      stale = true;
    };
  }, [enabled, videoId, nextVideoId, account, pageId]);
  const known = enabled && videoId && account ? gains.get(videoId) : undefined;
  return known ?? gain;
}
