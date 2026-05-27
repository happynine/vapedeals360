"use client";

import { useState, useEffect } from "react";

export default function WarningBar() {
  const [visible, setVisible] = useState(true);
  const [ageVerified, setAgeVerified] = useState(false);

  useEffect(() => {
    setAgeVerified(localStorage.getItem("age_verified") === "true");

    const handler = () => setAgeVerified(true);
    window.addEventListener("ageVerified", handler);
    return () => window.removeEventListener("ageVerified", handler);
  }, []);

  if (!ageVerified || !visible) return null;

  return (
    <div className="relative bg-yellow-600 text-center py-2 px-4">
      <p className="text-xs sm:text-sm font-semibold text-black tracking-wide">
        WARNING: This product contains nicotine. Nicotine is an addictive chemical.
      </p>
      <button
        onClick={() => setVisible(false)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-black/60 hover:text-black text-lg leading-none"
        aria-label="Close warning"
      >
        ×
      </button>
    </div>
  );
}
