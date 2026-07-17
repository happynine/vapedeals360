"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, ImageOff } from "lucide-react";

interface Banner {
  id: number;
  image_url: string | null;
  mobile_image_url: string | null;
  translated_image_url?: string | null;
  translated_mobile_image_url?: string | null;
  link_url: string | null;
  title: string | null;
  subtitle: string | null;
}

export default function BannerCarousel({ banners, language }: { banners: Banner[]; language: string }) {
  const [current, setCurrent] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const hoverRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (banners.length <= 1) return;
    const timer = setInterval(() => {
      setCurrent((prev) => (prev + 1) % banners.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [banners.length]);

  // Reset image state when current banner changes
  useEffect(() => {
    setImageLoaded(false);
    setImageError(false);
  }, [current]);

  if (banners.length === 0) return null;

  const banner = banners[current];
  // 优先使用翻译后的图片，否则使用默认图片
  const imageUrl = banner.translated_image_url || banner.image_url;
  const mobileImgUrl = banner.translated_mobile_image_url || banner.mobile_image_url;

  // 类型安全检查
  const safeImageUrl = typeof imageUrl === 'string' ? imageUrl : null;
  const safeMobileImgUrl = typeof mobileImgUrl === 'string' ? mobileImgUrl : null;

  const content = (
    <div
      className="relative w-full overflow-hidden bg-gray-100 sm:aspect-[1200/343]"
      onMouseEnter={() => {
        if (hoverRef.current) clearTimeout(hoverRef.current);
        setHovered(true);
      }}
      onMouseLeave={() => {
        hoverRef.current = setTimeout(() => setHovered(false), 200);
      }}
    >
      {/* Loading skeleton */}
      {!imageLoaded && !imageError && (
        <div className="absolute inset-0 bg-gradient-to-r from-gray-100 via-gray-50 to-gray-100 animate-pulse flex items-center justify-center">
          <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center">
            <ImageOff className="w-6 h-6 text-gray-400" />
          </div>
        </div>
      )}

      {/* Error state */}
      {imageError && (
        <div className="absolute inset-0 bg-gradient-to-br from-purple-50 to-cyan-50 flex flex-col items-center justify-center gap-3">
          <div className="w-16 h-16 rounded-full bg-white/80 flex items-center justify-center shadow-sm">
            <ImageOff className="w-8 h-8 text-gray-400" />
          </div>
          <p className="text-sm text-gray-500">Image failed to load</p>
        </div>
      )}

      {safeImageUrl && !imageError ? (
        <div className="relative w-full sm:absolute sm:inset-0 sm:w-full sm:h-full">
          {safeMobileImgUrl && (
            <Image
              src={safeMobileImgUrl.startsWith("http") || safeMobileImgUrl.startsWith("/") ? safeMobileImgUrl : `/api/image?key=${encodeURIComponent(safeMobileImgUrl)}`}
              alt={banner.title || "Banner"}
              fill
              sizes="100vw"
              className="block sm:hidden object-contain"
              priority={current === 0}
              onLoad={() => setImageLoaded(true)}
              onError={() => setImageError(true)}
            />
          )}
          <Image
            src={safeImageUrl.startsWith("http") || safeImageUrl.startsWith("/") ? safeImageUrl : `/api/image?key=${encodeURIComponent(safeImageUrl)}`}
            alt={banner.title || "Banner"}
            fill
            sizes="100vw"
            className={`block sm:absolute sm:inset-0 sm:object-fill ${safeMobileImgUrl ? "hidden sm:block" : ""} ${imageLoaded ? 'opacity-100' : 'opacity-0'} transition-opacity duration-300`}
            priority={current === 0}
            onLoad={() => setImageLoaded(true)}
            onError={() => setImageError(true)}
          />
        </div>
      ) : null}
      {(banner.title || banner.subtitle) && (
        <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-black/20 to-transparent" />
      )}
      {(banner.title || banner.subtitle) && (
        <div className="absolute inset-0 flex flex-col justify-center px-6 sm:px-10 lg:px-16">
          {banner.title && (
            <h2 className="text-lg sm:text-2xl lg:text-3xl font-bold text-white drop-shadow-lg max-w-lg">
              {banner.title}
            </h2>
          )}
          {banner.subtitle && (
            <p className="mt-1 sm:mt-2 text-xs sm:text-sm lg:text-base text-white/80 drop-shadow max-w-md">
              {banner.subtitle}
            </p>
          )}
        </div>
      )}
      {banners.length > 1 && hovered && (
        <>
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setCurrent((prev) => (prev - 1 + banners.length) % banners.length);
            }}
            className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center text-white transition-all"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setCurrent((prev) => (prev + 1) % banners.length);
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center text-white transition-all"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </>
      )}
      {banners.length > 1 && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
          {banners.map((_, idx) => (
            <button
              key={idx}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setCurrent(idx);
              }}
              className={`h-1.5 rounded-full transition-all ${idx === current ? "w-6 bg-white" : "w-1.5 bg-white/50"}`}
            />
          ))}
        </div>
      )}
    </div>
  );

  if (banner.link_url) {
    return (
      <a
        href={banner.link_url}
        target="_blank"
        rel="noopener noreferrer"
        className="block"
        onClick={() => {
          const sid = sessionStorage.getItem("vp_session_id") || "";
          fetch("/api/track", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type: "banner_click", session_id: sid, banner_id: banner.id }),
          }).catch(() => {});
        }}
      >
        {content}
      </a>
    );
  }

  return content;
}