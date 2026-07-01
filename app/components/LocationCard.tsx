"use client";

import Image from "next/image";
import { useState } from "react";
import { StoreLocation } from "@/app/api/stores/route";
import { PriceData } from "@/app/api/price/[storeId]/route";
import { FOOD_IMAGES } from "@/lib/images";

interface LocationCardProps {
  store: StoreLocation;
  price: PriceData | undefined;
  priceLoading: boolean;
  distance: number;
  rank: number;
  isCheapest: boolean;
  isSelected: boolean;
  isHovered: boolean;
  onClick: () => void;
  onHover: () => void;
  onHoverEnd: () => void;
}

export default function LocationCard({
  store,
  price,
  priceLoading,
  distance,
  rank,
  isCheapest,
  isSelected,
  isHovered,
  onClick,
  onHover,
  onHoverEnd,
}: LocationCardProps) {
  const [imgSrc, setImgSrc] = useState(store.image);

  return (
    <button
      onClick={onClick}
      onMouseEnter={onHover}
      onMouseLeave={onHoverEnd}
      className={`w-full text-left flex gap-0 rounded-2xl overflow-hidden shadow-sm transition-all duration-200 border-2 focus:outline-none ${
        isSelected
          ? "border-[#2563eb] shadow-lg scale-[1.01]"
          : isHovered
          ? "border-[#2563eb]/30 shadow-md scale-[1.005]"
          : isCheapest
          ? "border-green-400 shadow-green-100"
          : "border-transparent hover:border-gray-200 hover:shadow-md"
      } bg-white`}
    >
      {/* Image */}
      <div className="relative w-28 shrink-0 self-stretch bg-gray-100">
        <Image
          src={imgSrc}
          alt={store.name}
          fill
          className="object-cover"
          sizes="112px"
          onError={() => setImgSrc(FOOD_IMAGES.default)}
        />
        {/* Rank badge */}
        <div
          className={`absolute top-2 left-2 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shadow ${
            isCheapest ? "bg-green-500 text-white" : "bg-white/90 text-gray-600"
          }`}
        >
          {rank}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 px-4 py-3 flex flex-col justify-between min-w-0">
        <div>
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-bold text-gray-900 text-sm leading-snug truncate tracking-tight">
              {store.name}
            </h3>
            {isCheapest && price && (
              <span className="shrink-0 text-xs font-bold text-amber-700 bg-amber-100 rounded-full px-2 py-0.5">
                ⭐ Cheapest
              </span>
            )}
          </div>
          <a
            href={`https://maps.google.com/?q=${encodeURIComponent(store.address)}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-[#2563eb] font-medium mt-0.5 truncate transition-colors group"
          >
            <svg className="w-3 h-3 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a2 2 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span className="truncate">{store.address}</span>
          </a>
        </div>

        <div className="flex items-end justify-between mt-2">
          {/* Price */}
          <div>
            {priceLoading || !price ? (
              <div className="flex items-center gap-2">
                <div className="h-7 w-16 bg-gray-100 rounded animate-pulse" />
                <span className="text-xs text-gray-400 font-medium">Loading…</span>
              </div>
            ) : (
              <>
                <div className="flex items-baseline gap-1.5 flex-wrap">
                  <span
                    className={`text-2xl font-black tracking-tight ${
                      isCheapest ? "text-green-600" : "text-gray-900"
                    }`}
                  >
                    ${price.price.toFixed(2)}
                  </span>
                  {price.isLive && (
                    <span className="text-xs font-bold text-green-600 bg-green-50 border border-green-200 rounded-full px-1.5 py-0.5 uppercase tracking-wide">
                      live
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1 mt-0.5">
                  <span className="text-xs text-gray-400 font-medium">pickup</span>
                  {price.deliveryPrice > 0 && (
                    <>
                      <span className="text-xs text-gray-300">·</span>
                      <span className="text-xs text-gray-400 font-medium">
                        ${price.deliveryPrice.toFixed(2)} delivery
                      </span>
                    </>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Distance */}
          <div className="text-right shrink-0">
            <span className="text-sm font-bold text-gray-700">{distance.toFixed(1)}</span>
            <span className="text-xs text-gray-400 font-medium ml-0.5">mi</span>
          </div>
        </div>
      </div>
    </button>
  );
}
