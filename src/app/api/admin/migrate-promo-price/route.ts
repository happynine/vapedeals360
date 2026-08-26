import { NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
export async function GET() {
  const envKeys = Object.keys(process.env).sort();
  const safe: Record<string, string> = {};
  for (const k of envKeys) {
    const v = process.env[k] || '';
    // Show only non-secret values: show first 15 chars of sensitive ones
    if (k.includes('SECRET') || k.includes('KEY') || k.includes('PASSWORD') || k.includes('TOKEN') || k.includes('URL')) {
      safe[k] = v.substring(0, 20) + '...(' + v.length + ' chars)';
    } else {
      safe[k] = v;
    }
  }
  return NextResponse.json({ keys: envKeys, safe });
}
