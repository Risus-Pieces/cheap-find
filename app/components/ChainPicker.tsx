"use client";

import type { ChainMeta } from "@/lib/chains/types";

export function ChainPicker({
  chains,
  selected,
  onSelect,
}: {
  chains: ChainMeta[];
  selected: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex gap-2 overflow-x-auto py-2">
      {chains.map((c) => (
        <button
          key={c.id}
          onClick={() => onSelect(c.id)}
          className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition-all focus:outline-none ${
            selected === c.id
              ? "text-white shadow-sm"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
          }`}
          style={selected === c.id ? { backgroundColor: c.accentColor } : undefined}
        >
          {c.name}
        </button>
      ))}
    </div>
  );
}
