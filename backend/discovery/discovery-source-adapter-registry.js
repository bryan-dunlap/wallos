class DiscoverySourceAdapterRegistry {

  constructor() {
    this.adapters = new Map();
  }

  register(adapter) {
    if (
      !adapter ||
      typeof adapter.type !== "string" ||
      !adapter.type.trim() ||
      typeof adapter.name !== "string" ||
      !adapter.name.trim() ||
      typeof adapter.getItems !== "function"
    ) {
      throw new TypeError("Discovery source adapter is invalid.");
    }

    this.adapters.set(adapter.type, adapter);
  }

  get(type) {
    return this.adapters.get(type) || null;
  }

  getMetadata() {
    return [...this.adapters.values()].map((adapter) => ({
      type: adapter.type,
      name: adapter.name,
      userAddable: adapter.userAddable === true
    }));
  }
}

module.exports = { DiscoverySourceAdapterRegistry };
