import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';
import { readFile, readdir } from 'node:fs/promises';
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
 await store.query('CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
 const directory=new URL('./migrations/',import.meta.url);
 try {
  for(const filename of (await readdir(directory)).filter(f=>/^\d+-[a-z-]+\.sql$/.test(f)).sort()) {
   const version=filename.replace(/\.sql$/,'');
   if((await store.query('SELECT 1 FROM schema_migrations WHERE version=$1',[version])).rows.length)continue;
   const source=await readFile(new URL(filename,directory),'utf8');
   await store.transaction(async db=>{
    for(const statement of source.split(';').map(s=>s.trim()).filter(Boolean))await db.query(statement);
    await db.query('INSERT INTO schema_migrations(version) VALUES($1) ON CONFLICT DO NOTHING',[version]);
   });
  }
 } catch(error) { await store.close();throw error }

 return store;
}
