/*
Small Node script to test concurrent calls to the RPC create_session_with_personal_booking.
Usage: node run-concurrent-claims.js
Set DATABASE_URL env var to your Postgres connection string.
*/

const { Pool } = require('pg');
const CONCURRENCY = 5;
const RPC_CALL = `SELECT * FROM public.create_session_with_personal_booking($1,$2,$3,$4,$5)`;

async function run() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    const promises = [];
    for (let i = 0; i < CONCURRENCY; i++) {
      const params = [4, '2025-08-27', '11:00:00', 1, 165];
      promises.push(client.query(RPC_CALL, params).then(r => ({ ok: true, rows: r.rows })).catch(e => ({ ok:false, err: e.message })) );
    }
    const results = await Promise.all(promises);
    console.log('Results:', JSON.stringify(results, null, 2));
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(err => { console.error(err); process.exit(1); });
