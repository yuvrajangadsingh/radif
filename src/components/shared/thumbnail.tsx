import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { cacheCoverToDisk } from "@/lib/cover-art";
import { appLog } from "@/lib/app-log";
import type { Thumbnail as YtThumbnail } from "@/lib/innertube/types";

/**
 * Try to coax a higher-resolution variant out of a thumbnail URL.
 *
 *  - `lh3.googleusercontent.com` / `yt3.ggpht.com` covers come with
 *    size params:
 *      • `=w120-h120-l90-rj`              — width/height pair
 *      • `=s120-c-k-c0x00ffffff-no-rj`    — single dimension square
 *      • `=w120-h120-c-k-l90-rj`          — w/h with crop modifiers
 *    We swap the leading size token for a bigger one and KEEP the
 *    trailing modifiers (`-l90`, `-rj`, `-c`, etc.) intact.
 *  - `i.ytimg.com/vi/{id}/{preset}.jpg` → `maxresdefault.jpg`. Not
 *    every video has it, so callers must wire `onError` fallback.
 *  - lh3 URL with NO size token at all → append one (some thumbnails
 *    arrive without any size hint).
 *
 * Returns `null` when no upgrade applies.
 */
export function getHighResVariant(url: string, size = 1080): string | null {
  if (/=w\d+-h\d+/.test(url)) {
    return url.replace(/=w\d+-h\d+/, `=w${size}-h${size}`);
  }
  if (/=s\d+/.test(url)) {
    return url.replace(/=s\d+/, `=s${size}`);
  }
  const ytMatch = url.match(/(\/vi\/[^/]+\/)[^./]+\.jpg/);
  if (ytMatch) {
    return url.replace(ytMatch[0], `${ytMatch[1]}maxresdefault.jpg`);
  }
  if (
    /(?:lh3\.googleusercontent\.com|yt3\.ggpht\.com)/.test(url) &&
    !url.includes("=")
  ) {
    return `${url}=w${size}-h${size}-l90-rj`;
  }
  return null;
}

export function pickThumbnail(
  thumbnails: YtThumbnail[],
  targetSize = 256,
): string | null {
  if (!thumbnails.length) return null;
  // Prefer the smallest thumbnail that is still ≥ targetSize; fall back to largest.
  const sorted = [...thumbnails].sort(
    (a, b) => (a.width ?? 0) - (b.width ?? 0),
  );
  const match = sorted.find((t) => (t.width ?? 0) >= targetSize);
  return (match ?? sorted[sorted.length - 1]).url;
}

/** WebKitGTK decodes YouTube's 404 placeholder as a successful image. */
function isYtPlaceholder(img: HTMLImageElement): boolean {
  return img.naturalWidth <= 120 && img.naturalHeight <= 90;
}

/**
 * Pick the largest thumbnail variant the API shipped — used as the
 * safe fallback when a `high-res` upgrade attempt fails to load.
 */
export function pickHighResThumbnail(thumbnails: YtThumbnail[]): string | null {
  if (!thumbnails.length) return null;
  const sorted = [...thumbnails].sort(
    (a, b) => (a.width ?? 0) - (b.width ?? 0),
  );
  return sorted[sorted.length - 1].url;
}

/**
 * All thumbnail URLs, largest first, deduped. Used to build a fallback
 * chain for the fullscreen backdrop + accent: the single largest variant
 * (a maxres upgrade) sometimes 404s, so callers walk down to the next size
 * on failure instead of falling flat to black + red.
 */
export function thumbnailUrlsBySize(thumbnails: YtThumbnail[]): string[] {
  const urls = [...thumbnails]
    .sort((a, b) => (b.width ?? 0) - (a.width ?? 0))
    .map((t) => t.url)
    .filter(Boolean);
  return [...new Set(urls)];
}

type Props = {
  thumbnails: YtThumbnail[];
  alt: string;
  round?: boolean;
  className?: string;
  targetSize?: number;
  /** Opt in to fetching a higher-res render (player big cover, blurred
   *  background). When the rewritten URL fails to load we transparently
   *  fall back to the largest API-shipped variant. */
  highRes?: boolean;
  /** External hi-res override (e.g. iTunes 3000×3000 studio art looked
   *  up by the player bar). When set, this URL is preferred over the
   *  YT-derived upgrade. Falls through to the YT chain on load error. */
  overrideHighRes?: string | null;
};

