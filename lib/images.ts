export const FOOD_IMAGES = {
  burrito:    "https://images.unsplash.com/photo-1626700051175-6818013e1d4f?w=400&q=80",
  bowl:       "https://images.unsplash.com/photo-1599974579688-8dbdd335c77f?w=400&q=80",
  tacos:      "https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=400&q=80",
  quesadilla: "https://images.unsplash.com/photo-1552332386-f8dd00dc2f85?w=400&q=80",
  restaurant: "https://images.unsplash.com/photo-1504544750208-dc0358e63f7f?w=400&q=80",
  default:    "https://images.unsplash.com/photo-1513456852971-30c0b8199d4d?w=400&q=80",
} as const;

export type FoodImageKey = keyof typeof FOOD_IMAGES;

const ROTATION_KEYS: FoodImageKey[] = [
  "burrito", "bowl", "tacos", "quesadilla", "restaurant", "default",
];

/** Deterministic — same storeId always maps to the same image */
export function getStoreImage(storeId: number): string {
  return FOOD_IMAGES[ROTATION_KEYS[storeId % ROTATION_KEYS.length]];
}
