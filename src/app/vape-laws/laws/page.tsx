import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteHeader } from '@/components/site-header';
import { StatePicker } from '@/components/state-picker';
import { StateProductIndex } from '@/components/state-product-index';
import {
  ALL_STATES,
  LAUNCH_STATES,
  getStateContent,
  COMPLIANCE_DISCLAIMER,
} from '@/lib/states';

export const revalidate = 3600;

const SITE_URL = 'https://www.vapedeals360.com';
const HUB_PATH = '/vape-laws/laws';
const HUB_URL = `${SITE_URL}${HUB_PATH}`;

export const metadata: Metadata = {
  title: 'Vape Laws by State 2026 — Flavor Bans, Shipping & Age Rules',
  description:
    'Check your state’s vape rules: minimum age, flavor and disposable bans, online shipping restrictions, PMTA directories and coupons. Choose your state to shop compliant vapes.',
  alternates: { canonical: HUB_PATH },
  openGraph: {
    url: HUB_URL,
    title: 'Vape Laws by State 2026 — Shop Compliant Vapes',
    description:
      'Compare state vaping rules and find vapes you can legally order. Flavor bans, shipping restrictions, directories and age limits by state.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Vape Laws by State 2026',
    description: 'Your state’s vape rules and compliant deals in one place.',
  },
};

const FAQS = [
  {
    q: 'Is vaping legal in all US states?',
    a: 'Vaping is legal for adults 21+ nationwide under federal law, but states impose different rules on flavors, disposables, online shipping, coupons and product authorization (PMTA). Rules change often — check your state page and rely on retailer checkout checks.',
  },
  {
    q: 'Can I order vapes online and have them shipped to my state?',
    a: 'It depends on the state. Federal PACT Act rules require age verification and seller registration, and some states (such as New York) heavily restrict direct interstate shipment while directory states (such as Florida and Pennsylvania) only allow listed products. Pick your state for specifics.',
  },
  {
    q: 'Which states ban flavored vapes?',
    a: 'Some states restrict flavors directly (for example New York bans non-tobacco flavors), while directory states like Florida and Pennsylvania only allow authorized products. Texas took a different approach and bans certain imported disposables without a statewide flavor ban.',
  },
  {
    q: 'Are disposable vapes banned?',
    a: 'Rules vary. Texas prohibits many Chinese-made disposables, and California AB 762 phases disposable nicotine devices out between 2027 and 2028. Directory states only permit listed disposables. Always verify current rules before ordering.',
  },
  {
    q: 'What is the legal vaping age?',
    a: '21 across the United States under federal law; every state page on VapeDeals360 reflects a 21+ minimum.',
  },
];

export default function VapeLawsHubPage() {
  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQS.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: 'Shop by State', item: HUB_URL },
    ],
  };

  return (
    <div className="min-h-screen bg-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />

      <SiteHeader activeTab="shop-by-state" />

      {/* Hero + state picker */}
      <section className="border-b border-gray-100 bg-gradient-to-b from-purple-50 to-white">
        <div className="mx-auto max-w-5xl px-4 py-12 sm:py-16 text-center">
          <nav aria-label="Breadcrumb" className="mb-4 text-xs text-gray-400">
            <Link href="/" className="hover:text-purple-600">Home</Link>
            <span className="mx-1">/</span>
            <Link href="/vape-laws" className="hover:text-purple-600">Shop by State</Link>
            <span className="mx-1">/</span>
            <span>Vape Laws</span>
          </nav>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-gray-900">
            Vaping Laws by State
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-base text-gray-600">
            Choose your state to see age limits, flavor and disposable rules, online-shipping
            restrictions and PMTA directory status before you order.
          </p>
          <div className="mx-auto mt-7 max-w-xl text-left">
            <StatePicker />
            <p className="mt-2 text-xs text-gray-400">
              Informational only, not legal advice. Final eligibility is confirmed at checkout.
            </p>
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-5xl px-4 py-12">
        {/* 5 launch states */}
        <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Popular states</h2>
        <p className="mt-1 text-sm text-gray-500">
          Full, source-backed guides are live for these states.
        </p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {LAUNCH_STATES.map((s) => {
            const c = getStateContent(s);
            if (!c) return null;
            return (
              <Link
                key={s.code}
                href={`/vape-laws/${s.slug}`}
                className="group flex flex-col rounded-2xl border border-gray-200 bg-white p-5 transition hover:border-purple-300 hover:shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900 group-hover:text-purple-700">
                    {s.name}
                  </h3>
                  <span className="rounded-md bg-purple-50 px-2 py-0.5 text-xs font-bold text-purple-700">
                    {s.code}
                  </span>
                </div>
                <p className="mt-2 line-clamp-4 flex-1 text-sm text-gray-600">{c.headline}</p>
                <span className="mt-3 text-sm font-medium text-purple-600 group-hover:underline">
                  View {s.name} rules →
                </span>
              </Link>
            );
          })}
        </div>

        <StateProductIndex />

        {/* Quick explainer */}
        <section className="mt-12">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900">
            What these rules mean for ordering vapes
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {[
              {
                t: 'Minimum age 21',
                d: 'Federal law sets the tobacco/vaping purchase age at 21. Every retailer must verify age, including online.',
              },
              {
                t: 'Flavor & disposable bans',
                d: 'States restrict flavors and single-use devices differently — from outright bans to authorized-product lists.',
              },
              {
                t: 'Online shipping (PACT Act)',
                d: 'Online sellers must register and verify age; some states block or tightly limit interstate vape shipments.',
              },
              {
                t: 'PMTA directories',
                d: 'Directory states only allow products with FDA marketing authorization that appear on the state’s list.',
              },
            ].map((b) => (
              <div key={b.t} className="rounded-2xl border border-gray-200 bg-white p-5">
                <h3 className="text-base font-semibold text-gray-900">{b.t}</h3>
                <p className="mt-1 text-sm text-gray-600">{b.d}</p>
              </div>
            ))}
          </div>
        </section>

        {/* 50 state index — every link is a real 200 page */}
        <section className="mt-12">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900">All states</h2>
          <p className="mt-1 text-sm text-gray-500">
            Detailed guides are rolling out. Every state opens a real page — generic ones are
            clearly marked “guide coming soon”.
          </p>
          <ul className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {ALL_STATES.map((s) => (
              <li key={s.code}>
                <Link
                  href={`/vape-laws/${s.slug}`}
                  className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm transition ${
                    s.launched
                      ? 'border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-purple-200 hover:text-purple-700'
                  }`}
                >
                  <span>{s.name}</span>
                  <span className="text-xs font-semibold text-gray-400">{s.code}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {/* FAQ */}
        <section className="mt-12">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900">
            Frequently asked questions
          </h2>
          <div className="mt-4 space-y-3">
            {FAQS.map((f) => (
              <details key={f.q} className="group rounded-xl border border-gray-200 bg-white p-4">
                <summary className="cursor-pointer list-none text-sm font-semibold text-gray-900 marker:hidden">
                  <span className="mr-2 text-purple-600">Q.</span>
                  {f.q}
                </summary>
                <p className="mt-2 pl-7 text-sm text-gray-600">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        <p className="mt-10 rounded-xl bg-amber-50 px-4 py-3 text-xs text-amber-800">
          {COMPLIANCE_DISCLAIMER}
        </p>
      </main>
    </div>
  );
}
