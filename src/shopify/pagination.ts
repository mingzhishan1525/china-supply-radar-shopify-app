export type PageInfo = { hasNextPage: boolean; endCursor: string | null };
export function nextCursor(page: PageInfo | undefined, seen: Set<string>): string | null {
  if (!page?.hasNextPage) return null;
  if (!page.endCursor || seen.has(page.endCursor)) throw new Error("Shopify returned an invalid pagination cursor. Please retry sync.");
  seen.add(page.endCursor);
  return page.endCursor;
}
