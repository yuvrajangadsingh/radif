import { appLog } from "@/lib/app-log";
import type { Lyrics } from "@/lib/lyrics/types";

/**
 * Is this "lyrics" text actually a scraped web page's chrome?
 *
 * 2026-09-04, "Night Out" by Arjan Dhillon: every LRCLIB record for the
 * track begins `Menu / Home / News / Quiz / Charts / Stories / SWITCH
 * SKIN / You Are Here / Home`. Someone uploaded a lyrics site's navigation
 * menu as the words, YouTube Music had none for the track, LRCLIB was next
 * in line, and the app showed a menu in the fullscreen player. Community
 * databases will always hold a few of these, so every provider's result
 * passes through here before it can win.
 *
 * Two rules, both deliberately narrow so a real song cannot trip them:
 *   - three or more of the first fifteen lines are, whole, a known piece
 *     of site chrome ("Menu", "Home", "Privacy Policy"...), or
 *   - two are, and at least eight of those lines are the one-or-two-word
 *     unpunctuated labels a navigation bar is made of.
 * A lyric that happens to contain the line "Home" is not enough on its
 * own, and short-lined real lyrics ("Yeah", "Oh", "Baby") carry no chrome
 * words at all.
 */
const CHROME_LINES = new Set([
  "menu",
  "home",
  "news",
  "quiz",
  "charts",
  "stories",
  "switch skin",
  "you are here",
  "login",
  "log in",
  "sign in",
  "sign up",
  "register",
  "search",
  "subscribe",
  "privacy policy",
  "terms",
  "terms of use",
  "terms of service",
  "cookie policy",
  "contact",
  "contact us",
  "about",
  "about us",
  "advertisement",
  "read more",
  "share",
  "download",
  "next",
  "previous",
  "related",
  "popular",
  "trending",
  "categories",
  "tags",
  "comments",
  "copyright",
  "all rights reserved",
]);

const HEAD_LINES = 15;
const CHROME_HITS_ALONE = 3;
const CHROME_HITS_WITH_SHAPE = 2;
const SHORT_LABEL_RUN = 8;

function chromeKey(line: string): string {
  return line
    .toLowerCase()
    .replace(/[^\p{L}\p{N} ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function looksLikeSiteChrome(lines: string[]): boolean {
  const head = lines
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, HEAD_LINES);
  if (head.length === 0) return false;
  // DISTINCT chrome terms. A hook that repeats ("Home / Home / Home") is
  // one word said three times, not three pieces of a navigation bar.
  const chromeHits = new Set(
    head.map(chromeKey).filter((k) => CHROME_LINES.has(k)),
  ).size;
  if (chromeHits >= CHROME_HITS_ALONE) return true;
  if (chromeHits < CHROME_HITS_WITH_SHAPE) return false;
  const shortLabels = head.filter(
    (l) => l.split(/\s+/).length <= 2 && !/[.,!?'"…;:()]/.test(l),
  ).length;
  return shortLabels >= SHORT_LABEL_RUN;
}

function linesOf(lyrics: Lyrics): string[] {
  if (lyrics.kind === "timed") return lyrics.lines.map((l) => l.text);
  return lyrics.text.split(/\r?\n/);
}

/**
 * Wrap a provider result: anything that reads as site chrome becomes
 * "no lyrics from this source", logged, so the next source gets its turn
 * instead of a menu winning the display.
 */
export function rejectSiteChrome(source: string) {
  return (lyrics: Lyrics | null): Lyrics | null => {
    if (!lyrics) return null;
    if (!looksLikeSiteChrome(linesOf(lyrics))) return lyrics;
    appLog(
      `lyrics from ${source} rejected: reads as a web page's navigation, not lyrics`,
    );
    return null;
  };
}

/**
 * Do these plain lyrics belong to another song?
 *
 * 2026-11-09, "These Boots Are Made For Walkin'" (Nancy Sinatra, live on Ed
 * Sullivan, GM1kzbAgo_E): YouTube Music's own lyrics for that video are
 * another song's ("Staring at the lonely avenue"), so a videoId-keyed lookup
 * can be wrong too. No lyrics beats another song's, as with artist-less
 * tracks, so the cost of a wrong call is a blank panel; the rule is narrow
 * for that reason. Plain text only, Latin letters only, and the title needs
 * three words of four letters or more (past a few fillers) of which none
 * shows up in the words. A title word matches a sung word that starts with
 * its first five letters, so romanized spellings and dropped endings still
 * match (udeek and udeekdian, goin and going), and a two-word title that's
 * never sung (Bohemian Rhapsody) is left alone.
 */
const TITLE_FILLER = new Set([
  "that",
  "this",
  "these",
  "those",
  "with",
  "from",
  "your",
  "what",
  "when",
  "have",
  "just",
  "into",
  "feat",
]);

export function offTitle(title: string, text: string): boolean {
  const [t, l] = [title, text].map((x) =>
    x.normalize("NFD").replace(/\p{M}/gu, ""),
  );
  if (/(?!\p{Script=Latin})\p{L}/u.test(t + l)) return false;
  // "(2011 Remaster)", "[Live]", "- Radio Edit" name the recording, not
  // the song, so they don't count toward the three words. A bracket left
  // over means a title too odd to judge.
  let song = t;
  for (let prev = ""; prev !== song;) {
    prev = song;
    song = song.replace(/[([][^()[\]]*[)\]]/g, " ");
  }
  if (/[()[\]]/.test(song)) return false;
  const main = (x: string) =>
    x
      .toLowerCase()
      .split(/[^a-z]+/)
      .filter((w) => w.length >= 4 && !TITLE_FILLER.has(w));
  if (main(song.split(/\s[-\u2013\u2014]\s/)[0]).length < 3) return false;
  // Any title word may be the sung one, the labels included.
  const titleWords = main(t);
  const sung = l.toLowerCase().split(/[^a-z]+/);
  return !titleWords.some((w) => sung.some((s) => s.startsWith(w.slice(0, 5))));
}

export function rejectOffTitle(source: string, title: string | undefined) {
  return (lyrics: Lyrics | null): Lyrics | null => {
    if (!lyrics || lyrics.kind !== "plain" || !title) return lyrics;
    if (!offTitle(title, lyrics.text)) return lyrics;
    appLog(
      `lyrics from ${source} rejected: none of the title's main words in them, likely another song's`,
    );
    return null;
  };
}
