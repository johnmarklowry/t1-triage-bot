/**
 * db/repository.js
 * Enhanced data access layer with upsert operations and error handling
 */
const { query, transaction } = require('./connection');

/**
 * Retry logic with exponential backoff for transient errors
 */
async function withRetry(operation, maxRetries = 3, context = '') {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      const isRetryable = isRetryableError(error);
      const isLastAttempt = attempt === maxRetries;
      
      console.log(`[RETRY] ${context} - Attempt ${attempt}/${maxRetries}, Error: ${error.message}`);
      
      if (!isRetryable || isLastAttempt) {
        throw error;
      }
      
      // Exponential backoff with jitter
      const delay = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

/**
 * Check if an error is retryable (transient)
 */
function isRetryableError(error) {
  const retryableErrors = [
    'ECONNRESET',
    'ECONNREFUSED', 
    'ETIMEDOUT',
    'deadlock detected',
    'could not serialize access',
    'connection timeout',
    'connection refused'
  ];
  
  const errorMessage = error.message.toLowerCase();
  return retryableErrors.some(retryableError => 
    errorMessage.includes(retryableError.toLowerCase())
  );
}

/**
 * Enhanced audit logging helper with retry
 */
async function logAudit(tableName, recordId, operation, oldValues, newValues, changedBy, reason) {
  return await withRetry(async () => {
    try {
      await query(`
        INSERT INTO audit_logs (table_name, record_id, operation, old_values, new_values, changed_by, reason)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [tableName, recordId, operation, oldValues, newValues, changedBy, reason]);
    } catch (error) {
      console.error('[AUDIT] Failed to log audit:', error);
      // Don't throw - audit failures shouldn't break the main operation
    }
  }, 2, `Audit logging for ${tableName}`);
}

/**
 * Users Repository
 */
const UsersRepository = {
  /**
   * Get all users grouped by discipline
   */
  async getDisciplines() {
    const result = await query(`
      SELECT discipline, slack_id, name
      FROM users
      ORDER BY discipline, name
    `);
    
    const disciplines = {};
    result.rows.forEach(row => {
      if (!disciplines[row.discipline]) {
        disciplines[row.discipline] = [];
      }
      disciplines[row.discipline].push({
        slackId: row.slack_id,
        name: row.name
      });
    });
    
    return disciplines;
  },

  /**
   * Get users for a specific discipline
   */
  async getUsersByDiscipline(discipline) {
    const result = await query(`
      SELECT slack_id, name
      FROM users
      WHERE discipline = $1
      ORDER BY name
    `, [discipline]);
    
    return result.rows.map(row => ({
      slackId: row.slack_id,
      name: row.name
    }));
  },

  /**
   * Add a user to a discipline using upsert
   */
  async addUser(slackId, name, discipline, changedBy = 'system') {
    return await withRetry(async () => {
      return await transaction(async (client) => {
        const result = await client.query(`
          INSERT INTO users (slack_id, name, discipline)
          VALUES ($1, $2, $3)
          ON CONFLICT (slack_id, discipline) 
          DO UPDATE SET 
            name = EXCLUDED.name,
            updated_at = CURRENT_TIMESTAMP
          RETURNING id
        `, [slackId, name, discipline]);
        
        const userId = result.rows[0].id;
        
        await logAudit('users', userId, 'UPSERT', null, {
          slack_id: slackId,
          name: name,
          discipline: discipline
        }, changedBy, 'User added/updated in discipline');
        
        return userId;
      });
    }, 3, `Add user ${slackId} to ${discipline}`);
  },

  /**
   * Remove a user from a discipline
   */
  async removeUser(slackId, discipline, changedBy = 'system') {
    return await transaction(async (client) => {
      const oldUser = await client.query(`
        SELECT * FROM users WHERE slack_id = $1 AND discipline = $2
      `, [slackId, discipline]);
      
      if (oldUser.rows.length === 0) {
        return false;
      }
      
      await client.query(`
        DELETE FROM users WHERE slack_id = $1 AND discipline = $2
      `, [slackId, discipline]);
      
      await logAudit('users', oldUser.rows[0].id, 'DELETE', {
        slack_id: slackId,
        name: oldUser.rows[0].name,
        discipline: discipline
      }, null, changedBy, 'User removed from discipline');
      
      return true;
    });
  }
};

/**
 * Sprints Repository
 */
const SprintsRepository = {
  /**
   * Get all sprints
   */
  async getAll() {
    const result = await query(`
      SELECT sprint_name, start_date, end_date, sprint_index
      FROM sprints
      ORDER BY sprint_index
    `);
    
    return result.rows.map(row => ({
      sprintName: row.sprint_name,
      startDate: row.start_date,
      endDate: row.end_date,
      sprintIndex: row.sprint_index
    }));
  },

  /**
   * Get current sprint based on date
   */
  async getCurrentSprint(date = new Date()) {
    const result = await query(`
      SELECT sprint_name, start_date, end_date, sprint_index
      FROM sprints
      WHERE start_date <= $1 AND end_date >= $1
      ORDER BY sprint_index
      LIMIT 1
    `, [date]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    const row = result.rows[0];
    return {
      sprintName: row.sprint_name,
      startDate: row.start_date,
      endDate: row.end_date,
      index: row.sprint_index
    };
  },

  /**
   * Get next sprint after given index
   */
  async getNextSprint(currentIndex) {
    const result = await query(`
      SELECT sprint_name, start_date, end_date, sprint_index
      FROM sprints
      WHERE sprint_index > $1
      ORDER BY sprint_index
      LIMIT 1
    `, [currentIndex]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    const row = result.rows[0];
    return {
      sprintName: row.sprint_name,
      startDate: row.start_date,
      endDate: row.end_date,
      index: row.sprint_index
    };
  },

  /**
   * Add a sprint using upsert
   */
  async addSprint(sprintName, startDate, endDate, sprintIndex, changedBy = 'system') {
    return await withRetry(async () => {
      return await transaction(async (client) => {
        const result = await client.query(`
          INSERT INTO sprints (sprint_name, start_date, end_date, sprint_index)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (sprint_index) 
          DO UPDATE SET 
            sprint_name = EXCLUDED.sprint_name,
            start_date = EXCLUDED.start_date,
            end_date = EXCLUDED.end_date,
            updated_at = CURRENT_TIMESTAMP
          RETURNING id
        `, [sprintName, startDate, endDate, sprintIndex]);
        
        const sprintId = result.rows[0].id;
        
        await logAudit('sprints', sprintId, 'UPSERT', null, {
          sprint_name: sprintName,
          start_date: startDate,
          end_date: endDate,
          sprint_index: sprintIndex
        }, changedBy, 'Sprint added/updated');
        
        return sprintId;
      });
    }, 3, `Add sprint ${sprintName}`);
  }
};

/**
 * Current State Repository
 */
const CurrentStateRepository = {
  /**
   * Get current state
   */
  async get() {
    const result = await query(`
      SELECT sprint_index, account_slack_id, producer_slack_id, po_slack_id, ui_eng_slack_id, be_eng_slack_id
      FROM current_state
      WHERE id = 1
    `);
    
    if (result.rows.length === 0) {
      return {
        sprintIndex: null,
        account: null,
        producer: null,
        po: null,
        uiEng: null,
        beEng: null
      };
    }
    
    const row = result.rows[0];
    return {
      sprintIndex: row.sprint_index,
      account: row.account_slack_id,
      producer: row.producer_slack_id,
      po: row.po_slack_id,
      uiEng: row.ui_eng_slack_id,
      beEng: row.be_eng_slack_id
    };
  },

  /**
   * Update current state using upsert
   */
  async update(state, changedBy = 'system') {
    return await withRetry(async () => {
      return await transaction(async (client) => {
        // Get old state for audit
        const oldState = await client.query(`
          SELECT * FROM current_state WHERE id = 1
        `);
        
        // Use upsert to handle concurrent updates
        await client.query(`
          INSERT INTO current_state (id, sprint_index, account_slack_id, producer_slack_id, 
                                   po_slack_id, ui_eng_slack_id, be_eng_slack_id)
          VALUES (1, $1, $2, $3, $4, $5, $6)
          ON CONFLICT (id) 
          DO UPDATE SET 
            sprint_index = EXCLUDED.sprint_index,
            account_slack_id = EXCLUDED.account_slack_id,
            producer_slack_id = EXCLUDED.producer_slack_id,
            po_slack_id = EXCLUDED.po_slack_id,
            ui_eng_slack_id = EXCLUDED.ui_eng_slack_id,
            be_eng_slack_id = EXCLUDED.be_eng_slack_id,
            updated_at = CURRENT_TIMESTAMP
        `, [
          state.sprintIndex,
          state.account,
          state.producer,
          state.po,
          state.uiEng,
          state.beEng
        ]);
        
        await logAudit('current_state', 1, 'UPSERT', 
          oldState.rows.length > 0 ? oldState.rows[0] : null,
          state, changedBy, 'Current state updated');
        
        return true;
      });
    }, 3, 'Update current state');
  }
};

/**
 * Overrides Repository
 */
const OverridesRepository = {
  /**
   * Get all overrides
   */
  async getAll() {
    const result = await query(`
      SELECT id, sprint_index, role, original_slack_id, replacement_slack_id, 
             replacement_name, requested_by, approved, approved_by, approval_timestamp,
             created_at, updated_at
      FROM overrides
      ORDER BY created_at DESC
    `);
    
    return result.rows.map(row => ({
      id: row.id,
      sprintIndex: row.sprint_index,
      role: row.role,
      originalSlackId: row.original_slack_id,
      newSlackId: row.replacement_slack_id,
      newName: row.replacement_name,
      requestedBy: row.requested_by,
      approved: row.approved,
      approvedBy: row.approved_by,
      approvalTimestamp: row.approval_timestamp,
      timestamp: row.created_at
    }));
  },

  /**
   * Add an override request using upsert
   */
  async addOverride(override, changedBy = 'system') {
    return await withRetry(async () => {
      return await transaction(async (client) => {
        const result = await client.query(`
          INSERT INTO overrides (sprint_index, role, original_slack_id, replacement_slack_id, 
                                replacement_name, requested_by, approved)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (sprint_index, role, requested_by, replacement_slack_id)
          DO UPDATE SET 
            replacement_name = EXCLUDED.replacement_name,
            approved = EXCLUDED.approved,
            updated_at = CURRENT_TIMESTAMP
          RETURNING id
        `, [
          override.sprintIndex,
          override.role,
          override.originalSlackId,
          override.newSlackId,
          override.newName,
          override.requestedBy,
          override.approved || false
        ]);
        
        const overrideId = result.rows[0].id;
        
        await logAudit('overrides', overrideId, 'UPSERT', null, override, changedBy, 'Override request created/updated');
        
        return overrideId;
      });
    }, 3, `Add override for sprint ${override.sprintIndex}, role ${override.role}`);
  },

  /**
   * Approve an override
   */
  async approveOverride(sprintIndex, role, requestedBy, replacementSlackId, approvedBy) {
    return await transaction(async (client) => {
      const result = await client.query(`
        UPDATE overrides
        SET approved = true, approved_by = $1, approval_timestamp = CURRENT_TIMESTAMP
        WHERE sprint_index = $2 AND role = $3 AND requested_by = $4 
              AND replacement_slack_id = $5 AND approved = false
        RETURNING id, *
      `, [approvedBy, sprintIndex, role, requestedBy, replacementSlackId]);
      
      if (result.rows.length === 0) {
        return false;
      }
      
      const override = result.rows[0];
      
      await logAudit('overrides', override.id, 'UPDATE', {
        approved: false
      }, {
        approved: true,
        approved_by: approvedBy,
        approval_timestamp: override.approval_timestamp
      }, approvedBy, 'Override approved');
      
      return override;
    });
  },

  /**
   * Decline an override (remove it)
   */
  async declineOverride(sprintIndex, role, requestedBy, replacementSlackId, declinedBy) {
    return await transaction(async (client) => {
      const oldOverride = await client.query(`
        SELECT * FROM overrides
        WHERE sprint_index = $1 AND role = $2 AND requested_by = $3 
              AND replacement_slack_id = $4 AND approved = false
      `, [sprintIndex, role, requestedBy, replacementSlackId]);
      
      if (oldOverride.rows.length === 0) {
        return false;
      }
      
      await client.query(`
        DELETE FROM overrides
        WHERE sprint_index = $1 AND role = $2 AND requested_by = $3 
              AND replacement_slack_id = $4 AND approved = false
      `, [sprintIndex, role, requestedBy, replacementSlackId]);
      
      await logAudit('overrides', oldOverride.rows[0].id, 'DELETE', 
        oldOverride.rows[0], null, declinedBy, 'Override declined');
      
      return true;
    });
  }
};

module.exports = {
  UsersRepository,
  SprintsRepository,
  CurrentStateRepository,
  OverridesRepository,
  logAudit,
  withRetry,
  isRetryableError
};














