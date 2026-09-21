'use client';

import React from 'react';

interface State {
  hasError: boolean;
  message: string;
}

// Catches render errors inside the search dropdown so the panel never silently shows blank.
export class SearchErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error?.message || String(error) };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Keep a trace for debugging without crashing the whole header.
    console.error('[SearchErrorBoundary]', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="px-4 py-6 text-center text-sm text-gray-300">
          <div className="mb-1 font-medium text-white">Search render error</div>
          <div className="text-xs text-gray-500 break-words">{this.state.message}</div>
        </div>
      );
    }
    return this.props.children;
  }
}