export function Thumbnail({
  thumbnails,
  alt,
  round = false,
  className,
  targetSize = 256,
  highRes = false,
  overrideHighRes,
}: Props) {
  // Pick the small variant for the instant-paint layer regardless of
  // highRes — even when the upgraded image is the goal, we want SOMETHING
  // on screen by the next frame instead of a grey square.
  const lowRes = pickThumbnail(thumbnails, targetSize);
  const fallback = highRes ? pickHighResThumbnail(thumbnails) : lowRes;
  // Aim for ~2x targetSize so retina displays stay sharp, but never below
  // 720 — the upgrade is wasted otherwise. Keeps trafic proportional to the
  // actual rendered size instead of always asking for 1080.
  const upgraded =
    highRes && fallback
      ? getHighResVariant(fallback, Math.max(targetSize * 2, 720))
      : null;

  // Reset transient state whenever the source set changes so a track
  // switch doesn't leave us pinned to the previous track's flags.
  const [errored, setErrored] = useState(false);
  const [overrideErrored, setOverrideErrored] = useState(false);
  const [hiResLoaded, setHiResLoaded] = useState(false);
  // URLs that failed with nothing left to fall back to. Not rendered, so
  // the bg-muted box shows instead of WebKit's broken-image icon and alt.
  const [dead, setDead] = useState<string[]>([]);
  // Resolved hi-res URL: either the localhost /cover URL (after the
  // Rust side has the bytes pinned to disk) or the original `upgraded`
  // URL if the resolve failed. Stays null until the resolve completes
  // — until then the blur-up base layer is what the user sees.
  const [resolvedUpgraded, setResolvedUpgraded] = useState<string | null>(null);

  useEffect(() => {
    setErrored(false);
    setOverrideErrored(false);
    setHiResLoaded(false);
    setDead([]);
  }, [lowRes, fallback, upgraded, overrideHighRes]);

  // Resolve `upgraded` through the disk cache. After the first session
  // hit for a given URL the in-memory memo returns synchronously, so
  // a re-render of the same thumbnail (track switch back, navigation)
  // stays free.
  useEffect(() => {
    setResolvedUpgraded(null);
    if (!upgraded) return;
    let cancelled = false;
    cacheCoverToDisk(upgraded).then((url) => {
      if (!cancelled) setResolvedUpgraded(url);
    });
    return () => {
      cancelled = true;
    };
  }, [upgraded]);

  // Priority: override (iTunes) → resolvedUpgraded (cached YT high-res
  // or original on cache miss) → fallback (YT largest API variant).
  // On error at any tier we drop to the next. The blur-up low-res
  // layer (the API's smallest variant) is always shown beneath while
  // a hi-res target loads.
  // A URL that failed to load is skipped in every tier (two tiers can share
  // one); when all are dead, `live` hides the image.
  const target =
    [
      overrideHighRes && !overrideErrored ? overrideHighRes : null,
      resolvedUpgraded && !errored ? resolvedUpgraded : null,
    ].find((u) => u && !dead.includes(u)) ?? fallback;
  const markDead = (url: string) => {
    if (dead.includes(url)) return;
    appLog(`[cover] failed to load ${url}`);
    setDead((d) => [...d, url]);
  };
  const live = (url: string | null) => !!url && !dead.includes(url);
  const showLayered = !!(target && lowRes && target !== lowRes);

  // WebKitGTK's placeholder path: drop every tier showing this URL. The
  // last tier stays, since a small image there may be valid art.
  const demoteTarget = () => {
    if (target === overrideHighRes) setOverrideErrored(true);
    if (target === resolvedUpgraded) setErrored(true);
  };
  const onTargetError = () => markDead(target!);

  const sharedImgProps = {
    loading: "lazy",
    decoding: "async",
    // Without `no-referrer` the webview sends `Referer:
    // http://localhost:1420/` to the Google image CDNs, which
    // sometimes triggers their bot/abuse heuristic and the
    // response comes back as an HTML error page — Chromium then
    // CORB-blocks it as a cross-origin protected MIME type.
    // Stripping the referrer makes the request look anonymous and
    // the CDN serves the actual bytes.
    referrerPolicy: "no-referrer",
  } as const;

  return (
    <div
      className={cn(
        "relative overflow-hidden bg-muted",
        round ? "rounded-full" : "rounded-md",
        className,
      )}
    >
      {showLayered ? (
        <>
          {/* Static low-res placeholder — no blur, no scale, no
              transition. Sits underneath the hi-res image and stays
              put while the hi-res cross-fades in on top. */}
          {live(lowRes) && (
            <img
              {...sharedImgProps}
              src={lowRes!}
              alt=""
              aria-hidden="true"
              onError={() => markDead(lowRes!)}
              className="absolute inset-0 size-full object-cover"
            />
          )}
          {live(target) && (
            <img
              {...sharedImgProps}
              src={target!}
              alt={alt}
              onLoad={(e) => {
                if (isYtPlaceholder(e.currentTarget)) demoteTarget();
                else setHiResLoaded(true);
              }}
              onError={onTargetError}
              className={cn(
                "absolute inset-0 size-full object-cover transition-opacity duration-200",
                hiResLoaded ? "opacity-100" : "opacity-0",
              )}
            />
          )}
        </>
      ) : live(target) ? (
        <img
          {...sharedImgProps}
          src={target!}
          alt={alt}
          onLoad={(e) => {
            if (isYtPlaceholder(e.currentTarget)) demoteTarget();
          }}
          onError={onTargetError}
          className="size-full object-cover"
        />
      ) : null}
    </div>
  );
}
