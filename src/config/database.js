const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

const dbUrl = process.env.DATABASE_URL;
// For production, we only use PostgreSQL
const isPostgres = !!dbUrl && (process.env.NODE_ENV === 'production' || dbUrl.includes('postgres'));
console.log(`📡 Database detection: isPostgres=${isPostgres}, NODE_ENV=${process.env.NODE_ENV}`);

let pool = null;

const ensureAddressColumns = async () => {
  try {
    if (isPostgres) {
      // Add address columns if missing
      await pool.query('ALTER TABLE agents ADD COLUMN IF NOT EXISTS address text');
      await pool.query('ALTER TABLE pending_users ADD COLUMN IF NOT EXISTS address text');
      console.log('✅ Database schema ensured');
      return;
    }
    console.log('⚠️ Not in PostgreSQL mode, skipping schema ensure');
  } catch (err) {
    console.warn('⚠️ Schema ensure failed (address columns):', err.message || err);
  }
};

if (isPostgres) {
  if (!dbUrl) {
    console.error('❌ DATABASE_URL is required for PostgreSQL connection');
    process.exit(1);
  }
  
  pool = new Pool({
    connectionString: dbUrl,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });
  
  console.log('🤖 Bot connected to PostgreSQL');
  
  // Test connection
  pool.query('SELECT NOW()', (err, result) => {
    if (err) {
      console.error('❌ PostgreSQL connection test failed:', err);
      process.exit(1);
    } else {
      console.log('✅ PostgreSQL connection successful');
      // Fire-and-forget schema ensure
      ensureAddressColumns();
    }
  });
} else {
  console.error('❌ Bot requires PostgreSQL database in production');
  console.error('❌ Please set DATABASE_URL environment variable');
  process.exit(1);
}

// PostgreSQL query function
const queryPostgres = (text, params) => pool.query(text, params);

module.exports = {
  isPostgres: true, // Always true in production
  query: queryPostgres,
  
  // Method to get a client for transactions
  getClient: async () => {
    return await pool.connect();
  }
};