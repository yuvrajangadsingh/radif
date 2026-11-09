import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { AlertCircleIcon, Loader2Icon, LogInIcon } from "lucide-react";
import { AnimatedTabs } from "@/components/ui/animated-tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ShelfCard } from "@/components/shared/shelf-card";
import { TrackList } from "@/components/shared/track-list";
import {
  fetchLibraryAlbums,
  fetchLibraryArtists,
  fetchLibraryPlaylists,
  type LibrarySection,
} from "@/lib/innertube/library";
import {
  fetchUserPlaylists,
  type UserPlaylist,
} from "@/lib/innertube/mutations";
import type { ShelfItem } from "@/lib/innertube/types";
import { trackMatches } from "@/lib/track-match";
import {
  fetchPlaylist,
  fetchPlaylistContinuation,
  fetchPlaylistFirstPage,
  type PlaylistFirstPage,
  type PlaylistNextPage,
} from "@/lib/innertube/playlist";
import { useAccounts } from "@/lib/store/accounts";
import { authLoggedInQuery } from "@/lib/store/auth-queries";
import { openSettings } from "@/lib/store/settings-dialog";

export const Route = createFileRoute("/library")({
  component: LibraryPage,
});

function LibraryPage() {
  const loggedIn = useQuery(authLoggedInQuery);

  const [tab, setTab] = useState("playlists");

  if (loggedIn.data === false) {
    return <LoggedOutState />;
  }

  return (
    <div className="flex flex-col gap-6 px-6 pb-6 pt-3">
      <h1 className="text-3xl font-bold tracking-tight">Library</h1>
      <AnimatedTabs
        activeTab={tab}
        onChange={setTab}
        tabs={[
          { id: "playlists", label: "Playlists" },
          { id: "songs", label: "Songs" },
          { id: "albums", label: "Albums" },
          { id: "artists", label: "Artists" },
        ]}
      />
      <div className="pt-2">
        {tab === "playlists" && (
          <div className="flex flex-col gap-6">
            <PlaylistSearch />
            <SectionsView
              queryKey={["library", "playlists"]}
              fetcher={fetchLibraryPlaylists}
            />
          </div>
        )}
        {tab === "songs" && <LikedSongsView />}
        {tab === "albums" && (
          <SectionsView
            queryKey={["library", "albums"]}
            fetcher={fetchLibraryAlbums}
          />
        )}
        {tab === "artists" && (
          <SectionsView
            queryKey={["library", "artists"]}
            fetcher={fetchLibraryArtists}
          />
        )}
      </div>
    </div>
  );
}

type SongSearch = {
  query: string;
  done: number;
  total: number;
  failed: number;
  hits: { playlist: UserPlaylist; tracks: ShelfItem[] }[];
};

// Rows shown per playlist; the rest are a click away on the playlist itself.
const HITS_SHOWN = 50;
const LIKED: UserPlaylist = { id: "LM", title: "Liked Music" };

/**
 * Search your playlists: titles as you type, and on Enter the songs in all of
 * them, Liked Music included. A playlist is loaded whole the first time
 * (`fetchPlaylist`), one after another a beat apart, and kept in memory for
 * the next search, per account. One that fails is passed over and counted.
 *
 * ponytail: fetchPlaylist keeps what it got when a later page fails, so a
 * playlist can be searched in part without saying so, and nothing backs off
 * on a 429. Surface both if big libraries hit them.
 */
