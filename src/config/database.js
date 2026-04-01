const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { Pool } = require('pg');
require('dotenv').config();

const dbUrl = process.env.DATABASE_URL;
// Smarter check: If the URL has 'dpg-' but NO 'render.com', it is an INTERNAL hostname that won't resolve locally.
const containsInternalHost = dbUrl && dbUrl.includes('dpg-') && !dbUrl.includes('render.com');
const isPostgres = dbUrl && !dbUrl.includes('hostname:5432') && !containsInternalHost;
console.log(`📡 Database detection: isPostgres=${isPostgres}`);

let pool = null;
let sqliteDb = null;

const querySqliteRaw = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    sqliteDb.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve({ changes: this.changes, lastID: this.lastID });
    });
  });
};

const sqliteAll = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    sqliteDb.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
};

const ensureAddressColumns = async () => {
  try {
    if (isPostgres) {
      // Add address columns if missing
      await pool.query('ALTER TABLE agents ADD COLUMN IF NOT EXISTS address text');
      await pool.query('ALTER TABLE pending_users ADD COLUMN IF NOT EXISTS address text');
      return;
    }

    // SQLite
    const agentsCols = await sqliteAll('PRAGMA table_info(agents)');
    const hasAgentAddress = agentsCols.some(c => (c.name || '').toLowerCase() === 'address');
    if (!hasAgentAddress) {
      await querySqliteRaw('ALTER TABLE agents ADD COLUMN address TEXT');
    }

    const usersCols = await sqliteAll('PRAGMA table_info(pending_users)');
    const hasUserAddress = usersCols.some(c => (c.name || '').toLowerCase() === 'address');
    if (!hasUserAddress) {
      await querySqliteRaw('ALTER TABLE pending_users ADD COLUMN address TEXT');
    }
  } catch (err) {
    console.warn('⚠️ Schema ensure failed (address columns):', err.message || err);
  }
};

if (isPostgres) {
  pool = new Pool({
    connectionString: dbUrl,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : { rejectUnauthorized: false } // Common for Render external access
  });
  console.log('🤖 Bot connected to PostgreSQL');
  // Fire-and-forget schema ensure
  ensureAddressColumns();
} else {
  if (containsInternalHost) {
    console.warn('⚠️ WARNING: You are using an INTERNAL Database URL on your local machine. It will NOT connect. Falling back to LOCAL SQLite.');
  }
  // Use the admin server's local SQLite DB
  const dbPath = path.resolve(__dirname, '../../../bingo-admin-server/kelalbingo.db');
  sqliteDb = new sqlite3.Database(dbPath, (err) => {
    if (err) console.error('Bot SQLite error:', err);
    else {
      console.log('🤖 Bot connected to Local SQLite');
      ensureAddressColumns();
    }
  });
}

// Translate Postgres parameterized queries ($1, $2) to SQLite (?)
const queryPostgres = (text, params) => pool.query(text, params);
const querySqlite = (text, params) => {
  return new Promise((resolve, reject) => {
    // Basic conversion of $1, $2 to ?
    let sql = text.replace(/\$\d+/g, '?');
    
    // Check if it's an INSERT/UPDATE to use run, otherwise all
    const upperText = text.trim().toUpperCase();
    if (upperText.startsWith('SELECT')) {
      sqliteDb.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve({ rows: rows || [] });
      });
    } else {
      sqliteDb.run(sql, params, function(err) {
        if (err) reject(err);
        else resolve({ rows: [], rowCount: this.changes, lastID: this.lastID });
      });
    }
  });
};

module.exports = {
  isPostgres: isPostgres,
  query: isPostgres ? queryPostgres : querySqlite,
  
  // Method to get a client for transactions (simulated for SQLite)
  getClient: async () => {
    if (isPostgres) {
      return await pool.connect();
    } else {
      // For SQLite, return a simulated client that just runs sequentially
      return {
        query: querySqlite,
        release: () => {}
      };
    }
  }
};
