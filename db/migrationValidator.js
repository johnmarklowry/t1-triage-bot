/**
 * db/migrationValidator.js
 * Migration dependency validation and statement reordering
 * 
 * This module provides functions to parse SQL migrations, detect table dependencies,
 * validate dependencies, and reorder statements to ensure correct execution order.
 */

const { query } = require('./connection');

/**
 * Custom error class for migration validation failures
 */
class MigrationValidationError extends Error {
  constructor(message, migrationFile, missingTable, dependentTable, statementIndex) {
    super(message);
    this.name = 'MigrationValidationError';
    this.migrationFile = migrationFile;
    this.missingTable = missingTable;
    this.dependentTable = dependentTable;
    this.statementIndex = statementIndex;
  }
}

/**
 * Custom error class for migration parsing failures
 */
class MigrationParseError extends Error {
  constructor(message, migrationFile, line, syntax) {
    super(message);
    this.name = 'MigrationParseError';
    this.migrationFile = migrationFile;
    this.line = line;
    this.syntax = syntax;
  }
}

/**
 * Statement entity structure
 * @typedef {Object} Statement
 * @property {string} sql - The SQL statement text
 * @property {string} type - Type of statement (CREATE_TABLE, ALTER_TABLE, CREATE_INDEX, CREATE_FUNCTION, DO_BLOCK, OTHER)
 * @property {string|null} tableName - Name of the table this statement operates on (if applicable)
 * @property {string[]} dependencies - List of table names this statement depends on (for foreign keys)
 * @property {number} originalIndex - Original position in the migration file (for reordering)
 */

/**
 * TableDependency entity structure
 * @typedef {Object} TableDependency
 * @property {string} dependentTable - Name of the table that has the dependency
 * @property {string} referencedTable - Name of the table being referenced
 * @property {string} dependencyType - Type of dependency (FOREIGN_KEY, INHERITS, OTHER)
 * @property {number} statementIndex - Index of the statement that creates this dependency
 */

/**
 * MigrationFile entity structure
 * @typedef {Object} MigrationFile
 * @property {string} filename - Name of the migration file
 * @property {Statement[]} statements - Parsed SQL statements in original order
 * @property {string[]} tablesCreated - Array of table names being created
 * @property {TableDependency[]} dependencies - Array of table dependencies
 */

/**
 * DependencyGraph entity structure
 * @typedef {Object} DependencyGraph
 * @property {string[]} nodes - All table names (nodes in the graph)
 * @property {TableDependency[]} edges - All dependency relationships (edges in the graph)
 * @property {string[]} executedTables - Tables that already exist in the database
 */

/**
 * ValidationResult structure
 * @typedef {Object} ValidationResult
 * @property {boolean} valid - Whether all dependencies are satisfied
 * @property {string[]} errors - Error messages for missing dependencies (empty if valid)
 * @property {string[]} warnings - Warning messages (e.g., potential issues)
 */

/**
 * Split SQL into individual statements, handling function/trigger bodies with $$ delimiters
 * Reused from migrate.js but kept here for independence
 */
