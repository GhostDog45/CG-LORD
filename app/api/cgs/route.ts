import { NextResponse } from 'next/server';
import { getDb, ensureTableExists } from '@/lib/db';

// Rate limiting: max 10 requests per minute per IP
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

function checkRateLimit(ip: string): boolean {
  if (ip === 'unknown') return true;
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + 60000 });
    return true;
  }
  if (entry.count >= 10) {
    return false;
  }
  entry.count++;
  return true;
}

// Safely extract client IP address to prevent header spoofing
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

export async function GET() {
  const sql = getDb();
  if (!sql) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
  }

  try {
    await ensureTableExists();
    // Only return public fields - NEVER leak secret_token or ip
    const rows = await sql`
      SELECT id, cg, timestamp 
      FROM cgs 
      ORDER BY cg DESC, timestamp ASC
    `;
    const cgs = rows.map((r: any) => ({
      id: String(r.id),
      cg: parseFloat(r.cg),
      timestamp: Number(r.timestamp),
    }));
    return NextResponse.json(cgs);
  } catch (error) {
    console.error('Neon GET error:', error);
    return NextResponse.json([]);
  }
}

export async function POST(req: Request) {
  const ip = getClientIp(req);

  // 1. Rate limiting check
  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait a moment before trying again.' },
      { status: 429 }
    );
  }

  try {
    const body = await req.json();
    const { id, cg, secret_token, fingerprint } = body;
    const fp = typeof fingerprint === 'string' && fingerprint.length <= 100 ? fingerprint.trim() : null;

    // 2. Strict Input validation
    if (
      typeof cg !== 'number' ||
      !Number.isFinite(cg) ||
      isNaN(cg) ||
      cg < 0 ||
      cg > 4
    ) {
      return NextResponse.json(
        { error: 'Invalid CG. Must be a valid number between 0.00 and 4.00.' },
        { status: 400 }
      );
    }

    if (!id || typeof id !== 'string' || id.length > 100) {
      return NextResponse.json({ error: 'Invalid identifier.' }, { status: 400 });
    }

    // Round to 2 decimal places to prevent arbitrary precision injection
    const sanitizedCg = Math.round(cg * 100) / 100;
    const token = typeof secret_token === 'string' && secret_token.length <= 100 ? secret_token : id;

    const sql = getDb();
    if (!sql) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    await ensureTableExists();

    // 3. Find if user/device already has a slot on the leaderboard (by ID, Fingerprint, or IP)
    let existingRecord: any = null;

    // A. Check by ID
    const existingById = await sql`
      SELECT id, secret_token, ip, fingerprint FROM cgs WHERE id = ${id} LIMIT 1
    `;
    if (existingById.length > 0) {
      existingRecord = existingById[0];
    }

    // B. Check by Device Fingerprint
    if (!existingRecord && fp) {
      const existingByFp = await sql`
        SELECT id, secret_token, ip, fingerprint FROM cgs WHERE fingerprint = ${fp} LIMIT 1
      `;
      if (existingByFp.length > 0) {
        existingRecord = existingByFp[0];
      }
    }

    // C. Check by IP
    if (!existingRecord && ip !== 'unknown') {
      const existingByIp = await sql`
        SELECT id, secret_token, ip, fingerprint FROM cgs WHERE ip = ${ip} LIMIT 1
      `;
      if (existingByIp.length > 0) {
        existingRecord = existingByIp[0];
      }
    }

    // If an existing slot is found: UPDATE that slot (allows user to change CG, prevents duplicate spam)
    if (existingRecord) {
      await sql`
        UPDATE cgs 
        SET cg = ${sanitizedCg}, 
            timestamp = ${Date.now()},
            ip = ${ip}, 
            secret_token = COALESCE(secret_token, ${token}),
            fingerprint = COALESCE(${fp}, fingerprint)
        WHERE id = ${existingRecord.id}
      `;
      return NextResponse.json({ success: true, id: existingRecord.id });
    }

    // Brand new submission: create 1 new slot on the leaderboard
    await sql`
      INSERT INTO cgs (id, cg, timestamp, ip, secret_token, fingerprint)
      VALUES (${id}, ${sanitizedCg}, ${Date.now()}, ${ip}, ${token}, ${fp})
    `;

    return NextResponse.json({ success: true, id });
  } catch (error) {
    console.error('POST error:', error);
    return NextResponse.json({ error: 'Failed to process request.' }, { status: 500 });
  }
}
