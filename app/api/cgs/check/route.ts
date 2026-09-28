import { NextResponse } from 'next/server';
import { getDb, ensureTableExists } from '@/lib/db';

function getClientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const firstIp = forwarded.split(',')[0].trim();
    if (firstIp) return firstIp;
  }
  const realIp = req.headers.get('x-real-ip') || req.headers.get('x-vercel-ip');
  if (realIp) return realIp.trim();
  return 'unknown';
}

export async function GET(req: Request) {
  const ip = getClientIp(req);
  const { searchParams } = new URL(req.url);
  const fp = searchParams.get('fp');

  const sql = getDb();
  if (!sql) {
    return NextResponse.json({ exists: false });
  }

  try {
    await ensureTableExists();

    // 1. Check if IP exists
    if (ip !== 'unknown') {
      const rowsByIp = await sql`
        SELECT id FROM cgs WHERE ip = ${ip} LIMIT 1
      `;
      if (rowsByIp.length > 0) {
        return NextResponse.json({ exists: true, id: rowsByIp[0].id });
      }
    }

    // 2. Check if Device Fingerprint exists
    if (fp) {
      const rowsByFp = await sql`
        SELECT id FROM cgs WHERE fingerprint = ${fp} LIMIT 1
      `;
      if (rowsByFp.length > 0) {
        return NextResponse.json({ exists: true, id: rowsByFp[0].id });
      }
    }

    return NextResponse.json({ exists: false });
  } catch (error) {
    console.error('Check IP/Fingerprint error:', error);
    return NextResponse.json({ exists: false });
  }
}
