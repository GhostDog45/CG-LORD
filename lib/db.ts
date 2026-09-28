import { neon } from '@neondatabase/serverless';

export function getDb() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return null;
  }
  return neon(databaseUrl);
}

let isInitialized = false;

export async function ensureTableExists() {
  if (isInitialized) return;
  const sql = getDb();
  if (!sql) return;

  try {
    await sql`
      CREATE TABLE IF NOT EXISTS cgs (
        id TEXT PRIMARY KEY,
        cg NUMERIC(4, 2) NOT NULL,
        timestamp BIGINT NOT NULL,
        ip TEXT NOT NULL,
        secret_token TEXT
      );
    `;
    // Ensure column exists for backwards compatibility
    await sql`
      ALTER TABLE cgs ADD COLUMN IF NOT EXISTS secret_token TEXT;
    `;
    isInitialized = true;
  } catch (error) {
    console.error('Failed to initialize Neon database table:', error);
  }
}
