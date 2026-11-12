import { useEffect } from "react";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { appLog } from "@/lib/app-log";
import { lastfmArtist } from "@/lib/lastfm";
import { watchListen } from "@/lib/yt-history";
import { usePlaybackStore, type QueueTrack } from "@/lib/store/playback";
import { useSettingsStore } from "@/lib/store/settings";

/**
 * ListenBrainz scrobbling, with a user token the listener pastes in Settings.
 * One endpoint does both halves: `playing_now` when a track's audio starts, and a
 * `single` listen once it has played for half its length or 4 minutes,
 * whichever is less (ListenBrainz's own rule; unlike Last.fm there is no
 * 30-second floor). The token is a bearer credential: it goes in the
 * Authorization header and nowhere else, never into a log line.
 *
 * Best effort: a listen that fails to send isn't queued for retry, unlike
 * Last.fm's. A rejected token (401) turns submitting off and says so in
 * Settings.
 */

const API = "https://api.listenbrainz.org/1";
const CAP_SECONDS = 240;
export const REJECTED =
  "ListenBrainz didn't accept this token. Paste a current one from listenbrainz.org/settings.";

/** Seconds of real listening after which a track counts as a listen. */
export function listenThreshold(durationSec: number): number {
  return durationSec > 0 ? Math.min(durationSec / 2, CAP_SECONDS) : CAP_SECONDS;
}

/** One listen in ListenBrainz's submit-listens shape. */
export function listenPayload(
  track: QueueTrack,
  durationSec: number,
  listenedAt?: number,
) {
  const additional_info: Record<string, string | number> = {
    media_player: "Radif",
    submission_client: "Radif",
    music_service: "music.youtube.com",
    origin_url: `https://music.youtube.com/watch?v=${track.videoId}`,
  };
  if (durationSec > 0)
    additional_info.duration_ms = Math.round(durationSec * 1000);
  return {
    ...(listenedAt !== undefined ? { listened_at: listenedAt } : {}),
    track_metadata: {
      artist_name: lastfmArtist(track),
      track_name: track.title,
      ...(track.album ? { release_name: track.album } : {}),
      additional_info,
    },
  };
}

/** The account a token belongs to, or null when ListenBrainz rejects it.
 *  Throws on a network failure, which says nothing about the token. */
export async function validateToken(token: string): Promise<string | null> {
  const r = await tauriFetch(`${API}/validate-token`, {
    headers: { Authorization: `Token ${token}` },
  });
  if (!r.ok) {
    await r.text().catch(() => ""); // release the native response
    if (r.status === 401) return null;
    throw new Error(`ListenBrainz answered ${r.status}`);
  }
  const body = (await r.json()) as { valid?: boolean; user_name?: string };
  return body.valid && body.user_name ? body.user_name : null;
}

async function submit(
  listenType: "playing_now" | "single",
  payload: ReturnType<typeof listenPayload>,
): Promise<void> {
  const { listenbrainzToken: token } = useSettingsStore.getState();
  if (!token) return;
  try {
    const r = await tauriFetch(`${API}/submit-listens`, {
      method: "POST",
      headers: {
        Authorization: `Token ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ listen_type: listenType, payload: [payload] }),
    });
    // Read to the end: the plugin holds the native response until then.
    await r.text().catch(() => "");
    if (r.status === 401) {
      const s = useSettingsStore.getState();
      // Only the token this request carried: one replaced since stays on.
      if (s.listenbrainzToken !== token) return;
      s.setListenbrainzError(REJECTED);
      s.setListenbrainzEnabled(false);
      appLog("[listenbrainz] token rejected; submitting turned off");
    } else if (!r.ok) {
      appLog(`[listenbrainz] ${listenType} failed: ${r.status}`);
    }
  } catch (e) {
    appLog(
      `[listenbrainz] ${listenType} failed: ${e instanceof Error ? e.name : "request failed"}`,
    );
  }
}

/** False until the release that ships ListenBrainz: its Settings block is
 *  hidden and nothing is sent, even with a token kept from a test build.
 *  Delete it in that release. */
export const LISTENBRAINZ_SHIPPED = false;

/** Mounted once in AppShell, next to the Last.fm scrobbler. Each play is
 *  timed by `watchListen`, the clock YouTube history uses: playing_now when
 *  the audio first moves, a listen at half the track or 4 minutes. Keyed on
 *  the slot, so two copies of a song are two plays; a song repeated in place
 *  (repeat-one) counts once, as with Last.fm and history. */
export function useListenbrainzScrobbler(): void {
  const enabled = useSettingsStore((s) => s.listenbrainzEnabled);
  const hasToken = useSettingsStore((s) => !!s.listenbrainzToken);
  const active = LISTENBRAINZ_SHIPPED && enabled && hasToken;
  const index = usePlaybackStore((s) => s.index);
  const videoId = usePlaybackStore((s) =>
    s.index >= 0 ? s.queue[s.index]?.videoId : undefined,
  );

  useEffect(() => {
    const t = usePlaybackStore.getState().queue[index];
    if (!active || !videoId || t?.videoId !== videoId) return;
    let startedAt: number | undefined;
    return watchListen(
      () => {
        const { duration } = usePlaybackStore.getState();
        const dur = Number.isFinite(duration) && duration > 0 ? duration : 0;
        const at = startedAt ?? Math.floor(Date.now() / 1000);
        void submit("single", listenPayload(t, dur, at));
      },
      {
        capSeconds: CAP_SECONDS,
        onStart: (ms) => {
          startedAt = Math.floor(ms / 1000);
          void submit("playing_now", listenPayload(t, 0));
        },
      },
    );
  }, [active, videoId, index]);
}
