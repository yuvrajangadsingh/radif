import { RouterProvider, createRouter } from "@tanstack/react-router";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { ThemeProvider } from "next-themes";
import {
  PERSIST_MAX_AGE,
  fitsInPersistBudget,
  persister,
  queryClient,
  shouldPersistQuery,
} from "@/lib/query-client";
import { routeTree } from "@/routeTree.gen";
import { isFloatingPlayerWindow } from "@/lib/floating-player";
import FloatingPlayerApp from "@/components/layout/floating-player-app";
import { wireQueryFocusToWindow } from "@/lib/query-focus";
import { blocksInAppPageLoad } from "@/lib/modified-link-click";

// Both windows run this bundle and each has its own query client, so
// each wires its own window. Module scope, not an effect: the manager
// keeps the listener across provider remounts.
wireQueryFocusToWindow();

const router = createRouter({
  routeTree,
  defaultPreload: "intent",
  defaultPreloadStaleTime: 0,
  context: { queryClient },
});

// Capture phase, so a handler that stops propagation can't hide the click.
// The router's <Link> skips modified clicks either way. auxclick is the
// middle button.
if (!isFloatingPlayerWindow()) {
  const block = (e: MouseEvent) => {
    const a = (e.target as Element | null)?.closest?.("a[href]");
    if (
      blocksInAppPageLoad(
        e,
        a instanceof HTMLAnchorElement
          ? { href: a.href, download: a.hasAttribute("download") }
          : null,
        window.location.href,
      )
    ) {
      e.preventDefault();
    }
  };
  document.addEventListener("click", block, true);
  document.addEventListener("auxclick", block, true);
}

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

export default function App() {
  // The same Vite bundle is loaded in both windows; the standalone
  // floating player skips routing/shell entirely.
  if (isFloatingPlayerWindow()) {
    return <FloatingPlayerApp />;
  }
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      storageKey="ytm-theme"
      disableTransitionOnChange
    >
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{
          persister,
          maxAge: PERSIST_MAX_AGE,
          dehydrateOptions: {
            shouldDehydrateQuery: (q) =>
              q.state.status === "success" &&
              shouldPersistQuery(q.queryKey) &&
              fitsInPersistBudget(q.state.data),
          },
        }}
      >
        <RouterProvider router={router} />
      </PersistQueryClientProvider>
    </ThemeProvider>
  );
}
