// Serializes session replacement and uninstall cleanup in this single-instance
// SQLite service. The database remains the source of truth after restarts.
const pending = new WeakMap<object, Map<string, Promise<unknown>>>();
export async function withShopLifecycle<T>(store: object, shop: string, work: () => Promise<T>): Promise<T> {
  let shops = pending.get(store);
  if (!shops) { shops = new Map(); pending.set(store, shops); }
  const before = shops.get(shop) || Promise.resolve();
  const task = before.catch(() => undefined).then(work);
  shops.set(shop, task);
  try { return await task; }
  finally { if (shops.get(shop) === task) shops.delete(shop); }
}
