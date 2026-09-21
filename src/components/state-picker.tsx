'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ALL_STATES } from '@/lib/states';

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

/**
 * V2.1 "Choose your state" picker for /vape-laws.
 * - 51-state searchable select (PRD AC: every state selectable)
 * - remember last choice in localStorage
 * - fire GA state_confirm event, then navigate to the state page
 */
export function StatePicker({ className = '' }: { className?: string }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [savedCode, setSavedCode] = useState<string>('');
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Read the remembered state only after mount to avoid SSR/hydration mismatch.
  useEffect(() => {
    try {
      const last = window.localStorage.getItem('last_vape_state');
      if (last) setSavedCode(last);
    } catch {
      /* storage unavailable */
    }
  }, []);

  const savedState = ALL_STATES.find((s) => s.code === savedCode);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ALL_STATES;
    return ALL_STATES.filter(
      (s) => s.name.toLowerCase().includes(q) || s.code.toLowerCase() === q,
    );
  }, [query]);

  const go = (code: string, slug: string) => {
    try {
      window.localStorage.setItem('last_vape_state', code);
    } catch {
      /* storage may be unavailable */
    }
    window.gtag?.('event', 'state_confirm', { state_code: code });
    router.push(`/vape-laws/${slug}`);
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const target = filtered[highlight] || filtered[0];
    if (target) go(target.code, target.slug);
  };

  const label = selected
    ? ALL_STATES.find((s) => s.code === selected)?.name
    : savedState?.name;

  return (
    <form onSubmit={onSubmit} className={`relative w-full ${className}`}>
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <input
            type="text"
            role="combobox"
            aria-expanded={open}
            aria-controls="state-listbox"
            aria-autocomplete="list"
            autoComplete="off"
            placeholder={label ? `${label} (saved)` : 'Choose your state — e.g. Texas'}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setHighlight(0);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => {
              blurTimer.current = setTimeout(() => setOpen(false), 120);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setHighlight((h) => Math.min(h + 1, filtered.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setHighlight((h) => Math.max(h - 1, 0));
              } else if (e.key === 'Escape') {
                setOpen(false);
              }
            }}
            className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-base text-gray-900 shadow-sm outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-200"
          />
          {open && filtered.length > 0 && (
            <ul
              id="state-listbox"
              role="listbox"
              className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-gray-200 bg-white py-1 shadow-lg"
            >
              {filtered.map((s, i) => (
                <li
                  key={s.code}
                  role="option"
                  aria-selected={i === highlight}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setSelected(s.code);
                    go(s.code, s.slug);
                  }}
                  onMouseEnter={() => setHighlight(i)}
                  className={`flex cursor-pointer items-center justify-between px-4 py-2 text-sm ${
                    i === highlight ? 'bg-purple-50 text-purple-700' : 'text-gray-700'
                  }`}
                >
                  <span>{s.name}</span>
                  <span className="text-xs font-semibold text-gray-400">{s.code}</span>
                </li>
              ))}
            </ul>
          )}
          {open && filtered.length === 0 && (
            <div className="absolute z-30 mt-1 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-500 shadow-lg">
              No state matched “{query}”.
            </div>
          )}
        </div>
        <button
          type="submit"
          className="rounded-xl bg-purple-600 px-6 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-purple-700"
        >
          Confirm state
        </button>
      </div>
    </form>
  );
}
