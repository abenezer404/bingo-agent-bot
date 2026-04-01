const db = require('../config/database');

class AgentService {
  /**
   * Check if an agent is authorized by their Telegram ID
   */
  static async getAgentByTelegramId(telegramId) {
    try {
      // Postgres and SQLite have different syntax for booleans
      const sql = db.isPostgres 
        ? 'SELECT * FROM agents WHERE telegram_id = $1 AND is_active = true'
        : 'SELECT * FROM agents WHERE telegram_id = $1 AND is_active = 1';
        
      const result = await db.query(sql, [telegramId.toString()]);
      return result.rows[0] || null;
    } catch (error) {
      console.error('Error getting agent:', error);
      return null;
    }
  }

  static async updateAgentAddress(agentId, address) {
    try {
      await db.query('UPDATE agents SET address = $1 WHERE id = $2', [address, agentId]);
      return { success: true };
    } catch (error) {
      console.error('Error updating agent address:', error);
      return { success: false, message: 'Database error' };
    }
  }

  static async getPendingUserByUsernameAndSerial(username, serialNumber) {
    try {
      const result = await db.query(
        'SELECT id, username, machine_serial, address FROM pending_users WHERE username = $1 AND machine_serial = $2',
        [username, serialNumber]
      );
      return result.rows[0] || null;
    } catch (error) {
      console.error('Error getting pending user:', error);
      return null;
    }
  }

  /**
   * Deduct credit balance and assign package to user securely
   */
  static async assignPackageToUser(agentId, serialNumber, username, amount) {
    const client = await db.getClient();
    
    try {
      await client.query('BEGIN');
      
      // 1. Get agent's current balance
      const agentResult = await client.query('SELECT credit_balance FROM agents WHERE id = $1 FOR UPDATE', [agentId]);
      if (agentResult.rows.length === 0) throw new Error('Agent not found');
      
      const currentCredit = parseFloat(agentResult.rows[0].credit_balance);
      if (currentCredit < amount) {
        throw new Error(`Insufficient credit. You only have ${currentCredit} ብር`);
      }
      
      // 2. Find the target user by BOTH Username and Serial Number
      const userResult = await client.query(
        'SELECT id FROM pending_users WHERE username = $1 AND machine_serial = $2', 
        [username, serialNumber]
      );
      
      if (userResult.rows.length === 0) {
        throw new Error('User not found or mismatch: Combined Username and Serial Number do not match any record.');
      }
      const userId = userResult.rows[0].id;

      // 3. Deduct from agent
      await client.query(
        'UPDATE agents SET credit_balance = credit_balance - $1 WHERE id = $2',
        [amount, agentId]
      );
      
      // 4. Log the agent transaction
      await client.query(
        'INSERT INTO agent_transactions (agent_id, transaction_type, amount, target_user_id, description) VALUES ($1, $2, $3, $4, $5)',
        [agentId, 'deduct', amount, userId, `Assigned ${amount} to ${username}`]
      );
      
      // 5. Add to user_packages with agent name
      const agentNameResult = await client.query('SELECT name FROM agents WHERE id = $1', [agentId]);
      const agentName = agentNameResult.rows[0]?.name || 'Unknown Agent';
      
      await client.query(
        'INSERT INTO user_packages (user_id, amount, assigned_by) VALUES ($1, $2, $3)',
        [userId, amount, `Agent: ${agentName}`]
      );
      
      await client.query('COMMIT');
      return { success: true, newBalance: currentCredit - amount };
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Transaction failed:', error);
      return { success: false, message: error.message };
    } finally {
      client.release();
    }
  }

  /**
   * Register a new user
   */
  static async registerUser(username, plainPassword) {
    // Basic password hashing logic equivalent to the admin server
    const crypto = require('crypto');
    const passwordHash = crypto.createHash('sha256').update(plainPassword).digest('hex');
    
    try {
      const result = await db.query(
        'INSERT INTO pending_users (username, password_hash, address) VALUES ($1, $2, $3) RETURNING id',
        [username, passwordHash, null]
      );
      return { success: true, userId: result.rows[0].id };
    } catch (error) {
      if (error.code === '23505') { // unique violation
        return { success: false, message: 'Username already exists' };
      }
      return { success: false, message: 'Database error' };
    }
  }

  /**
   * Get users by address (for agents to see users in their area)
   */
  static async getUsersByAddress(address) {
    try {
      const result = await db.query(
        'SELECT id, username, machine_serial, created_at FROM pending_users WHERE LOWER(TRIM(address)) = LOWER(TRIM($1)) ORDER BY created_at DESC',
        [address]
      );
      return result.rows || [];
    } catch (error) {
      console.error('Error getting users by address:', error);
      return [];
    }
  }

  /**
   * Get recent transactions for an agent
   */
  static async getAgentTransactions(agentId) {
    try {
      const sql = `
        SELECT t.*, u.username as target_username
        FROM agent_transactions t
        LEFT JOIN pending_users u ON t.target_user_id = u.id
        WHERE t.agent_id = $1
        ORDER BY t.created_at DESC
        LIMIT 50
      `;
      const result = await db.query(sql, [agentId]);
      return result.rows || [];
    } catch (error) {
      console.error('Error getting agent transactions:', error);
      return [];
    }
  }
}

module.exports = AgentService;