function splitSQLStatements(sql) {
  const statements = [];
  let currentStatement = '';
  let insideDollarQuote = false;
  let dollarTag = '';
  let i = 0;
  let parenDepth = 0; // Track parentheses depth for CHECK constraints, etc.

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

    // Track parentheses depth (for CHECK constraints, function calls, etc.)
    if (char === '(') {
      parenDepth++;
    } else if (char === ')') {
      parenDepth--;
    }

    // Skip comment lines (lines starting with --)
    // Check if we're at the start of a line and the line is a comment
    if ((currentStatement.trim() === '' || currentStatement.endsWith('\n')) && char === '-' && nextChar === '-') {
      // Skip to end of line
      while (i < sql.length && sql[i] !== '\n') {
        i++;
      }
      // Skip the newline character itself
      if (i < sql.length && sql[i] === '\n') {
        i++;
      }
      continue;
    }

    // Outside dollar-quotes, split on semicolons (but only if not inside parentheses)
    if (char === ';' && parenDepth === 0) {
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
 * Detect statement type from SQL text
 */
function detectStatementType(sql) {
  const upperSql = sql.trim().toUpperCase();
  
  if (upperSql.startsWith('CREATE TABLE')) {
    return 'CREATE_TABLE';
  } else if (upperSql.startsWith('ALTER TABLE')) {
    return 'ALTER_TABLE';
  } else if (upperSql.startsWith('CREATE INDEX') || upperSql.startsWith('CREATE UNIQUE INDEX')) {
    return 'CREATE_INDEX';
  } else if (upperSql.startsWith('CREATE FUNCTION') || upperSql.startsWith('CREATE OR REPLACE FUNCTION')) {
    return 'CREATE_FUNCTION';
  } else if (upperSql.startsWith('DO $$') || upperSql.startsWith('DO $')) {
    return 'DO_BLOCK';
  } else {
    return 'OTHER';
  }
}

/**
 * Extract table name from CREATE TABLE statement
 * Handles: CREATE TABLE table_name, CREATE TABLE IF NOT EXISTS table_name
 */
function extractTableName(sql) {
  // Match CREATE TABLE [IF NOT EXISTS] table_name
  const match = sql.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["']?(\w+)["']?/i);
  return match ? match[1] : null;
}

/**
 * Extract referenced table names from REFERENCES clause
 * Handles: REFERENCES table_name(column), REFERENCES "table_name"(column)
 */
function extractReferences(sql) {
  const references = [];
  // Match REFERENCES table_name(column) or REFERENCES "table_name"(column)
  const regex = /REFERENCES\s+["']?(\w+)["']?\s*\(/gi;
  let match;
  while ((match = regex.exec(sql)) !== null) {
    references.push(match[1]);
  }
  return references;
}

/**
 * Extract referenced table from ALTER TABLE ADD CONSTRAINT FOREIGN KEY
 */
function extractAlterTableForeignKey(sql) {
  // Match ALTER TABLE table_name ADD CONSTRAINT ... FOREIGN KEY ... REFERENCES ref_table
  const match = sql.match(/ALTER\s+TABLE\s+["']?(\w+)["']?\s+.*?REFERENCES\s+["']?(\w+)["']?/i);
  if (match) {
    return {
      dependentTable: match[1],
      referencedTable: match[2]
    };
  }
  return null;
}

/**
 * Parse a migration file into structured statement objects
 * @param {string} filename - Name of the migration file
 * @param {string} content - SQL content of the migration file
 * @returns {MigrationFile} Parsed migration file with statements and dependencies
 * @throws {MigrationParseError} If SQL cannot be parsed
 */
function parseMigrationFile(filename, content) {
  try {
    const statements = splitSQLStatements(content);
    const parsedStatements = [];
    const tablesCreated = [];
    const dependencies = [];

    statements.forEach((sql, index) => {
      const type = detectStatementType(sql);
      let tableName = null;
      const statementDependencies = [];

      if (type === 'CREATE_TABLE') {
        tableName = extractTableName(sql);
        if (tableName) {
          tablesCreated.push(tableName);
        }
        
        // Check for inline REFERENCES in CREATE TABLE
        const refs = extractReferences(sql);
        refs.forEach(refTable => {
          dependencies.push({
            dependentTable: tableName,
            referencedTable: refTable,
            dependencyType: 'FOREIGN_KEY',
            statementIndex: index
          });
          statementDependencies.push(refTable);
        });
      } else if (type === 'ALTER_TABLE') {
        // Check for ALTER TABLE ADD CONSTRAINT FOREIGN KEY
        const fkInfo = extractAlterTableForeignKey(sql);
        if (fkInfo) {
          dependencies.push({
            dependentTable: fkInfo.dependentTable,
            referencedTable: fkInfo.referencedTable,
            dependencyType: 'FOREIGN_KEY',
            statementIndex: index
          });
          statementDependencies.push(fkInfo.referencedTable);
          tableName = fkInfo.dependentTable;
        } else {
          // Extract table name from ALTER TABLE statement
          const match = sql.match(/ALTER\s+TABLE\s+["']?(\w+)["']?/i);
          if (match) {
            tableName = match[1];
          }
        }
      } else if (type === 'CREATE_INDEX') {
        // Extract table name from CREATE INDEX ... ON table_name
        const match = sql.match(/ON\s+["']?(\w+)["']?/i);
        if (match) {
          tableName = match[1];
        }
      }

      parsedStatements.push({
        sql,
        type,
        tableName,
        dependencies: statementDependencies,
        originalIndex: index
      });
    });

    return {
      filename,
      statements: parsedStatements,
      tablesCreated,
      dependencies
    };
  } catch (error) {
    throw new MigrationParseError(
      `Failed to parse migration file: ${error.message}`,
      filename,
      null,
      content.substring(0, 100)
    );
  }
}

/**
 * Detect table dependencies from parsed SQL statements
 * @param {Statement[]} statements - Parsed SQL statements
 * @returns {TableDependency[]} Array of table dependencies
 */
function detectDependencies(statements) {
  const dependencies = [];

  statements.forEach((statement, index) => {
    if (statement.dependencies && statement.dependencies.length > 0 && statement.tableName) {
      statement.dependencies.forEach(refTable => {
        dependencies.push({
          dependentTable: statement.tableName,
          referencedTable: refTable,
          dependencyType: 'FOREIGN_KEY',
          statementIndex: index
        });
      });
    }
  });

  return dependencies;
}

/**
 * Get list of tables that exist in the database
 * @returns {Promise<string[]>} Array of table names
 */
async function getExecutedTables() {
  try {
    const result = await query(`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public'
      ORDER BY tablename
    `);
    return result.rows.map(row => row.tablename);
  } catch (error) {
    console.warn('[VALIDATOR] Could not fetch existing tables:', error.message);
    return [];
  }
}

/**
 * Validate that all table dependencies can be satisfied
 * @param {MigrationFile} migrationFile - Parsed migration file
 * @param {string[]} executedTables - Tables that already exist in the database
 * @param {MigrationFile[]} allMigrationFiles - All migration files (for cross-migration validation)
 * @returns {ValidationResult} Validation result with errors if any
 */
async function validateDependencies(migrationFile, executedTables = [], allMigrationFiles = []) {
  const errors = [];
  const warnings = [];
  const tablesInMigration = new Set(migrationFile.tablesCreated);
  
  // Build set of all tables that will be created in all migrations
  const allTablesInMigrations = new Set();
  allMigrationFiles.forEach(mf => {
    mf.tablesCreated.forEach(table => allTablesInMigrations.add(table));
  });

  // Check for circular dependencies within this migration
  const depMap = new Map();
  migrationFile.dependencies.forEach(dep => {
    if (!depMap.has(dep.dependentTable)) {
      depMap.set(dep.dependentTable, []);
    }
    depMap.get(dep.dependentTable).push(dep.referencedTable);
  });
  
  // Detect circular dependencies
  const visited = new Set();
  const visiting = new Set();
  
  function hasCycle(tableName) {
    if (visiting.has(tableName)) {
      return true; // Circular dependency detected
    }
    if (visited.has(tableName)) {
      return false;
    }
    
    visiting.add(tableName);
    const deps = depMap.get(tableName) || [];
    for (const depTable of deps) {
      if (tablesInMigration.has(depTable) && hasCycle(depTable)) {
        return true;
      }
    }
    visiting.delete(tableName);
    visited.add(tableName);
    return false;
  }
  
  tablesInMigration.forEach(table => {
    if (hasCycle(table)) {
      errors.push(`Circular dependency detected involving table "${table}" in migration ${migrationFile.filename}`);
    }
  });

  for (const dep of migrationFile.dependencies) {
    const { dependentTable, referencedTable, statementIndex } = dep;
    
    // Check if referenced table exists in database or will be created in this migration
    const existsInDb = executedTables.includes(referencedTable);
    const createdInMigration = tablesInMigration.has(referencedTable);
    const createdInOtherMigration = allTablesInMigrations.has(referencedTable) && !createdInMigration;
    
    if (!existsInDb && !createdInMigration && !createdInOtherMigration) {
      const errorMsg = 
        `Table "${referencedTable}" referenced by "${dependentTable}" does not exist.\n` +
        `  - Referenced table "${referencedTable}" is not created in this migration (${migrationFile.filename})\n` +
        `  - Referenced table "${referencedTable}" does not exist in database\n` +
        `  - Statement ${statementIndex + 1} in ${migrationFile.filename} references table that doesn't exist\n` +
        `  Suggestion: Create "${referencedTable}" table before "${dependentTable}" or in a previous migration`;
      errors.push(errorMsg);
    } else if (createdInOtherMigration) {
      // Check if referenced table is created in a later migration (forward dependency violation)
      const currentMigrationIndex = allMigrationFiles.findIndex(mf => mf.filename === migrationFile.filename);
      const refMigrationIndex = allMigrationFiles.findIndex(mf => 
        mf.tablesCreated.includes(referencedTable)
      );
      
      if (refMigrationIndex > currentMigrationIndex) {
        const refMigrationFile = allMigrationFiles[refMigrationIndex];
        const errorMsg =
          `Table "${referencedTable}" referenced by "${dependentTable}" is created in a later migration.\n` +
          `  - Referencing table "${dependentTable}" is in migration: ${migrationFile.filename}\n` +
          `  - Referenced table "${referencedTable}" is in migration: ${refMigrationFile.filename}\n` +
          `  - Statement ${statementIndex + 1} in ${migrationFile.filename} references table from future migration\n` +
          `  Forward dependency violation: cannot reference tables from future migrations.\n` +
          `  Suggestion: Move "${referencedTable}" creation to an earlier migration or remove the dependency`;
        errors.push(errorMsg);
      }
    } else if (createdInMigration) {
      // Check if referenced table is created before the dependent table
      const refTableIndex = migrationFile.statements.findIndex(s => 
        s.type === 'CREATE_TABLE' && s.tableName === referencedTable
      );
      const depTableIndex = migrationFile.statements.findIndex(s => 
        s.type === 'CREATE_TABLE' && s.tableName === dependentTable
      );
      
      if (refTableIndex > depTableIndex) {
        // This will be handled by reordering, but we can warn
        warnings.push(
          `Table "${referencedTable}" is created after "${dependentTable}" that references it. ` +
          `Statements will be reordered automatically.`
        );
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Build a complete dependency graph across multiple migration files
 * @param {MigrationFile[]} migrationFiles - All migration files to analyze
 * @param {string[]} executedTables - Tables already in the database
 * @returns {DependencyGraph} Dependency graph covering all migrations
 */
function buildDependencyGraph(migrationFiles, executedTables = []) {
  const nodes = new Set();
  const edges = [];

  // Collect all tables and dependencies from all migrations
  migrationFiles.forEach(migrationFile => {
    migrationFile.tablesCreated.forEach(table => nodes.add(table));
    migrationFile.dependencies.forEach(dep => {
      edges.push(dep);
      nodes.add(dep.dependentTable);
      nodes.add(dep.referencedTable);
    });
  });

  // Add executed tables to nodes
  executedTables.forEach(table => nodes.add(table));

  return {
    nodes: Array.from(nodes),
    edges,
    executedTables
  };
}

/**
 * Reorder SQL statements to satisfy table dependencies
 * @param {Statement[]} statements - Original statements in file order
 * @param {TableDependency[]} dependencies - Dependency relationships
 * @returns {Statement[]} Reordered statements array
 */
function reorderStatements(statements, dependencies) {
  // If no dependencies, return original order
  if (dependencies.length === 0) {
    return statements;
  }

  // Separate table creation statements from other statements
  const tableStatements = [];
  const otherStatements = [];
  
  statements.forEach(stmt => {
    if (stmt.type === 'CREATE_TABLE') {
      tableStatements.push(stmt);
    } else {
      otherStatements.push(stmt);
    }
  });

  // Build dependency map: table -> tables it depends on
  const depMap = new Map();
  dependencies.forEach(dep => {
    if (!depMap.has(dep.dependentTable)) {
      depMap.set(dep.dependentTable, []);
    }
    depMap.get(dep.dependentTable).push(dep.referencedTable);
  });

  // Topological sort for table creation statements
  const orderedTables = [];
  const visited = new Set();
  const visiting = new Set();

  function visit(tableName) {
    if (visiting.has(tableName)) {
      // Circular dependency detected - will be caught by validation
      return;
    }
    if (visited.has(tableName)) {
      return;
    }

    visiting.add(tableName);
    const deps = depMap.get(tableName) || [];
    deps.forEach(depTable => {
      // Only visit if it's a table being created in this migration
      if (tableStatements.some(s => s.tableName === depTable)) {
        visit(depTable);
      }
    });
    visiting.delete(tableName);
    visited.add(tableName);
    orderedTables.push(tableName);
  }

  // Visit all tables
  tableStatements.forEach(stmt => {
    if (stmt.tableName && !visited.has(stmt.tableName)) {
      visit(stmt.tableName);
    }
  });

  // Build reordered statements: tables in dependency order, then other statements
  const reordered = [];
  
  // Add table creation statements in dependency order
  orderedTables.forEach(tableName => {
    const stmt = tableStatements.find(s => s.tableName === tableName);
    if (stmt) {
      reordered.push(stmt);
    }
  });
  
  // Add any table statements not in dependency graph (no dependencies)
  tableStatements.forEach(stmt => {
    if (stmt.tableName && !orderedTables.includes(stmt.tableName)) {
      reordered.push(stmt);
    }
  });

  // Add other statements in original order
  otherStatements.forEach(stmt => {
    reordered.push(stmt);
  });

  return reordered;
}

module.exports = {
  MigrationValidationError,
  MigrationParseError,
  parseMigrationFile,
  detectDependencies,
  validateDependencies,
  reorderStatements,
  getExecutedTables,
  buildDependencyGraph,
};

