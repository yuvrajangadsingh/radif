// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

const params = { id: "PLa" };

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (opts: object) => ({
    ...opts,
    useParams: () => params,
    useSearch: () => ({}),
  }),
  Link: ({ children }: { children?: React.ReactNode }) => children,
}));
vi.mock("@/lib/innertube/playlist", () => ({
  fetchPlaylistFirstPage: async (id: string) => ({
    id,
    title: id,
    thumbnails: [],
    tracks: [],
  }),
  fetchPlaylistContinuation: async () => ({ tracks: [] }),
  fetchPlaylistSuggestions: async () => undefined,
}));
vi.mock("@/components/shared/entity-header", () => ({ EntityHeader: () => null }));
vi.mock("@/components/shared/track-list", () => ({ TrackList: () => null }));
vi.mock("@/components/shared/jump-to-current-button", () => ({
  JumpToCurrentButton: () => null,
}));

const { Route } = await import("./playlist.$id");
const Page = (Route as unknown as { component: () => React.ReactElement })
  .component;

afterEach(cleanup);

describe("playlist page", () => {
  it("starts with an empty search box on the next playlist (#185)", async () => {
    const qc = new QueryClient();
    const view = () => (
      <QueryClientProvider client={qc}>
        <Page />
      </QueryClientProvider>
    );
    const { rerender } = render(view());
    const box = await screen.findByPlaceholderText("Search in playlist");
    fireEvent.change(box, { target: { value: "tony" } });
    expect(
      (screen.getByPlaceholderText("Search in playlist") as HTMLInputElement)
        .value,
    ).toBe("tony");

    params.id = "PLb";
    await act(async () => rerender(view()));
    const next = await screen.findByPlaceholderText("Search in playlist");
    expect((next as HTMLInputElement).value).toBe("");
  });
});
