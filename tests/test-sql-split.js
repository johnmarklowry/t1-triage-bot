const fs = require('fs');
const path = require('path');

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

// Test with migration 001
const filePath = path.join(__dirname, 'db/migrations/001_initial_schema.sql');
const sql = fs.readFileSync(filePath, 'utf8');
const statements = splitSQLStatements(sql);

console.log(`Found ${statements.length} SQL statements`);
console.log('\nFirst 3 statements:');
statements.slice(0, 3).forEach((stmt, i) => {
  console.log(`\n--- Statement ${i + 1} (${stmt.length} chars) ---`);
  console.log(stmt.substring(0, 100) + '...');
});
