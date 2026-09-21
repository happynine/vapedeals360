'use client';

import Link from 'next/link';
import { useEffect } from 'react';

export default function SearchError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface the real stack in the console so it can be diagnosed.
    console.error('[search page error]', error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        <h2 className="text-2xl font-bold text-gray-900">
          Something went wrong
        </h2>
        <p className="mt-3 text-sm text-gray-500 break-words">
          {error?.message || 'Unexpected error while loading search results.'}
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            onClick={reset}
            className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-700 transition-colors"
          >
            Try again
          </button>
          <Link
            href="/"
            className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Back home
          </Link>
        </div>
      </div>
    </div>
  );
}
