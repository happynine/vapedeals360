import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SiteHeader } from '@/components/site-header';
import { StateProductIndex } from '@/components/state-product-index';
import {
  ALL_STATES,
  getStateBySlug,
  getStateContent,
  COMPLIANCE_DISCLAIMER,
  type StateLawContent,
} from '@/lib/states';

export const revalidate = 3600;

const SITE_URL = 'https://www.vapedeals360.com';

type Params = { params: Promise<{ state: string }> };

export function generateStaticParams() {
  // Pre-render all 51 state routes so Hub grid links never 404.
  return ALL_STATES.map((s) => ({ state: s.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { state: slug } = await params;
  const state = getStateBySlug(slug);
  if (!state) return {};
  const content = getStateContent(state);
  const url = `${SITE_URL}/vape-laws/${state.slug}`;

  if (!state.launched || !content) {
    return {
      title: `${state.name} Vape Laws — Guide Coming Soon`,
      description: `${state.name} vaping rules guide is coming soon. See current federal rules and check back for state-specific flavor, shipping and age guidance.`,
      alternates: { canonical: `/vape-laws/${state.slug}` },
      robots: { index: false, follow: true },
      openGraph: { url },
    };
  }

  return {
    title: `${state.name} Vape Laws 2026 — Flavors, Disposables & Shipping Rules`,
    description: content.headline,
    alternates: { canonical: `/vape-laws/${state.slug}` },
    openGraph: {
      url,
      title: `${state.name} Vape Laws 2026`,
      description: content.headline,
      type: 'article',
    },
    twitter: { card: 'summary_large_image', title: `${state.name} Vape Laws`, description: content.headline },
  };
}

function RuleRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-gray-100 py-3 last:border-0">
      <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</dt>
      <dd className="mt-1 text-sm text-gray-700">{value}</dd>
    </div>
  );
}

function LaunchedStatePage({ content: c }: { content: StateLawContent }) {
  const articleJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: `${c.name} Vape Laws 2026`,
    description: c.headline,
    dateModified: c.lastReviewedAt,
    author: { '@type': 'Organization', name: 'VapeDeals360' },
    publisher: { '@type': 'Organization', name: 'VapeDeals360' },
    mainEntityOfPage: `${SITE_URL}/vape-laws/${c.slug}`,
  };
  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: 'Shop by State', item: `${SITE_URL}/vape-laws` },
      { '@type': 'ListItem', position: 3, name: 'Vape Laws', item: `${SITE_URL}/vape-laws/laws` },
      { '@type': 'ListItem', position: 3, name: c.name, item: `${SITE_URL}/vape-laws/${c.slug}` },
    ],
  };

  return (
    <div className="min-h-screen bg-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <SiteHeader activeTab="shop-by-state" />

      <div className="border-b border-gray-100 bg-gradient-to-b from-purple-50 to-white">
        <div className="mx-auto max-w-5xl px-4 py-10">
          <nav aria-label="Breadcrumb" className="mb-3 text-xs text-gray-400">
            <Link href="/" className="hover:text-purple-600">Home</Link>
            <span className="mx-1">/</span>
            <Link href="/vape-laws" className="hover:text-purple-600">Shop by State</Link>
            <span className="mx-1">/</span>
            <Link href="/vape-laws/laws" className="hover:text-purple-600">Vape Laws</Link>
            <span className="mx-1">/</span>
            <span>{c.name}</span>
          </nav>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">
              {c.name} Vape Laws
            </h1>
            <span className="rounded-md bg-purple-100 px-2 py-1 text-sm font-bold text-purple-700">
              {c.code}
            </span>
          </div>
          <p className="mt-3 max-w-3xl text-base text-gray-700">{c.headline}</p>
          <p className="mt-2 text-xs text-gray-400">
            Last reviewed {c.lastReviewedAt} · Next review by {c.nextReviewAt}
          </p>
        </div>
      </div>

      <main className="mx-auto max-w-5xl px-4 py-10">
        <div className="grid gap-8 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <h2 className="text-xl font-bold text-gray-900">The rules in plain English</h2>
            <p className="mt-3 text-sm leading-7 text-gray-700">{c.summary}</p>

            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-green-200 bg-green-50 p-5">
                <h3 className="text-sm font-semibold text-green-800">You can generally buy</h3>
                <ul className="mt-2 space-y-1.5">
                  {c.canBuy.map((x) => (
                    <li key={x} className="flex gap-2 text-sm text-green-900">
                      <span aria-hidden>✓</span>
                      <span>{x}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-2xl border border-red-200 bg-red-50 p-5">
                <h3 className="text-sm font-semibold text-red-800">Restricted / not allowed</h3>
                <ul className="mt-2 space-y-1.5">
                  {c.cannotBuy.map((x) => (
                    <li key={x} className="flex gap-2 text-sm text-red-900">
                      <span aria-hidden>✕</span>
                      <span>{x}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <h2 className="mt-10 text-xl font-bold text-gray-900">Official sources</h2>
            <ul className="mt-3 space-y-2">
              {c.sources.map((src) => (
                <li key={src.url}>
                  <a
                    href={src.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-purple-700 underline hover:text-purple-800"
                  >
                    {src.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <aside className="lg:col-span-1">
            <div className="rounded-2xl border border-gray-200 bg-white p-5">
              <h2 className="text-sm font-bold text-gray-900">{c.name} at a glance</h2>
              <dl className="mt-2">
                <RuleRow label="Minimum age" value={`${c.minAge}+`} />
                <RuleRow label="Flavors" value={c.flavor} />
                <RuleRow label="Disposables" value={c.disposable} />
                <RuleRow label="Online shipping" value={c.shipping} />
                <RuleRow label="Coupons" value={c.coupon} />
                <RuleRow label="Directory state" value={c.directory} />
              </dl>
              <Link
                href="/"
                className="mt-4 block rounded-xl bg-purple-600 px-4 py-2.5 text-center text-sm font-semibold text-white transition hover:bg-purple-700"
              >
                Browse deals
              </Link>
            </div>
          </aside>
        </div>

        <StateProductIndex
          title={`Popular vapes for ${c.name} shoppers`}
          subtitle="National deal snapshot — confirm each product is legal for delivery to your state at checkout."
        />

        <p className="mt-10 rounded-xl bg-amber-50 px-4 py-3 text-xs text-amber-800">
          {COMPLIANCE_DISCLAIMER}
        </p>
      </main>
    </div>
  );
}

function GenericStatePage({ name, code }: { name: string; code: string }) {
  return (
    <div className="min-h-screen bg-white">
      <SiteHeader activeTab="shop-by-state" />
      <div className="border-b border-gray-100 bg-gradient-to-b from-purple-50 to-white">
        <div className="mx-auto max-w-5xl px-4 py-10">
          <nav aria-label="Breadcrumb" className="mb-3 text-xs text-gray-400">
            <Link href="/" className="hover:text-purple-600">Home</Link>
            <span className="mx-1">/</span>
            <Link href="/vape-laws" className="hover:text-purple-600">Shop by State</Link>
            <span className="mx-1">/</span>
            <Link href="/vape-laws/laws" className="hover:text-purple-600">Vape Laws</Link>
            <span className="mx-1">/</span>
            <span>{name}</span>
          </nav>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">{name} Vape Laws</h1>
            <span className="rounded-md bg-gray-100 px-2 py-1 text-sm font-bold text-gray-600">
              {code}
            </span>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-3xl px-4 py-10">
        <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-6 text-center">
          <h2 className="text-lg font-semibold text-gray-900">
            {name} guide is being prepared
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-gray-600">
            Our editors are verifying {name}’s current flavor, disposable, shipping and
            directory rules with official sources. In the meantime, the federal baseline applies:
            21+ minimum age, online age verification and PACT-Act shipping compliance.
          </p>
          <p className="mt-4 text-xs text-gray-400">
            Data cut-off 2026-09 · noindex pending legal review
          </p>
        </div>

        {/* Keep the page non-empty with real, nationally available content. */}
        <StateProductIndex
          title="Popular vapes & deals right now"
          subtitle="National snapshot — confirm eligibility and shipping to your state at checkout."
        />

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/vape-laws/laws"
            className="rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:border-purple-300 hover:text-purple-700"
          >
            ← Back to all states
          </Link>
          <Link
            href="/"
            className="rounded-xl bg-purple-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-purple-700"
          >
            Browse all deals
          </Link>
        </div>
      </main>
    </div>
  );
}

export default async function StatePage({ params }: Params) {
  const { state: slug } = await params;
  const state = getStateBySlug(slug);
  if (!state) notFound();

  const content = getStateContent(state);
  if (!state.launched || !content) {
    return <GenericStatePage name={state.name} code={state.code} />;
  }
  return <LaunchedStatePage content={content} />;
}
