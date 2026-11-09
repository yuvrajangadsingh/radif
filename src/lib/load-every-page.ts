/** What a step of an infinite query reports, as far as this needs. */
type Step = { hasNextPage: boolean; isError?: boolean };

/**
 * Fetch the rest of an infinite query's pages, one at a time and `pauseMs`
 * apart (the sort drain's spacing, so a 10k-track playlist doesn't get
 * rate-limited). Throws if a page fails or the pages never run out, so the
 * caller can fall back instead of acting on part of the list.
 */
export async function loadEveryPage<R extends Step>(
  first: Step,
  next: () => Promise<R>,
  { pauseMs = 250, maxPages = 500 } = {},
): Promise<R | null> {
  let step: Step = first;
  let last: R | null = null;
  for (let n = 0; step.hasNextPage; n++) {
    if (n >= maxPages) throw new Error("too many pages");
    if (pauseMs > 0) await new Promise((r) => setTimeout(r, pauseMs));
    last = await next();
    if (last.isError) throw new Error("a page failed to load");
    step = last;
  }
  return last;
}
