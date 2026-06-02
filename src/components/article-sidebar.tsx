'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';

interface HeadingItem {
  id: string;
  text: string;
  level: number; // h1=1, h2=2, ...
}

interface ArticleSidebarProps {
  content: string; // raw HTML content from the article
}

export function ArticleSidebar({ content }: ArticleSidebarProps) {
  const [activeId, setActiveId] = useState<string>('');

  // Extract headings from HTML content
  const headings = useMemo<HeadingItem[]>(() => {
    if (!content) return [];
    const parser = new DOMParser();
    const doc = parser.parseFromString(content, 'text/html');
    const headingElements = doc.querySelectorAll('h1, h2, h3, h4, h5, h6');
    const items: HeadingItem[] = [];
    headingElements.forEach((el, index) => {
      const text = el.textContent?.trim() || '';
      if (!text) return;
      // Use existing id or generate one
      const id = el.id || `heading-${index}`;
      const level = parseInt(el.tagName[1], 10);
      items.push({ id, text, level });
    });
    return items;
  }, [content]);

  // Assign IDs to headings in the actual DOM after content renders
  useEffect(() => {
    if (!content) return;
    const container = document.querySelector('.rich-text-content');
    if (!container) return;
    const headingElements = container.querySelectorAll('h1, h2, h3, h4, h5, h6');
    headingElements.forEach((el, index) => {
      if (!el.id) {
        el.id = `heading-${index}`;
      }
    });
  }, [content]);

  // Intersection observer for scroll tracking
  useEffect(() => {
    if (headings.length === 0) return;

    const container = document.querySelector('.rich-text-content');
    if (!container) return;

    const headingElements = container.querySelectorAll('h1, h2, h3, h4, h5, h6');
    if (headingElements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        });
      },
      {
        rootMargin: '-80px 0px -70% 0px',
        threshold: 0,
      }
    );

    headingElements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [headings, content]);

  const scrollToHeading = useCallback((id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      // Offset for sticky header
      window.scrollBy(0, -80);
    }
  }, []);

  if (headings.length === 0) return null;

  // Find min heading level for relative indentation
  const minLevel = Math.min(...headings.map((h) => h.level));

  return (
    <aside className="w-full">
      <div className="sticky top-24">
        {/* Section title */}
        <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide mb-1 pb-3 border-b-2 border-purple-600">
          Table of Contents
        </h3>

        {/* Heading list */}
        <nav className="mt-3 max-h-[calc(100vh-160px)] overflow-y-auto">
          <ul className="space-y-0.5">
            {headings.map((heading) => {
              const indentLevel = heading.level - minLevel;
              const isActive = activeId === heading.id;
              const paddingLeft = 8 + indentLevel * 12; // 8px base + 12px per level
              return (
                <li key={heading.id}>
                  <button
                    onClick={() => scrollToHeading(heading.id)}
                    className={`
                      w-full text-left text-[13px] leading-relaxed py-1.5 rounded-md transition-all duration-150
                      truncate block
                      ${isActive
                        ? 'bg-purple-50 text-purple-700 font-semibold'
                        : 'text-gray-600 hover:text-purple-700 hover:bg-gray-50'
                      }
                    `}
                    style={{
                      paddingLeft: `${paddingLeft}px`,
                      borderLeft: isActive ? '2px solid #7c3aed' : '2px solid transparent',
                    }}
                    title={heading.text}
                  >
                    {heading.text}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </aside>
  );
}
