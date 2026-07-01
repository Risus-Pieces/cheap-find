import type { ChainProvider } from "./types";

export const tacobell: ChainProvider = {
  id: "tacobell",
  name: "Taco Bell",
  benchmarkItem: "Crunchwrap Supreme",
  accentColor: "#702082",
  fallbackPrice: 6.49,
  async findStores() {
    throw new Error("not implemented");
  },
  async getPrice() {
    throw new Error("not implemented");
  },
};