function PlaylistSearch() {
  const qc = useQueryClient();
  const account = useAccounts().data?.find((a) => a.isActive)?.id;
  const accountRef = useRef(account);
  accountRef.current = account;
  const playlists = useQuery({
    queryKey: ["user-playlists"],
    queryFn: () => fetchUserPlaylists(),
  });
  const [text, setText] = useState("");
  const wanted = text.trim().toLowerCase();
  const titleHits = wanted
    ? (playlists.data ?? []).filter((p) =>
        p.title.toLowerCase().includes(wanted),
      )
    : [];
  const [songs, setSongs] = useState<SongSearch | null>(null);
  // A newer search, or leaving the page, stops the one running.
  const runRef = useRef(0);
  useEffect(
    () => () => {
      runRef.current++;
    },
    [],
  );

  const searchSongs = async () => {
    if (!wanted || !account || !playlists.isSuccess) return;
    const list = [LIKED, ...(playlists.data ?? [])];
    const run = ++runRef.current;
    // An older search's loads carry its stop check; start them fresh.
    await qc.cancelQueries({ queryKey: ["playlist-full"] });
    if (runRef.current !== run) return;
    // A newer search, leaving the page, or an account switch ends this one.
    const stale = () =>
      runRef.current !== run || accountRef.current !== account;
    setSongs({
      query: wanted,
      done: 0,
      total: list.length,
      failed: 0,
      hits: [],
    });
    for (const [i, playlist] of list.entries()) {
      if (i > 0) await new Promise((r) => setTimeout(r, 250));
      if (stale()) return;
      let tracks: ShelfItem[] = [];
      let failed = 0;
      try {
        const page = await qc.fetchQuery({
          queryKey: ["playlist-full", account, playlist.id],
          queryFn: () => fetchPlaylist(playlist.id, stale),
          staleTime: 10 * 60_000,
        });
        tracks = page.tracks.filter((t) => trackMatches(t, wanted));
      } catch {
        failed = 1;
      }
      if (stale()) return;
      setSongs(
        (s) =>
          s && {
            ...s,
            done: i + 1,
            failed: s.failed + failed,
            hits: tracks.length ? [...s.hits, { playlist, tracks }] : s.hits,
          },
      );
    }
  };

  const searching = songs && songs.done < songs.total;
  return (
    <div className="flex flex-col gap-4">
      <form
        className="flex max-w-xl items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void searchSongs();
        }}
      >
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Search your playlists"
          aria-label="Search your playlists"
        />
        <Button
          type="submit"
          variant="outline"
          disabled={!wanted || !playlists.isSuccess}
        >
          Search songs
        </Button>
      </form>
      {playlists.isError ? (
        <span className="text-sm text-muted-foreground">
          Couldn't load your playlists to search them.
        </span>
      ) : null}
      {titleHits.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {titleHits.map((p) => (
            <Button key={p.id} variant="secondary" size="sm" asChild>
              <Link to="/playlist/$id" params={{ id: p.id }}>
                {p.title}
              </Link>
            </Button>
          ))}
        </div>
      ) : null}
      {songs ? (
        <div className="flex flex-col gap-6">
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            {searching ? (
              <Loader2Icon className="size-3.5 animate-spin" />
            ) : null}
            {searching
              ? `Searching your playlists, ${songs.done} of ${songs.total}`
              : songs.hits.length === 0
                ? `No songs matching "${songs.query}" in your playlists.`
                : `Songs matching "${songs.query}"`}
            {songs.failed > 0
              ? ` (${songs.failed} ${songs.failed === 1 ? "playlist" : "playlists"} couldn't be searched)`
              : null}
          </span>
          {songs.hits.map(({ playlist, tracks }) => (
            <section key={playlist.id} className="flex flex-col gap-2">
              <Link
                to="/playlist/$id"
                params={{ id: playlist.id }}
                className="text-sm font-semibold hover:underline"
              >
                {playlist.title}
              </Link>
              <TrackList
                tracks={tracks.slice(0, HITS_SHOWN)}
                virtualize={false}
              />
              {tracks.length > HITS_SHOWN ? (
                <span className="text-sm text-muted-foreground">
                  {tracks.length - HITS_SHOWN} more in this playlist
                </span>
              ) : null}
            </section>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function LoggedOutState() {
  return (
    <div className="flex flex-col items-center gap-4 p-12 text-center">
      <LogInIcon className="size-12 text-muted-foreground" />
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold">Sign in to see your library</h2>
        <p className="text-sm text-muted-foreground">
          Import your YouTube Music session from a browser to unlock liked
          songs, playlists, and premium-quality streams.
        </p>
      </div>
      <Button onClick={() => openSettings("general")}>Go to Settings</Button>
    </div>
  );
}

function SectionsView({
  queryKey,
  fetcher,
}: {
  queryKey: readonly string[];
  fetcher: () => Promise<LibrarySection[]>;
}) {
  const { data, isLoading, error } = useQuery({
    queryKey,
    queryFn: fetcher,
  });

  if (error) return <ErrorCard message={(error as Error).message} />;
  if (isLoading) return <SectionsSkeleton />;
  if (!data || data.length === 0) {
    return <p className="text-sm text-muted-foreground">Nothing here yet.</p>;
  }

  // Flatten all sections into a single grid. Library shelves come back with
  // auto-generated "Section N" titles from the parser fallback, so a flat
  // grid reads cleaner than multiple titled rows.
  const items = data.flatMap((s) => s.items);

  return (
    <div className="grid w-full gap-2 grid-cols-[repeat(auto-fill,minmax(min(100%,11rem),1fr))] [&>*]:max-w-[20rem]">
      {items.map((item) => (
        <ShelfCard key={`${item.kind}:${item.id}`} item={item} />
      ))}
    </div>
  );
}

type AnyPage = PlaylistFirstPage | PlaylistNextPage;

function LikedSongsView() {
  const query = useInfiniteQuery<AnyPage, Error>({
    queryKey: ["library", "liked-songs-pages"],
    initialPageParam: undefined,
    queryFn: async ({ pageParam }) => {
      if (!pageParam) return fetchPlaylistFirstPage("LM");
      return fetchPlaylistContinuation(pageParam as string);
    },
    getNextPageParam: (lastPage) => lastPage.continuationToken,
  });

  const pages = query.data?.pages ?? [];
  const tracks = useMemo(() => pages.flatMap((p) => p.tracks), [pages]);

  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    if (!query.hasNextPage) return;
    // Stop auto-loading once a continuation errored (avoids an unbounded
    // retry loop while the sentinel stays visible).
    if (query.error) return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && !query.isFetchingNextPage) {
            query.fetchNextPage();
          }
        }
      },
      { rootMargin: "600px 0px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [query.hasNextPage, query.isFetchingNextPage, query.fetchNextPage, query.error]);

  // Only show the full error card before any tracks load; a failed
  // continuation must not wipe the already-loaded liked-songs list.
  if (query.error && tracks.length === 0)
    return <ErrorCard message={query.error.message} />;
  if (query.isLoading) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 10 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }
  if (tracks.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No liked songs yet.</p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <TrackList tracks={tracks} />
      {query.hasNextPage && (
        <div
          ref={sentinelRef}
          className="flex items-center justify-center py-6 text-sm text-muted-foreground"
        >
          {query.isFetchingNextPage ? (
            <>
              <Loader2Icon className="mr-2 size-4 animate-spin" />
              Loading more…
            </>
          ) : (
            <span className="sr-only">Scroll to load more</span>
          )}
        </div>
      )}
    </div>
  );
}

function SectionsSkeleton() {
  return (
    <div className="grid w-full gap-2 grid-cols-[repeat(auto-fill,minmax(min(100%,11rem),1fr))] [&>*]:max-w-[20rem]">
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={i} className="flex flex-col gap-2 p-2">
          <Skeleton className="aspect-square w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}

function ErrorCard({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
      <AlertCircleIcon className="size-5 shrink-0 text-destructive" />
      <div className="flex flex-col gap-1">
        <span className="font-medium">Couldn't load library</span>
        <span className="text-muted-foreground">{message}</span>
      </div>
    </div>
  );
}
