import type { ChainProvider } from "./types";

export const chipotle: ChainProvider = {
  id: "chipotle",
  name: "Chipotle",
  benchmarkItem: "Chicken Bowl",
  accentColor: "#A81612",
  fallbackPrice: 9.65,
  async findStores() {
    throw new Error("not implemented");
  },
  async getPrice() {
    throw new Error("not implemented");
  },
};
