import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { toast } from "sonner";
import {
  HomeIcon,
  CompassIcon,
  SearchIcon,
  LibraryIcon,
  SettingsIcon,
  HeartIcon,
  ListMusicIcon,
  PinIcon,
  PinOffIcon,
  EyeOffIcon,
  UserPlusIcon,
  UserCogIcon,
  UsersRoundIcon,
  CreditCardIcon,
  LogInIcon,
  LogOutIcon,
  ExternalLinkIcon,
  CheckIcon,
  RefreshCwIcon,
  FolderIcon,
  FolderOpenIcon,
  FolderPlusIcon,
  FolderMinusIcon,
  ChevronRightIcon,
  PencilIcon,
  Trash2Icon,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  FOLDERS_SHIPPED,
  useFolders,
  useHidden,
  usePinned,
  usePinnedPlaylistsStore,
  type PinnedPlaylist,
  type PlaylistFolder,
} from "@/lib/store/pinned-playlists";
import { sidebarSections, type SidebarRow } from "@/lib/sidebar-rows";
import { IS_BETA_PLATFORM } from "@/lib/platform";
import { openChannelPicker } from "@/lib/store/channel-picker";
import { openSettings } from "@/lib/store/settings-dialog";
import { UpdateBanner } from "@/components/layout/update-banner";
import { fetchLibraryPlaylists } from "@/lib/innertube/library";
import type { ShelfItem } from "@/lib/innertube/types";
import { resetInnertube } from "@/lib/innertube/client";
import {
  accountSlot,
  credentialState,
  liveAccountState,
} from "@/lib/auth-presence";
import {
  accountInfoQuery,
  activeAccountIdQuery,
  authLoggedInQuery,
} from "@/lib/store/auth-queries";
import { usePremiumStore } from "@/lib/store/premium";
import {
  removeAccount,
  switchAccount,
  useAccounts,
  type AccountSummary,
} from "@/lib/store/accounts";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { to: "/", label: "Home", icon: HomeIcon },
  { to: "/explore", label: "Explore", icon: CompassIcon },
  { to: "/search", label: "Search", icon: SearchIcon },
  { to: "/library", label: "Library", icon: LibraryIcon },
] as const;

// Liked Songs is the YTM magic playlist — browseId `VLLM` (wraps
// playlistId "LM"). Always present, always first in the playlists
// section, not user-removable.
const LIKED_ID = "VLLM";

const MENU_BTN_CLS = "group-data-[collapsible=icon]:mx-auto";
/** A folder's name when none is typed. */
const NEW_FOLDER = "New folder";

