import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';
import { readFile } from 'node:fs/promises';
export interface Sql { query(sql: string, params?: any[]): Promise<{ rows: any[] }> }
export interface Store extends Sql { transaction<T>(fn: (db: Sql) => Promise<T>): Promise<T>; close(): Promise<void> }
export async function openStore(options: { databaseUrl?: string; dataDir?: string } = {}): Promise<Store> {
 let store: Store;
 if (options.databaseUrl) {
  const pool = new pg.Pool({ connectionString: options.databaseUrl, max: 5 });
  store = {
   query: (sql, params) => pool.query(sql, params),
   async transaction(fn) { const client = await pool.connect(); try { await client.query('BEGIN'); const result = await fn(client); await client.query('COMMIT'); return result } catch (e) { await client.query('ROLLBACK'); throw e } finally { client.release() } },
   async close() { await pool.end() }
  };
 } else {
  const db = new PGlite(options.dataDir);
  await db.waitReady;
  store = { query: (sql, params) => db.query(sql, params), transaction: fn => db.transaction(tx => fn(tx)), close: () => db.close() };
 }
 const migration = await readFile(new URL('./migrations/001-auth.sql', import.meta.url), 'utf8');
 // The initial migration is additive and idempotent; later changes require numbered migrations.
 if (options.databaseUrl) await store.transaction(async db => { await db.query(migration) });
 else {
  // PGlite prepared queries accept one statement; use exec for this trusted migration only.
  const embedded = store;
  for (const statement of migration.split(';').map(s => s.trim()).filter(Boolean)) await embedded.query(statement);
 }
 return store;
}
