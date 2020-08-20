import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('C:/Users/Raven/.local/share/mimocode/mimocode.db', { readOnly: true });

// Get project ID for this workspace
const proj = db.prepare("SELECT id, name, worktree FROM project WHERE worktree LIKE '%obsidian-calendar-plugin%'").all();
console.log("=== PROJECTS matching ===");
console.log(JSON.stringify(proj, null, 2));

const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);

// Get recent sessions for this project
const sessions = db.prepare(`
  SELECT id, title, time_created, time_updated, directory
  FROM session
  WHERE time_created > ?
    AND (directory LIKE '%obsidian-calendar-plugin%' OR project_id IN (
      SELECT id FROM project WHERE worktree LIKE '%obsidian-calendar-plugin%'
    ))
  ORDER BY time_created DESC
`).all(thirtyDaysAgo);

console.log(`\n=== RECENT SESSIONS (last 30 days): ${sessions.length} ===`);
for (const s of sessions) {
  console.log(`  [${s.id}] t=${new Date(s.time_created).toISOString().split('T')[0]} "${s.title || '(no title)'}"`);
}

// Get all messages from recent sessions
const sessionIds = sessions.map(s => s.id);
if (sessionIds.length === 0) {
  console.log("\nNo recent sessions found for this project.");
  db.close();
  process.exit(0);
}

// Analyze tool usage patterns across assistant messages
const placeholders = sessionIds.map(() => '?').join(',');

console.log("\n=== TOOL USAGE PATTERNS (assistant turns) ===");
const toolUsage = db.prepare(`
  SELECT 
    json_extract(p.data, '$.tool') as tool,
    substr(json_extract(p.data, '$.state.input'), 1, 150) as input_preview,
    count(*) as n,
    count(DISTINCT m.session_id) as session_count
  FROM message m
  JOIN part p ON p.message_id = m.id
  WHERE json_extract(m.data, '$.role') = 'assistant'
    AND json_extract(p.data, '$.type') = 'tool'
    AND m.session_id IN (${placeholders})
  GROUP BY tool, input_preview
  ORDER BY n DESC
  LIMIT 60
`).all(...sessionIds);

for (const row of toolUsage) {
  console.log(`  [${row.n}x, ${row.session_count} sessions] ${row.tool}: ${row.input_preview}`);
}

// Find repeated edit targets (files being edited frequently)
console.log("\n=== MOST-EDITED FILES ===");
const editedFiles = db.prepare(`
  SELECT 
    json_extract(json_extract(p.data, '$.state.input'), '$.file_path') as file_path,
    count(*) as n,
    count(DISTINCT m.session_id) as session_count
  FROM message m
  JOIN part p ON p.message_id = m.id
  WHERE json_extract(m.data, '$.role') = 'assistant'
    AND json_extract(p.data, '$.tool') = 'edit'
    AND m.session_id IN (${placeholders})
  GROUP BY file_path
  ORDER BY n DESC
  LIMIT 30
`).all(...sessionIds);

for (const row of editedFiles) {
  console.log(`  [${row.n}x, ${row.session_count} sessions] ${row.file_path}`);
}

// Find user keywords indicating repetition
console.log("\n=== USER MESSAGES WITH REPETITION KEYWORDS ===");
const repeatKeywords = db.prepare(`
  SELECT 
    substr(json_extract(m.data, '$.content'), 1, 200) as msg,
    m.time_created,
    m.session_id
  FROM message m
  WHERE json_extract(m.data, '$.role') = 'user'
    AND m.session_id IN (${placeholders})
    AND (
      lower(json_extract(m.data, '$.content')) LIKE '%same as%'
      OR lower(json_extract(m.data, '$.content')) LIKE '%like last time%'
      OR lower(json_extract(m.data, '$.content')) LIKE '%the usual%'
      OR lower(json_extract(m.data, '$.content')) LIKE '%repeat%'
      OR lower(json_extract(m.data, '$.content')) LIKE '%again%'
      OR lower(json_extract(m.data, '$.content')) LIKE '%как%'
      OR lower(json_extract(m.data, '$.content')) LIKE '%снова%'
      OR lower(json_extract(m.data, '$.content')) LIKE '%опять%'
    )
  ORDER BY m.time_created DESC
  LIMIT 30
`).all(...sessionIds);

for (const row of repeatKeywords) {
  console.log(`  [${row.session_id}] ${row.msg}`);
}

// Find repeated command sequences
console.log("\n=== REPEATED COMMAND SEQUENCES (bash commands) ===");
const bashCommands = db.prepare(`
  SELECT 
    json_extract(json_extract(p.data, '$.state.input'), '$.command') as cmd,
    count(*) as n,
    count(DISTINCT m.session_id) as session_count
  FROM message m
  JOIN part p ON p.message_id = m.id
  WHERE json_extract(m.data, '$.role') = 'assistant'
    AND json_extract(p.data, '$.tool') = 'bash'
    AND m.session_id IN (${placeholders})
  GROUP BY cmd
  ORDER BY n DESC
  LIMIT 30
`).all(...sessionIds);

for (const row of bashCommands) {
  console.log(`  [${row.n}x, ${row.session_count} sessions] ${row.cmd}`);
}

// Find repeated grep patterns
console.log("\n=== REPEATED GREP PATTERNS ===");
const grepPatterns = db.prepare(`
  SELECT 
    json_extract(json_extract(p.data, '$.state.input'), '$.pattern') as pattern,
    json_extract(json_extract(p.data, '$.state.input'), '$.include') as include,
    count(*) as n,
    count(DISTINCT m.session_id) as session_count
  FROM message m
  JOIN part p ON p.message_id = m.id
  WHERE json_extract(m.data, '$.role') = 'assistant'
    AND json_extract(p.data, '$.tool') = 'grep'
    AND m.session_id IN (${placeholders})
  GROUP BY pattern, include
  ORDER BY n DESC
  LIMIT 30
`).all(...sessionIds);

for (const row of grepPatterns) {
  console.log(`  [${row.n}x, ${row.session_count} sessions] pattern="${row.pattern}" include="${row.include}"`);
}

// Find repeated glob patterns
console.log("\n=== REPEATED GLOB PATTERNS ===");
const globPatterns = db.prepare(`
  SELECT 
    json_extract(json_extract(p.data, '$.state.input'), '$.pattern') as pattern,
    count(*) as n,
    count(DISTINCT m.session_id) as session_count
  FROM message m
  JOIN part p ON p.message_id = m.id
  WHERE json_extract(m.data, '$.role') = 'assistant'
    AND json_extract(p.data, '$.tool') = 'glob'
    AND m.session_id IN (${placeholders})
  GROUP BY pattern
  ORDER BY n DESC
  LIMIT 30
`).all(...sessionIds);

for (const row of globPatterns) {
  console.log(`  [${row.n}x, ${row.session_count} sessions] ${row.pattern}`);
}

db.close();
