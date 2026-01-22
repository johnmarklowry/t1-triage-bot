/**
 * db/migrate.js
 * Database migration runner
 */
const fs = require('fs');
const path = require('path');
const { query, transaction } = require('./connection');
const {
  parseMigrationFile,
  validateDependencies,
  reorderStatements,
  getExecutedTables,
  MigrationValidationError,
  MigrationParseError
} = require('./migrationValidator');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

/**
 * Create migrations table if it doesn't exist
 */
async function createMigrationsTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS migrations (
      id SERIAL PRIMARY KEY,
      filename VARCHAR(255) NOT NULL UNIQUE,
      executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      checksum VARCHAR(64)
    )
  `);
}

/**
 * Get list of executed migrations
 */
async function getExecutedMigrations() {
  const result = await query('SELECT filename FROM migrations ORDER BY id');
  return result.rows.map(row => row.filename);
}

/**
 * Get list of migration files
 */
function getMigrationFiles() {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    return [];
  }
  
  return fs.readdirSync(MIGRATIONS_DIR)
    .filter(file => file.endsWith('.sql'))
    .sort();
}

/**
 * Split SQL into individual statements, handling function/trigger bodies with $$ delimiters
 */
function splitSQLStatements(sql) {
  const statements = [];
  let currentStatement = '';
  let insideDollarQuote = false;
  let dollarTag = '';
  let i = 0;

  while (i < sql.length) {
    const char = sql[i];
    const nextChar = sql[i + 1];

    // Check for $$ dollar-quote delimiters
    if (char === '$' && nextChar === '$') {
      const tagStart = i;
      let tagEnd = i + 2;
      
      // Find the closing $$ tag
      while (tagEnd < sql.length) {
        if (sql[tagEnd] === '$' && sql[tagEnd + 1] === '$') {
          tagEnd += 2;
          break;
        }
        tagEnd++;
      }
      
      if (!insideDollarQuote) {
        insideDollarQuote = true;
        dollarTag = sql.substring(tagStart, tagEnd);
      } else {
        insideDollarQuote = false;
        dollarTag = '';
      }
      
      currentStatement += sql.substring(tagStart, tagEnd);
      i = tagEnd;
      continue;
    }

    // If inside dollar-quote, add everything until we find the closing tag
    if (insideDollarQuote) {
      currentStatement += char;
      i++;
      continue;
    }

    // Outside dollar-quotes, split on semicolons
    if (char === ';') {
      currentStatement = currentStatement.trim();
      if (currentStatement.length > 0 && !currentStatement.startsWith('--')) {
        statements.push(currentStatement);
      }
      currentStatement = '';
    } else {
      currentStatement += char;
    }
    
    i++;
  }

  // Add the last statement if it doesn't end with semicolon
  const lastStatement = currentStatement.trim();
  if (lastStatement.length > 0 && !lastStatement.startsWith('--')) {
    statements.push(lastStatement);
  }

  return statements;
}

/**
 * Execute a single migration file
 */
async function executeMigration(filename) {
  const filePath = path.join(MIGRATIONS_DIR, filename);
  const sql = fs.readFileSync(filePath, 'utf8');
  
  console.log(`[MIGRATION] Executing ${filename}...`);
  
  try {
    // Parse migration file to detect dependencies
    const migrationFile = parseMigrationFile(filename, sql);
    
    // Get tables that already exist in the database
    const executedTables = await getExecutedTables();
    
    // Validate dependencies before execution (pass empty array for allMigrationFiles since we're validating single migration)
    const validation = await validateDependencies(migrationFile, executedTables, []);
    
    if (!validation.valid) {
      // Extract first error details for error object
      const firstError = validation.errors[0] || '';
      const missingTableMatch = firstError.match(/Table "([^"]+)"/);
      const dependentTableMatch = firstError.match(/referenced by "([^"]+)"/);
      
      const errorMessage = `Migration dependency error in ${filename}:\n  ${validation.errors.join('\n  ')}`;
      throw new MigrationValidationError(
        errorMessage,
        filename,
        missingTableMatch ? missingTableMatch[1] : null,
        dependentTableMatch ? dependentTableMatch[1] : null,
        null
      );
    }
    
    // Log warnings if any
    if (validation.warnings.length > 0) {
      console.log(`[MIGRATION] Warnings for ${filename}:`);
      validation.warnings.forEach(warning => console.log(`  - ${warning}`));
    }
    
    // Reorder statements to satisfy dependencies
    const reorderedStatements = reorderStatements(migrationFile.statements, migrationFile.dependencies);
    
    // Check if reordering occurred
    const wasReordered = reorderedStatements.some((stmt, idx) => 
      stmt.originalIndex !== idx
    );
    if (wasReordered) {
      console.log(`[MIGRATION] Reordered ${reorderedStatements.length} statements to satisfy dependencies`);
    }
    
    await transaction(async (client) => {
      // Execute reordered statements
      for (const statement of reorderedStatements) {
        if (statement.sql && statement.sql.trim().length > 0) {
          await client.query(statement.sql);
        }
      }
      
      // Record the migration
      const checksum = require('crypto').createHash('md5').update(sql).digest('hex');
      await client.query(
        'INSERT INTO migrations (filename, checksum) VALUES ($1, $2)',
        [filename, checksum]
      );
    });
    
    console.log(`[MIGRATION] Completed ${filename}`);
  } catch (error) {
    if (error instanceof MigrationValidationError || error instanceof MigrationParseError) {
      throw error;
    }
    // Re-throw other errors
    throw error;
  }
}

/**
 * Run all pending migrations
 */
async function runMigrations() {
  try {
    console.log('[MIGRATION] Starting migration process...');
    
    // Create migrations table
    await createMigrationsTable();
    
    // Get executed and available migrations
    const executed = await getExecutedMigrations();
    const available = getMigrationFiles();
    
    console.log(`[MIGRATION] Executed: ${executed.length}, Available: ${available.length}`);
    
    // Find pending migrations
    const pending = available.filter(file => !executed.includes(file));
    
    if (pending.length === 0) {
      console.log('[MIGRATION] No pending migrations');
      return;
    }
    
    // Validate all pending migrations before executing any
    console.log('[MIGRATION] Validating pending migrations...');
    const fs = require('fs');
    const allMigrationFiles = [];
    
    for (const filename of pending) {
      const filePath = path.join(MIGRATIONS_DIR, filename);
      const sql = fs.readFileSync(filePath, 'utf8');
      const migrationFile = parseMigrationFile(filename, sql);
      allMigrationFiles.push(migrationFile);
    }
    
    // Get executed tables for validation
    const executedTables = await getExecutedTables();
    
    // Validate all migrations
    for (const migrationFile of allMigrationFiles) {
      const validation = await validateDependencies(migrationFile, executedTables, allMigrationFiles);
      if (!validation.valid) {
        // Extract first error details for error object
        const firstError = validation.errors[0] || '';
        const missingTableMatch = firstError.match(/Table "([^"]+)"/);
        const dependentTableMatch = firstError.match(/referenced by "([^"]+)"/);
        
        const errorMessage = `Migration dependency error in ${migrationFile.filename}:\n  ${validation.errors.join('\n  ')}`;
        throw new MigrationValidationError(
          errorMessage,
          migrationFile.filename,
          missingTableMatch ? missingTableMatch[1] : null,
          dependentTableMatch ? dependentTableMatch[1] : null,
          null
        );
      }
    }
    
    console.log(`[MIGRATION] Validation passed. Running ${pending.length} pending migrations...`);
    
    // Execute each pending migration
    for (const filename of pending) {
      await executeMigration(filename);
    }
    
    console.log('[MIGRATION] All migrations completed successfully');
    
  } catch (error) {
    console.error('[MIGRATION] Migration failed:', error);
    throw error;
  }
}

/**
 * Get migration status
 */
async function getMigrationStatus() {
  await createMigrationsTable();
  const executed = await getExecutedMigrations();
  const available = getMigrationFiles();
  const pending = available.filter(file => !executed.includes(file));
  
  return {
    executed: executed.length,
    available: available.length,
    pending: pending.length,
    pendingMigrations: pending
  };
}

module.exports = {
  runMigrations,
  getMigrationStatus,
  executeMigration
};
