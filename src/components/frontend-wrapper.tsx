'use client';

import { usePathname } from 'next/navigation';

export default function FrontendWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdmin = pathname.startsWith('/admin');

  if (isAdmin) {
    return <>{children}</>;
  }

  return (
    <>
      <div className="bg-yellow-500 text-center py-1.5 px-4 text-xs font-bold text-black tracking-wide">
        WARNING: This product contains nicotine. Nicotine is an addictive chemical.
      </div>
      <div className="flex flex-col min-h-[calc(100vh-30px)]">
        <div className="flex-1">{children}</div>
        <div className="bg-[#0a0a0e] text-center py-4 px-4 text-xs text-gray-400">
          ©Vapedeals360.com All Rights Reserved.
        </div>
      </div>
    </>
  );
}
