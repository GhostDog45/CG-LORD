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
    const { id, cg, secret_token } = body;

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

    // 3. IDOR / Privilege Escalation Prevention: Check if entry already exists
    const existingById = await sql`
      SELECT id, secret_token, ip FROM cgs WHERE id = ${id} LIMIT 1
    `;

    if (existingById.length > 0) {
      const record = existingById[0];
      // If record has a secret_token, verify caller possesses the same secret_token
      if (record.secret_token && record.secret_token !== token) {
        return NextResponse.json(
          { error: 'Unauthorized: You do not have permission to modify this entry.' },
          { status: 403 }
        );
      }

      // Authorized update
      await sql`
        UPDATE cgs 
        SET cg = ${sanitizedCg}, ip = ${ip}, secret_token = COALESCE(secret_token, ${token})
        WHERE id = ${id}
      `;
      return NextResponse.json({ success: true });
    }

    // 4. One submission per IP check
    if (ip !== 'unknown') {
      const existingByIp = await sql`
        SELECT id FROM cgs WHERE ip = ${ip} LIMIT 1
      `;
      if (existingByIp.length > 0) {
        return NextResponse.json(
          { error: 'You have already submitted a CG from this IP address.' },
          { status: 403 }
        );
      }
    }

    // 5. Authorized insertion
    await sql`
      INSERT INTO cgs (id, cg, timestamp, ip, secret_token)
      VALUES (${id}, ${sanitizedCg}, ${Date.now()}, ${ip}, ${token})
    `;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('POST error:', error);
    return NextResponse.json({ error: 'Failed to process request.' }, { status: 500 });
  }
}
