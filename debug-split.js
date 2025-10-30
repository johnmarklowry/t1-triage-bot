const fs = require('fs');

// Same function from migrate.js
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

const sql = fs.readFileSync('db/migrations/001_initial_schema.sql', 'utf8');
const statements = splitSQLStatements(sql);

console.log(`Split into ${statements.length} statements\n`);
statements.forEach((s, i) => {
  const preview = s.substring(0, 80).replace(/\n/g, ' ');
  console.log(`Statement ${i + 1}: ${preview}...`);
});
