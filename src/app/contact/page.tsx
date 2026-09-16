import type { Metadata } from 'next';
import { ContactView } from '@/components/contact-view';

export const metadata: Metadata = {
  title: 'Contact Us',
  description:
    'Contact VapeDeals360 for questions, feedback, or business inquiries. Email info@vapedeals360.com or use our contact form.',
  alternates: { canonical: 'https://www.vapedeals360.com/contact' },
};

export default function ContactPage() {
  return <ContactView />;
}
