class DiscoveryAggregator {

  constructor(adapterRegistry) {
    this.adapterRegistry = adapterRegistry;
  }

  async getItems(sources) {
    const enabledSources = Array.isArray(sources)
      ? sources.filter((source) => source?.enabled !== false)
      : [];
    const results = await Promise.allSettled(
      enabledSources.map(async (source) => {
        const adapter = this.adapterRegistry.get(source.type);

        if (!adapter) {
          throw new Error("Discovery source type is unavailable.");
        }

        return adapter.getItems(source);
      })
    );

    return deduplicateItems(
      results
        .filter((result) => result.status === "fulfilled")
        .flatMap((result) => result.value)
    );
  }
}

function deduplicateItems(items) {
  const seenItems = new Set();

  return items.filter((item) => {
    const key = [
      item.title?.trim().toLowerCase(),
      item.media?.url || ""
    ].join("|");

    if (!item.title || seenItems.has(key)) return false;

    seenItems.add(key);
    return true;
  });
}

module.exports = {
  DiscoveryAggregator,
  deduplicateItems
};
