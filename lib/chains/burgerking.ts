import type { ChainProvider } from "./types";

export const burgerking: ChainProvider = {
  id: "burgerking",
  name: "Burger King",
  benchmarkItem: "Whopper",
  accentColor: "#B8531B",
  fallbackPrice: 7.19,
  async findStores() {
    throw new Error("not implemented");
  },
  async getPrice() {
    throw new Error("not implemented");
  },
};
