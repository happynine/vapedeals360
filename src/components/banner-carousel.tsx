"use client";

import { useState, useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface Banner {
  id: number;
  image_url: string | null;
  mobile_image_url: string | null;
  link_url: string | null;
  title: string | null;
  subtitle: string | null;
}

export default function BannerCarousel({ banners, language }: { banners: Banner[]; language: string }) {
  const [current, setCurrent] = useState(0);
  const [hovered, setHovered] = useState(false);
  const hoverRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (banners.length <= 1) return;
    const timer = setInterval(() => {
      setCurrent((prev) => (prev + 1) % banners.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [banners.length]);

  if (banners.length === 0) return null;

  const banner = banners[current];
  const mobileImgUrl = banner.mobile_image_url;

  const content = (
    <div
      className="relative w-full overflow-hidden bg-gradient-to-r from-purple-900 via-purple-800 to-cyan-900 sm:aspect-[1200/343]"
      onMouseEnter={() => {
        if (hoverRef.current) clearTimeout(hoverRef.current);
        setHovered(true);
      }}
      onMouseLeave={() => {
        hoverRef.current = setTimeout(() => setHovered(false), 200);
      }}
    >
      {banner.image_url ? (
        <div className="relative w-full sm:absolute sm:inset-0 sm:w-full sm:h-full">
          {mobileImgUrl && (
            <img
              src={mobileImgUrl.startsWith("http") || mobileImgUrl.startsWith("/") ? mobileImgUrl : `/api/image?key=${encodeURIComponent(mobileImgUrl)}`}
              alt={banner.title || "Banner"}
              className="w-full h-auto block sm:hidden"
              loading={current === 0 ? "eager" : "lazy"}
            />
          )}
          <img
            src={banner.image_url.startsWith("http") || banner.image_url.startsWith("/") ? banner.image_url : `/api/image?key=${encodeURIComponent(banner.image_url)}`}
            alt={banner.title || "Banner"}
            className={`w-full h-auto block sm:absolute sm:inset-0 sm:w-full sm:h-full sm:object-fill ${mobileImgUrl ? "hidden sm:block sm:absolute" : ""}`}
            loading={current === 0 ? "eager" : "lazy"}
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