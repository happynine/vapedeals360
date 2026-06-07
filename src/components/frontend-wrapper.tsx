'use client';

import { usePathname } from 'next/navigation';
import AgeVerification from '@/components/age-verification';
import WarningBar from '@/components/warning-bar';
import CookieConsent from '@/components/cookie-consent';

export default function FrontendWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdmin = pathname.startsWith('/admin');

  if (isAdmin) {
    return <>{children}</>;
  }

  return (
    <>
      <AgeVerification />
      <WarningBar />
      {children}
      <CookieConsent />
    </>
  );
}
