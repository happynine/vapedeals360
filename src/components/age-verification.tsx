'use client';

import { useState, useEffect } from 'react';

const REGION_AGE_LIMITS: { code: string; label: string; minAge: number }[] = [
  { code: 'US', label: 'United States (21+)', minAge: 21 },
  { code: 'JP', label: 'Japan (20+)', minAge: 20 },
  { code: 'KR', label: 'South Korea (19+)', minAge: 19 },
  { code: 'CA', label: 'Canada (18+)', minAge: 18 },
  { code: 'UK', label: 'United Kingdom (18+)', minAge: 18 },
  { code: 'EU', label: 'European Union (18+)', minAge: 18 },
  { code: 'AU', label: 'Australia (18+)', minAge: 18 },
  { code: 'RU', label: 'Russia (18+)', minAge: 18 },
  { code: 'OTHER', label: 'Other (18+)', minAge: 18 },
];

export default function AgeVerification() {
  const [region, setRegion] = useState('');
  const [month, setMonth] = useState('');
  const [day, setDay] = useState('');
  const [year, setYear] = useState('');
  const [error, setError] = useState('');
  const [isVerified, setIsVerified] = useState(true); // default true to avoid flash
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const verified = localStorage.getItem('age_verified') === 'true';
    setIsVerified(verified);
    if (verified) {
      window.dispatchEvent(new Event('ageVerified'));
    }
    setMounted(true);
  }, []);

  const selectedRegion = REGION_AGE_LIMITS.find(r => r.code === region);
  const minAge = selectedRegion?.minAge ?? 18;

  const handleVerify = () => {
    if (!region) {
      setError('Please select your region.');
      return;
    }
    if (!month || !day || !year) {
      setError('Please enter your full date of birth.');
      return;
    }

    const m = parseInt(month, 10);
    const d = parseInt(day, 10);
    const y = parseInt(year, 10);

    if (isNaN(m) || isNaN(d) || isNaN(y) || m < 1 || m > 12 || d < 1 || d > 31 || y < 1900 || y > new Date().getFullYear()) {
      setError('Please enter a valid date of birth.');
      return;
    }

    const today = new Date();
    const birthDate = new Date(y, m - 1, d);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }

    if (age >= minAge) {
      localStorage.setItem('age_verified', 'true');
      setIsVerified(true);
      window.dispatchEvent(new Event('ageVerified'));
    } else {
      setError(`Sorry, you must be at least ${minAge} years old to enter this site in ${selectedRegion?.label?.replace(/\s*\(\d+\+\)$/, '') || 'your region'}.`);
    }
  };

  if (!mounted || isVerified) {
    return null;
  }

  const months = [
    { value: '1', label: 'January' },
    { value: '2', label: 'February' },
    { value: '3', label: 'March' },
    { value: '4', label: 'April' },
    { value: '5', label: 'May' },
    { value: '6', label: 'June' },
    { value: '7', label: 'July' },
    { value: '8', label: 'August' },
    { value: '9', label: 'September' },
    { value: '10', label: 'October' },
    { value: '11', label: 'November' },
    { value: '12', label: 'December' },
  ];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-[2px]">
      <div className="mx-4 w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl border border-gray-700 bg-[#1a1a24] p-8">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-purple-500/20">
            <svg className="h-8 w-8 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-white">Age Verification</h2>
          <p className="mt-2 text-sm leading-relaxed text-gray-400">
            {region
              ? `This website contains information about vaping products intended for adults aged ${minAge} and older. By entering this site, you confirm that you are at least ${minAge} years of age and understand the health risks associated with nicotine and vaping products.`
              : 'This website contains information about vaping products intended for adults of legal smoking age in their jurisdiction. By entering this site, you confirm that you meet the legal age requirement in your region and understand the health risks associated with nicotine and vaping products.'}
          </p>
        </div>

        <div className="mb-4">
          <label className="mb-2 block text-sm font-medium text-gray-300">Region</label>
          <select
            value={region}
            onChange={(e) => { setRegion(e.target.value); setError(''); }}
            className="w-full rounded-lg border border-gray-600 bg-[#0f0f13] px-3 py-2.5 text-white focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
          >
            <option value="">Select your region</option>
            {REGION_AGE_LIMITS.map((r) => (
              <option key={r.code} value={r.code}>{r.label}</option>
            ))}
          </select>
        </div>

        <div className="mb-4">
          <label className="mb-2 block text-sm font-medium text-gray-300">Date of Birth</label>
          <div className="flex gap-2">
            <div className="flex-1">
              <select
                value={month}
                onChange={(e) => { setMonth(e.target.value); setError(''); }}
                className="w-full rounded-lg border border-gray-600 bg-[#0f0f13] px-2 py-2.5 text-white focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
              >
                <option value="">Month</option>
                {months.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
            <div className="w-20">
              <select
                value={day}
                onChange={(e) => { setDay(e.target.value); setError(''); }}
                className="w-full rounded-lg border border-gray-600 bg-[#0f0f13] px-1 py-2.5 text-center text-white focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
              >
                <option value="">Day</option>
                {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                  <option key={d} value={String(d)}>{String(d).padStart(2, '0')}</option>
                ))}
              </select>
            </div>
            <div className="w-24">
              <select
                value={year}
                onChange={(e) => { setYear(e.target.value); setError(''); }}
                className="w-full rounded-lg border border-gray-600 bg-[#0f0f13] px-1 py-2.5 text-center text-white focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
              >
                <option value="">Year</option>
                {Array.from({ length: 100 }, (_, i) => new Date().getFullYear() - i).map((y) => (
                  <option key={y} value={String(y)}>{y}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-red-500/20 px-4 py-2 text-sm text-red-400 border border-red-500/30">
            {error}
          </div>
        )}

        <button
          onClick={handleVerify}
          className="w-full rounded-lg bg-purple-600 py-3 text-base font-semibold text-white transition-colors hover:bg-purple-700 active:bg-purple-800"
        >
          Verify Age
        </button>

        <div className="mt-5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-400">
            Warning
          </p>
          <p className="mt-1 text-xs leading-relaxed text-amber-300/80">
            Vaping products contain nicotine, a highly addictive substance. {region
                ? `Not intended for use by persons under the age of ${minAge}, pregnant or nursing women, or persons with heart disease or high blood pressure.`
                : 'Not intended for use by persons under the legal smoking age in their jurisdiction, pregnant or nursing women, or persons with heart disease or high blood pressure.'} If you are a smoker, quitting smoking is the best thing you can do to improve your health.
          </p>
        </div>
      </div>
    </div>
  );
}