export function AppSidebar() {
  const { location } = useRouterState();

  const isOn = (to: string) => location.pathname === to;
  const isPlaylistOn = (id: string) =>
    location.pathname === `/playlist/${id}`;

  return (
    // Collapsed, every row is a bare icon or a cover thumbnail, so the
    // tooltip IS the label and has to arrive at hover speed. The app
    // wide provider waits 800ms, which is right for decorative tooltips
    // and useless here: running your eye down the rail never dwells on
    // one row that long, so nothing ever appeared. Nested provider, so
    // only the sidebar gets the fast delay; skipDelay keeps the rest of
    // a scan instant once the first tooltip has shown.
    <TooltipProvider delayDuration={120} skipDelayDuration={400}>
    <Sidebar
      variant="floating"
      collapsible="icon"
      className="px-2 pb-2 pt-0 duration-300 ease-out [&>[data-slot=sidebar-inner]]:rounded-[10px] [&>[data-slot=sidebar-inner]]:bg-surface [&>[data-slot=sidebar-inner]]:shadow-none"
    >
      <SidebarHeader className="flex-row items-center gap-2 px-4 pt-[18px] pb-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-2">
        {/* Single round logo. In expanded mode it sits at px-4 to line
         *  up with menu icons (which are at group-p-2 + button-p-2 =
         *  16px). In collapsed mode the row centers it like the
         *  centered menu icons below. */}
        <img
          src="/radif-icon.svg"
          alt="Radif"
          className="size-7 shrink-0"
        />
        <span className="text-xl font-semibold leading-none tracking-tight transition-opacity duration-200 group-data-[collapsible=icon]:hidden">
          Radif
        </span>
        {IS_BETA_PLATFORM && (
          <span
            title="The build for this OS is in beta — report anything broken via ⋯ → Report an issue."
            className="rounded-[4px] border border-border/60 bg-muted/40 px-1 pb-px pt-0.5 text-[10px] font-semibold uppercase leading-none tracking-wider text-muted-foreground group-data-[collapsible=icon]:hidden"
          >
            Beta
          </span>
        )}
      </SidebarHeader>

      {/* The content column itself doesn't scroll: Browse stays pinned
          (shrink-0) and only the Playlists list scrolls, so the top nav
          never slides out of view when the library is long. */}
      <SidebarContent className="gap-0 overflow-hidden">
        <SidebarGroup className="shrink-0 py-1">
          <SidebarGroupLabel>Browse</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
                <SidebarMenuItem key={to}>
                  <SidebarMenuButton
                    asChild
                    isActive={isOn(to)}
                    tooltip={label}
                    className={MENU_BTN_CLS}
                  >
                    <Link to={to}>
                      <Icon />
                      <span>{label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarPlaylists isPlaylistOn={isPlaylistOn} />
      </SidebarContent>

      <SidebarFooter>
        <UpdateBanner />
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Settings"
              className={MENU_BTN_CLS}
              onClick={() => openSettings()}
            >
              <SettingsIcon />
              <span>Settings</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <UserProfile />
      </SidebarFooter>
    </Sidebar>
    </TooltipProvider>
  );
}

// Sidebar thumbnails render at 16px, so the largest source (last in the
// list) is fine — the browser downscales it.
function pickThumb(item: ShelfItem): string | undefined {
  return item.thumbnails[item.thumbnails.length - 1]?.url;
}

/**
 * The "Playlists" section. Shows Liked Songs, then every playlist in the
 * user's library. Pinning doesn't gate visibility any more — it only
 * floats a playlist to the top of the list (right under Liked Songs).
 *
 * Shares the `["library", "playlists"]` query cache with the Library
 * page, so opening the sidebar costs no extra fetch once either has
 * loaded. Pinned rows come from local storage and paint instantly, even
 * before the library browse resolves.
 */
function SidebarPlaylists({
  isPlaylistOn,
}: {
  isPlaylistOn: (id: string) => boolean;
}) {
  const loggedIn = useQuery(authLoggedInQuery);
  const library = useQuery({
    queryKey: ["library", "playlists"],
    queryFn: fetchLibraryPlaylists,
    enabled: loggedIn.data === true,
    staleTime: 5 * 60_000,
  });

  const pinned = usePinned();
  const hidden = useHidden();
  const pin = usePinnedPlaylistsStore((s) => s.pin);
  const unpin = usePinnedPlaylistsStore((s) => s.unpin);
  const hide = usePinnedPlaylistsStore((s) => s.hide);
  const folders = useFolders();

  const sections = useMemo(() => {
    return sidebarSections({
      library: (library.data ?? [])
        .flatMap((s) => s.items)
        .map((it) => ({
          id: it.id,
          title: it.title,
          thumbnailUrl: pickThumb(it),
        })),
      pinned,
      hidden,
      folders: FOLDERS_SHIPPED ? folders : [],
      likedId: LIKED_ID,
    });
  }, [library.data, pinned, hidden, folders]);

  // The folder whose name is being typed in place (new or renamed). The
  // field hides in the icon rail, so editing expands the sidebar first.
  const [editingFolder, setEditingFolderState] = useState<string | null>(
    null,
  );
  const { state: railState, setOpen: setSidebarOpen } = useSidebar();
  const setEditingFolder = (id: string | null) => {
    if (id && railState === "collapsed") setSidebarOpen(true);
    setEditingFolderState(id);
  };
  const createFolder = usePinnedPlaylistsStore((s) => s.createFolder);
  const renameFolder = usePinnedPlaylistsStore((s) => s.renameFolder);
  const rowProps = {
    isPlaylistOn,
    pin,
    unpin,
    hide,
    folders: FOLDERS_SHIPPED ? folders : [],
    onNewFolder: (playlistId: string) =>
      setEditingFolder(createFolder(NEW_FOLDER, playlistId)),
  };

  const scrollRef = useRef<HTMLDivElement>(null);

  // Ramp a soft top/bottom fade on the list from its scroll position so
  // rows dissolve into transparency at each edge instead of being cut by
  // a hard line. An edge with nothing beyond it — the top at rest, the
  // bottom when fully scrolled, or a list too short to scroll — stays
  // crisp. Vertical mirror of the carousels' `shelf-edge-fade`.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const FADE_RAMP = 16;
    const clamp = (v: number) => Math.max(0, Math.min(1, v));
    const update = () => {
      const distTop = el.scrollTop;
      const distBottom = el.scrollHeight - el.clientHeight - el.scrollTop;
      el.style.setProperty("--fade-t", clamp(1 - distTop / FADE_RAMP).toFixed(3));
      el.style.setProperty(
        "--fade-b",
        clamp(1 - distBottom / FADE_RAMP).toFixed(3),
      );
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    // Rows load async and grow the scroll height without resizing the
    // container, so watch the inner list too.
    const inner = el.firstElementChild;
    if (inner) ro.observe(inner);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, []);

  // `pe-0` drops the group's right padding so the scroll box reaches the
  // panel edge. `sidebar-list-scroll` (index.css) reserves a stable 8px
  // scrollbar gutter there, so the rows keep a constant right inset
  // (aligned with Browse) whether or not a scrollbar shows, and the
  // scrollbar — when it shows — sits flush at the border. Collapsed
  // restores `pe-2` for a symmetric, centered rail.
  return (
    <SidebarGroup className="flex min-h-0 flex-1 flex-col py-1 pe-0 group-data-[collapsible=icon]:pe-2">
      <SidebarGroupLabel>Playlists</SidebarGroupLabel>
      {/* The scroll lives here, not on SidebarContent, so the label above
          stays put and only the playlist rows move. `app-scroll` is the
          same thin scrollbar the main content and carousels use. */}
      {/* `sidebar-list-scroll` (see index.css) nudges the scrollbar
          toward the panel's right edge when expanded, and hides it while
          keeping the icons centered when the rail is collapsed. */}
      <SidebarGroupContent
        ref={scrollRef}
        className="sidebar-list-fade sidebar-list-scroll app-scroll min-h-0 flex-1 overflow-y-auto overflow-x-hidden"
      >
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              isActive={isPlaylistOn(LIKED_ID)}
              tooltip="Liked songs"
              className={MENU_BTN_CLS}
            >
              <Link to="/playlist/$id" params={{ id: LIKED_ID }}>
                <HeartIcon className="fill-rose-500 text-rose-500" />
                <span>Liked songs</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>

          {/* One keyed list, so a row moving between pinned, a folder and
              the rest keeps its element (and the menu's focus return). */}
          {[
            ...sections.pinned.map((p) => (
              <PlaylistRowItem key={p.id} row={p} {...rowProps} />
            )),
            ...sections.folders.flatMap(({ folder, rows }) => [
              <FolderItem
                key={folder.id}
                folder={folder}
                editing={editingFolder === folder.id}
                onRename={() => setEditingFolder(folder.id)}
                onNamed={(name) => {
                  renameFolder(folder.id, name);
                  setEditingFolder(null);
                }}
              />,
              ...(folder.collapsed
                ? []
                : rows.map((p) => (
                    <PlaylistRowItem
                      key={p.id}
                      row={p}
                      folderId={folder.id}
                      {...rowProps}
                    />
                  ))),
            ]),
            ...sections.rest.map((p) => (
              <PlaylistRowItem key={p.id} row={p} {...rowProps} />
            )),
          ]}

          {/* A failed browse used to be invisible: the rows above read
              `library.data ?? []`, so a launch before the network was up
              (Sep 10 2026) showed only Liked songs for eight hours and
              nothing re-asked. The window-focus refetch covers the usual
              way back; this row covers the rest and says what happened.
              Gated on a confirmed login because refetch() ignores
              `enabled`, and an anonymous library browse answers with the
              explore page, which would land in the library cache. With no
              data the retry puts the query back to pending, so the row
              goes away and comes back only if the retry fails too; with
              stale data retained the row stays, so it is disabled while
              a fetch is running rather than restarting it. */}
          {loggedIn.data === true && library.isError ? (
            <SidebarMenuItem>
              <SidebarMenuButton
                tooltip="Couldn't load playlists"
                className={MENU_BTN_CLS}
                disabled={library.isFetching}
                onClick={() => void library.refetch()}
              >
                <RefreshCwIcon />
                <span>Couldn't load playlists. Retry</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ) : null}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

/** One playlist row with its context menu. */
function PlaylistRowItem({
  row: p,
  folderId,
  folders,
  isPlaylistOn,
  pin,
  unpin,
  hide,
  onNewFolder,
}: {
  row: SidebarRow;
  /** Set when the row sits inside a folder. */
  folderId?: string;
  folders: PlaylistFolder[];
  isPlaylistOn: (id: string) => boolean;
  pin: (p: PinnedPlaylist) => void;
  unpin: (id: string) => void;
  hide: (id: string) => void;
  onNewFolder: (playlistId: string) => void;
}) {
  const moveToFolder = usePinnedPlaylistsStore((s) => s.moveToFolder);
  const removeFromFolder = usePinnedPlaylistsStore((s) => s.removeFromFolder);
  // New folder opens a name field; the closing menu must not pull focus
  // back to the row and so blur (and save) the field at once.
  const toField = useRef(false);
  return (
    <SidebarMenuItem className={folderId ? "ps-3 group-data-[collapsible=icon]:hidden" : undefined}>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <SidebarMenuButton
            asChild
            isActive={isPlaylistOn(p.id)}
            tooltip={p.title}
            className={MENU_BTN_CLS}
          >
            <Link to="/playlist/$id" params={{ id: p.id }}>
              {p.thumbnailUrl ? (
                <img
                  src={p.thumbnailUrl}
                  alt=""
                  className="size-4 shrink-0 rounded-sm object-cover"
                  loading="lazy"
                />
              ) : (
                <ListMusicIcon />
              )}
              <span className="min-w-0 flex-1 truncate">
                {p.title}
              </span>
              {/* Subtle marker so the pinned/unpinned boundary is
                  legible — pinning's only visible effect is the
                  reorder, this just explains it. */}
              {p.pinned ? (
                <PinIcon className="size-3! shrink-0 text-muted-foreground/70 group-data-[collapsible=icon]:hidden" />
              ) : null}
            </Link>
          </SidebarMenuButton>
        </ContextMenuTrigger>
        <ContextMenuContent
          onCloseAutoFocus={(e) => {
            if (toField.current) e.preventDefault();
            toField.current = false;
          }}
        >
          {p.pinned ? (
            <ContextMenuItem onSelect={() => unpin(p.id)}>
              <PinOffIcon />
              Unpin from sidebar
            </ContextMenuItem>
          ) : (
            <ContextMenuItem
              onSelect={() =>
                pin({
                  id: p.id,
                  title: p.title,
                  thumbnailUrl: p.thumbnailUrl,
                })
              }
            >
              <PinIcon />
              Pin to sidebar
            </ContextMenuItem>
          )}
          {/* Only library playlists can be filed: a folder's ids are
              pruned against the library fetch. */}
          {FOLDERS_SHIPPED && p.inLibrary ? (
            <ContextMenuSub>
              <ContextMenuSubTrigger>
                <FolderIcon />
                Move to folder
              </ContextMenuSubTrigger>
              <ContextMenuSubContent className="max-h-[min(24rem,var(--radix-context-menu-content-available-height))] overflow-auto">
                {folders
                  .filter((f) => f.id !== folderId)
                  .map((f) => (
                    <ContextMenuItem
                      key={f.id}
                      onSelect={() => moveToFolder(p.id, f.id)}
                    >
                      <FolderIcon />
                      <span className="max-w-48 truncate">{f.name}</span>
                    </ContextMenuItem>
                  ))}
                <ContextMenuItem
                  onSelect={() => {
                    toField.current = true;
                    onNewFolder(p.id);
                  }}
                >
                  <FolderPlusIcon />
                  New folder…
                </ContextMenuItem>
              </ContextMenuSubContent>
            </ContextMenuSub>
          ) : null}
          {folderId ? (
            <ContextMenuItem onSelect={() => removeFromFolder(p.id)}>
              <FolderMinusIcon />
              Remove from folder
            </ContextMenuItem>
          ) : null}
          <ContextMenuItem onSelect={() => hide(p.id)}>
            <EyeOffIcon />
            Hide from sidebar
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    </SidebarMenuItem>
  );
}

/** A folder row: click to open or close it, right-click to rename or
 *  delete. Its playlists (siblings after it) hide in the icon rail. */
function FolderItem({
  folder,
  editing,
  onRename,
  onNamed,
}: {
  folder: PlaylistFolder;
  editing: boolean;
  onRename: () => void;
  /** The typed name, already trimmed and defaulted. */
  onNamed: (name: string) => void;
}) {
  const toggle = usePinnedPlaylistsStore((s) => s.toggleFolder);
  const remove = usePinnedPlaylistsStore((s) => s.deleteFolder);
  const open = !folder.collapsed;
  // Once per edit: Escape, then the blur some engines fire as the field
  // unmounts, must not save what was typed.
  const settled = useRef(false);
  const toField = useRef(false);
  if (editing) {
    // Typed in place, like the rest of the sidebar.
    const done = (value: string) => {
      if (settled.current) return;
      settled.current = true;
      onNamed(value.trim() || NEW_FOLDER);
    };
    return (
      <SidebarMenuItem className="group-data-[collapsible=icon]:hidden">
        <Input
          autoFocus
          aria-label="Folder name"
          defaultValue={folder.name}
          maxLength={60}
          className="h-8 text-sm"
          onFocus={(e) => {
            settled.current = false;
            e.currentTarget.select();
          }}
          onBlur={(e) => done(e.currentTarget.value)}
          onKeyDown={(e) => {
            // Not while an input method is composing: Enter confirms that.
            // Older WebKit reports keyCode 229 instead of isComposing.
            const composing =
              e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229;
            if (e.key === "Enter" && !composing) e.currentTarget.blur();
            else if (e.key === "Escape") {
              // Handled here: unhandled, macOS takes Escape out of
              // fullscreen (QA r17 N1), and the fullscreen player's
              // window listener would close it.
              e.preventDefault();
              e.stopPropagation();
              done(folder.name);
            }
          }}
        />
      </SidebarMenuItem>
    );
  }
  return (
    <SidebarMenuItem>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <SidebarMenuButton
            tooltip={folder.name}
            className={MENU_BTN_CLS}
            aria-expanded={open}
            onClick={() => toggle(folder.id)}
          >
            {open ? <FolderOpenIcon /> : <FolderIcon />}
            <span className="min-w-0 flex-1 truncate">{folder.name}</span>
            <ChevronRightIcon
              className={`size-3! shrink-0 text-muted-foreground/70 transition-transform group-data-[collapsible=icon]:hidden ${open ? "rotate-90" : ""}`}
            />
          </SidebarMenuButton>
        </ContextMenuTrigger>
        <ContextMenuContent
          onCloseAutoFocus={(e) => {
            if (toField.current) e.preventDefault();
            toField.current = false;
          }}
        >
          <ContextMenuItem
            onSelect={() => {
              toField.current = true;
              onRename();
            }}
          >
            <PencilIcon />
            Rename folder
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => remove(folder.id)}>
            <Trash2Icon />
            Delete folder
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    </SidebarMenuItem>
  );
}

// Where the YT Music web client sends users to manage their Music
// Premium subscription. Kept here (not in a shared constants module)
// because it's the only place that links out to it.
const MANAGE_GOOGLE_URL = "https://myaccount.google.com/";
const MANAGE_SUBSCRIPTION_URL =
  "https://music.youtube.com/paid_memberships";

/**
 * The logged-out footer CTA: a full-width primary (brand red) button.
 * Collapses to a red icon button with a tooltip in icon mode. Runs the
 * same `start_login` flow as "Add another account".
 */
function SidebarSignInButton() {
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <Button
          title="Sign in"
          onClick={() => {
            invoke("start_login").catch((e) =>
              toast.error(`Sign-in failed: ${String(e)}`),
            );
          }}
          // `flex` (not the Button's inline-flex) in collapsed mode:
          // mx-auto only centers block-level boxes, so without it the
          // icon button hugs the rail's left edge.
          className="h-9 w-full gap-2 group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:p-0"
        >
          <LogInIcon />
          <span className="group-data-[collapsible=icon]:hidden">Sign in</span>
        </Button>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

function UserProfile() {
  // Sign out drops the session cookies and empties library state - it
  // fired straight off a menu row one slot below "Manage subscription",
  // so a slipped click logged the user out. Gate it behind a dialog.
  // MUST be declared before the early returns below: a hook after a
  // conditional return crashes the whole tree on the second render
  // ("rendered more hooks than during the previous render").
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const loggedIn = useQuery(authLoggedInQuery);
  const credentials = credentialState(loggedIn.data, loggedIn.isError);
  const activeId = useQuery(activeAccountIdQuery);
  const account = useQuery(
    accountInfoQuery(credentials === "authenticated", activeId.data),
  );
  const accounts = useAccounts();
  const premiumStatus = usePremiumStore((s) => s.status);

  const allAccounts = accounts.data ?? [];
  const activeAccount = allAccounts.find((a) => a.isActive) ?? allAccounts[0];

  // Which of the three footer states we're in, and why, lives in
  // auth-presence.ts. The rule that matters here: a Sign in button only
  // ever appears on an authoritative answer, so a keychain miss or a
  // dead NIC keeps the account row up instead of telling the user they
  // signed out.
  const slot = accountSlot({
    credentials,
    liveAccount: liveAccountState(account.data, account.isError),
    accountsPending: accounts.isPending,
    storedCount: allAccounts.length,
  });
  if (slot === "wait") return null;
  if (slot === "sign-in") return <SidebarSignInButton />;

  const live = account.data;
  const name =
    live?.name ||
    activeAccount?.channelName ||
    activeAccount?.name ||
    activeAccount?.email ||
    "Account";
  // `||`, not `??`: an authenticated menu whose labels we couldn't parse
  // now comes back with empty strings rather than as a null "signed
  // out", and an empty string must still fall through to the stored row.
  const email = live?.email || activeAccount?.email || "";
  const photoUrl =
    live?.photoUrl ??
    activeAccount?.channelPhotoUrl ??
    activeAccount?.photoUrl ??
    undefined;
  const initial = (name || email || "?").trim().charAt(0).toUpperCase();
  const isPremium = premiumStatus === "premium";
  const tierLabel = isPremium ? "Premium" : "Free";

  const signOut = async () => {
    if (!activeAccount) {
      // Defensive: should never happen because the trigger only
      // renders when loggedIn is true, but if accounts.data hasn't
      // landed yet we fall back to nuking all auth state.
      try {
        await invoke("clear_cookies");
        resetInnertube();
        toast.success("Signed out");
      } catch (e) {
        toast.error(`Sign out failed: ${String(e)}`);
      }
      return;
    }
    try {
      await removeAccount(activeAccount.id);
      // The Rust `remove_account` either promotes the next account to
      // active (multi-account case) or drops the user to signed-out
      // (last-account case). Either way `accounts-changed` fires and
      // the listener takes care of query invalidation + client reset.
      toast.success("Signed out");
    } catch (e) {
      toast.error(`Sign out failed: ${String(e)}`);
    }
  };

  // Opens an isolated Google sign-in window so the user can pick a
  // *different* identity — the new account is appended to the list
  // rather than replacing the current one. Rust's `start_login`
  // emits `accounts-changed` on success which invalidates the list
  // query for us.
  const addAccount = async () => {
    try {
      await invoke("start_login");
    } catch (e) {
      toast.error(`Sign-in failed: ${String(e)}`);
    }
  };

  const onSwitch = (target: AccountSummary) => async () => {
    if (target.isActive) return;
    try {
      await switchAccount(target.id);
      // `accounts-changed` listener handles all invalidation — no need
      // to do it manually here.
    } catch (e) {
      toast.error(`Switch failed: ${String(e)}`);
    }
  };

  const openExternal = (url: string) => () => {
    openUrl(url).catch((e) => toast.error(String(e)));
  };

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              tooltip={email ? `${name} (${email})` : name}
              className={MENU_BTN_CLS}
            >
              <Avatar className="size-4 shrink-0">
                {photoUrl ? <AvatarImage src={photoUrl} alt={name} /> : null}
                <AvatarFallback className="text-[9px] leading-none">
                  {initial}
                </AvatarFallback>
              </Avatar>
              <span className="truncate">{name}</span>
              {/* The tier badge is a claim about the live session; with
                  only stored meta (dead session fallback) it would say
                  "Free" about an account we can't actually see. */}
              {live ? (
                <Badge
                  variant="outline"
                  className={cn(
                    "ms-auto h-4 px-1.5 text-[10px] font-semibold uppercase tracking-wide",
                    "group-data-[collapsible=icon]:hidden",
                    isPremium
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                      : "text-muted-foreground",
                  )}
                >
                  {tierLabel}
                </Badge>
              ) : null}
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side="top"
            align="start"
            className="min-w-64"
          >
            {email ? (
              <>
                <DropdownMenuLabel className="truncate text-xs font-normal text-muted-foreground">
                  {email}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
              </>
            ) : null}
            {allAccounts.length ? (
              <>
                <DropdownMenuLabel className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Accounts
                </DropdownMenuLabel>
                {allAccounts.map((a) => (
                  <DropdownMenuItem
                    key={a.id}
                    onSelect={onSwitch(a)}
                    // Highlight the active row so the picker reads as
                    // "you are signed in as this one". `data-active`
                    // style mirrors what TanStack Router does on
                    // sidebar links — same visual language across the
                    // app. `focus:bg-accent` from the base item style
                    // still wins on hover, which is what we want.
                    data-active={a.isActive ? "true" : undefined}
                    className={cn(
                      "data-[active=true]:bg-accent/60 data-[active=true]:text-accent-foreground",
                    )}
                  >
                    <Avatar className="size-4 shrink-0">
                      {a.photoUrl ? (
                        <AvatarImage src={a.photoUrl} alt={a.name} />
                      ) : null}
                      <AvatarFallback className="text-[9px] leading-none">
                        {(a.name || a.email || "?")
                          .trim()
                          .charAt(0)
                          .toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex min-w-0 flex-col leading-tight">
                      <span className="truncate">
                        {a.name || a.email || "Unknown account"}
                      </span>
                      {a.email && a.name ? (
                        <span className="truncate text-[10px] text-muted-foreground">
                          {a.email}
                        </span>
                      ) : null}
                    </div>
                    {a.isActive ? (
                      <CheckIcon className="ms-auto text-emerald-500" />
                    ) : null}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
              </>
            ) : null}
            <DropdownMenuItem onSelect={() => openChannelPicker()}>
              <UsersRoundIcon />
              Switch channel
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={addAccount}>
              <UserPlusIcon />
              Add another account
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={openExternal(MANAGE_GOOGLE_URL)}>
              <UserCogIcon />
              Manage Google Account
              <ExternalLinkIcon className="ms-auto" />
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={openExternal(MANAGE_SUBSCRIPTION_URL)}
            >
              <CreditCardIcon />
              Manage subscription
              <ExternalLinkIcon className="ms-auto" />
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => setConfirmSignOut(true)}
            >
              <LogOutIcon />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Dialog open={confirmSignOut} onOpenChange={setConfirmSignOut}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Sign out?</DialogTitle>
              <DialogDescription>
                {email
                  ? `This signs ${email} out of Radif.`
                  : "This signs the current account out of Radif."}{" "}
                Your library and playlists stay on YouTube Music; signing
                back in restores them.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setConfirmSignOut(false)}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  setConfirmSignOut(false);
                  void signOut();
                }}
              >
                Sign out
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
