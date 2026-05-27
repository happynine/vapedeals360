"use client";

import { useState } from "react";

export default function AgeVerification() {
  const [month, setMonth] = useState("");
  const [day, setDay] = useState("");
  const [year, setYear] = useState("");
  const [error, setError] = useState("");

  if (typeof window !== "undefined" && localStorage.getItem("age_verified") === "true") {
    return null;
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const m = parseInt(month);
    const d = parseInt(day);
    const y = parseInt(year);

    if (!m || !d || !y || m < 1 || m > 12 || d < 1 || d > 31 || y < 1900 || y > new Date().getFullYear()) {
      setError("Please enter a valid date of birth.");
      return;
    }

    const birthDate = new Date(y, m - 1, d);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }

    if (age < 21) {
      setError("You must be 21 or older to enter this site.");
      return;
    }

    localStorage.setItem("age_verified", "true");
    window.dispatchEvent(new Event("ageVerified"));
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-md rounded-2xl border border-purple-500/30 bg-[#1a1a24] p-8 text-center shadow-2xl shadow-purple-500/10">
        {/* Logo / Title */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-white">
            <span className="text-purple-500">Vape</span>Deal
          </h1>
          <p className="mt-2 text-sm text-gray-400">Age Verification Required</p>
        </div>

        {/* Warning */}
        <div className="mb-6 rounded-lg bg-yellow-500/10 border border-yellow-500/30 px-4 py-3">
          <p className="text-sm text-yellow-400 font-medium">
            WARNING: This product contains nicotine. Nicotine is an addictive chemical.
          </p>
        </div>

        <p className="mb-6 text-gray-300 text-sm">
          You must be 21 years or older to enter this website. Please enter your date of birth.
        </p>

        {/* DOB Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs text-gray-400 mb-1 text-left">Month</label>
              <input
                type="number"
                placeholder="MM"
                min={1}
                max={12}
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="w-full rounded-lg border border-gray-600 bg-[#0f0f13] px-3 py-2.5 text-center text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs text-gray-400 mb-1 text-left">Day</label>
              <input
                type="number"
                placeholder="DD"
                min={1}
                max={31}
                value={day}
                onChange={(e) => setDay(e.target.value)}
                className="w-full rounded-lg border border-gray-600 bg-[#0f0f13] px-3 py-2.5 text-center text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs text-gray-400 mb-1 text-left">Year</label>
              <input
                type="number"
                placeholder="YYYY"
                min={1900}
                max={new Date().getFullYear()}
                value={year}
                onChange={(e) => setYear(e.target.value)}
                className="w-full rounded-lg border border-gray-600 bg-[#0f0f13] px-3 py-2.5 text-center text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
              />
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-400 font-medium">{error}</p>
          )}

          <button
            type="submit"
            className="w-full rounded-lg bg-purple-600 px-4 py-3 text-white font-semibold hover:bg-purple-700 transition-colors"
          >
            Enter Site
          </button>
        </form>

        <p className="mt-4 text-xs text-gray-500">
          By entering this site, you confirm that you are of legal smoking age in your jurisdiction.
        </p>
      </div>
    </div>
  );
}
