import type { ChainProvider } from "./types";

export const wendys: ChainProvider = {
  id: "wendys",
  name: "Wendy's",
  benchmarkItem: "Dave's Single",
  accentColor: "#E2203B",
  fallbackPrice: 6.29,
  async findStores() {
    throw new Error("not implemented");
  },
  async getPrice() {
    throw new Error("not implemented");
  },
};
