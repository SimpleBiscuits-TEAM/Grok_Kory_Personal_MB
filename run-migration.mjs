import fs from 'fs';
import mysql from 'mysql2/promise';

const sql = fs.readFileSync('drizzle/0005_workable_mockingbird.sql', 'utf8');
const statements = sql.split('--> statement-breakpoint').map(s => s.trim()).filter(Boolean);

async function run() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  for (let i = 0; i < statements.length; i++) {
    console.log(`Executing statement ${i + 1}/${statements.length}...`);
    try {
      await conn.execute(statements[i]);
      console.log('  OK');
    } catch (e) {
      console.log('  ERROR:', e.message);
    }
  }
  await conn.end();
  console.log('Migration complete');
}
run();
