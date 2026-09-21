import type { Metadata } from 'next';
import { UsZoneMall } from '@/components/us-zone-mall';

export const dynamic = 'force-dynamic';

const SITE_URL = 'https://www.vapedeals360.com';
const MALL_PATH = '/vape-laws';

export const metadata: Metadata = {
  title: 'US Vape Deals by State — US & International Vape Stores in USD',
  description:
    'Shop real-time vape deals in USD from US-domestic and international stores. Pick your ship-to state to hide stores that do not sell there, and switch between US and international warehouses.',
  alternates: { canonical: MALL_PATH },
  openGraph: {
    url: `${SITE_URL}${MALL_PATH}`,
    title: 'US Vape Deals by State — VapeDeals360',
    description:
      'USD vape deals from US and international stores, filtered by your ship-to state and warehouse.',
    type: 'website',
  },
};

export default function UsZoneMallPage() {
  return <UsZoneMall />;
}
