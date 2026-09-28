import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { getDb, ensureTableExists } from '@/lib/db';

const dbPath = path.join(process.cwd(), 'data', 'db.json');

async function initLocalDb() {
  try {
    await fs.mkdir(path.join(process.cwd(), 'data'), { recursive: true });
    try {
      await fs.access(dbPath);
    } catch {
      await fs.writeFile(dbPath, JSON.stringify([]));
    }
  } catch (error) {
    console.error('Failed to init local DB:', error);
  }
}

export async function GET() {
  const sql = getDb();
  if (sql) {
    try {
      await ensureTableExists();
      const rows = await sql`
        SELECT id, cg, timestamp 
        FROM cgs 
        ORDER BY cg DESC, timestamp ASC
      `;
      const cgs = rows.map((r: any) => ({
        id: r.id,
        cg: parseFloat(r.cg),
        timestamp: Number(r.timestamp),
      }));
      return NextResponse.json(cgs);
    } catch (error) {
      console.error('Neon GET error:', error);
      return NextResponse.json([]);
    }
  }

  // Local JSON fallback
  await initLocalDb();
  try {
    const data = await fs.readFile(dbPath, 'utf-8');
    const cgs = JSON.parse(data);
    cgs.sort((a: any, b: any) => b.cg - a.cg || a.timestamp - b.timestamp);
    return NextResponse.json(cgs);
  } catch (error) {
    return NextResponse.json([]);
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { id, cg } = body;
    
    if (typeof cg !== 'number' || !id || cg < 0 || cg > 4) {
      return NextResponse.json({ error: 'Invalid CG. Must be between 0 and 4.' }, { status: 400 });
    }

    const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';

    const sql = getDb();
    if (sql) {
      await ensureTableExists();

      // Check if user already submitted with this ID (updating)
      const existingUser = await sql`
        SELECT id FROM cgs WHERE id = ${id} LIMIT 1
      `;

      if (existingUser.length > 0) {
        await sql`
          UPDATE cgs 
          SET cg = ${cg}, ip = ${ip} 
          WHERE id = ${id}
        `;
        return NextResponse.json({ success: true });
      }

      // Check if IP already submitted with another ID
      if (ip !== 'unknown') {
        const existingIp = await sql`
          SELECT id FROM cgs WHERE ip = ${ip} LIMIT 1
        `;
        if (existingIp.length > 0) {
          return NextResponse.json(
            { error: 'You have already submitted a CG from this IP address.' }, 
            { status: 403 }
          );
        }
      }

      // New entry
      await sql`
        INSERT INTO cgs (id, cg, timestamp, ip)
        VALUES (${id}, ${cg}, ${Date.now()}, ${ip})
      `;
      return NextResponse.json({ success: true });
    }

    // Local JSON fallback
    await initLocalDb();
    const data = await fs.readFile(dbPath, 'utf-8');
    const cgs = JSON.parse(data);
    
    const existingIdIndex = cgs.findIndex((entry: any) => entry.id === id);
    if (existingIdIndex !== -1) {
      cgs[existingIdIndex].cg = cg;
      cgs[existingIdIndex].ip = ip;
    } else {
      const existingIpIndex = cgs.findIndex((entry: any) => entry.ip === ip && ip !== 'unknown');
      if (existingIpIndex !== -1) {
        return NextResponse.json({ error: 'You have already submitted a CG from this IP address.' }, { status: 403 });
      }
      cgs.push({ id, cg, timestamp: Date.now(), ip });
    }
    
    await fs.writeFile(dbPath, JSON.stringify(cgs, null, 2));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('POST error:', error);
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 });
  }
}
