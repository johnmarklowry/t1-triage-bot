/**
 * db/repository.js
 * Data access layer using repository pattern
 */
const { query, transaction } = require('./connection');

/**
 * Audit logging helper
 */
async function logAudit(tableName, recordId, operation, oldValues, newValues, changedBy, reason) {
  try {
    await query(`
      INSERT INTO audit_logs (table_name, record_id, operation, old_values, new_values, changed_by, reason)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [tableName, recordId, operation, oldValues, newValues, changedBy, reason]);
  } catch (error) {
    console.error('[AUDIT] Failed to log audit:', error);
    // Don't throw - audit failures shouldn't break the main operation
  }
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
   * Add a user to a discipline
   */
  async addUser(slackId, name, discipline, changedBy = 'system') {
    return await transaction(async (client) => {
      const result = await client.query(`
        INSERT INTO users (slack_id, name, discipline)
        VALUES ($1, $2, $3)
        RETURNING id
      `, [slackId, name, discipline]);
      
      const userId = result.rows[0].id;
      
      await logAudit('users', userId, 'INSERT', null, {
        slack_id: slackId,
        name: name,
        discipline: discipline
      }, changedBy, 'User added to discipline');
      
      return userId;
    });
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
   * Add a sprint
   */
  async addSprint(sprintName, startDate, endDate, sprintIndex, changedBy = 'system') {
    return await transaction(async (client) => {
      const result = await client.query(`
        INSERT INTO sprints (sprint_name, start_date, end_date, sprint_index)
        VALUES ($1, $2, $3, $4)
        RETURNING id
      `, [sprintName, startDate, endDate, sprintIndex]);
      
      const sprintId = result.rows[0].id;
      
      await logAudit('sprints', sprintId, 'INSERT', null, {
        sprint_name: sprintName,
        start_date: startDate,
        end_date: endDate,
        sprint_index: sprintIndex
      }, changedBy, 'Sprint added');
      
      return sprintId;
    });
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
   * Update current state
   */
  async update(state, changedBy = 'system') {
    return await transaction(async (client) => {
      // Get old state for audit
      const oldState = await client.query(`
        SELECT * FROM current_state WHERE id = 1
      `);
      
      await client.query(`
        UPDATE current_state
        SET sprint_index = $1, account_slack_id = $2, producer_slack_id = $3, 
            po_slack_id = $4, ui_eng_slack_id = $5, be_eng_slack_id = $6
        WHERE id = 1
      `, [
        state.sprintIndex,
        state.account,
        state.producer,
        state.po,
        state.uiEng,
        state.beEng
      ]);
      
      await logAudit('current_state', 1, 'UPDATE', 
        oldState.rows.length > 0 ? oldState.rows[0] : null,
        state, changedBy, 'Current state updated');
      
      return true;
    });
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
   * Add an override request
   */
  async addOverride(override, changedBy = 'system') {
    return await transaction(async (client) => {
      const result = await client.query(`
        INSERT INTO overrides (sprint_index, role, original_slack_id, replacement_slack_id, 
                              replacement_name, requested_by, approved)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
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
      
      await logAudit('overrides', overrideId, 'INSERT', null, override, changedBy, 'Override request created');
      
      return overrideId;
    });
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
  logAudit
};
