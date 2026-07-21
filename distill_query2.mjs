import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('C:/Users/Raven/.local/share/mimocode/mimocode.db', { readOnly: true });

const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);

// Get sessions that are NOT checkpoint-writer (actual user sessions)
const sessions = db.prepare(`
  SELECT id, title, time_created
  FROM session
  WHERE time_created > ?
    AND (directory LIKE '%obsidian-calendar-plugin%' OR project_id IN (
      SELECT id FROM project WHERE worktree LIKE '%obsidian-calendar-plugin%'
    ))
    AND title NOT LIKE '%checkpoint-writer%'
    AND title NOT LIKE '%Auto Dream%'
  ORDER BY time_created DESC
`).all(thirtyDaysAgo);

console.log(`=== REAL USER SESSIONS (last 30 days): ${sessions.length} ===`);
for (const s of sessions) {
  const d = new Date(s.time_created);
  console.log(`  [${s.id}] ${d.toISOString().split('T')[0]} "${s.title || '(no title)'}"`);
}

const sessionIds = sessions.map(s => s.id);
if (sessionIds.length === 0) { db.close(); process.exit(0); }
const placeholders = sessionIds.map(() => '?').join(',');

// Get first user message from each session (what was requested)
console.log('\n=== USER REQUESTS (first user message per session) ===');
const requests = db.prepare(`
  SELECT 
    m.session_id,
    substr(json_extract(m.data, '$.content'), 1, 300) as msg
  FROM message m
  WHERE json_extract(m.data, '$.role') = 'user'
    AND m.session_id IN (${placeholders})
    AND json_extract(m.data, '$.content') IS NOT NULL
    AND length(json_extract(m.data, '$.content')) > 10
  GROUP BY m.session_id
  ORDER BY MIN(m.time_created) ASC
`).all(...sessionIds);

for (const r of requests) {
  console.log(`\n  [${r.session_id}] ${r.msg}`);
}

// Find sequences of identical tool calls across sessions (same read+edit pattern)
console.log('\n\n=== BUILD VERIFICATION PATTERNS ===');
// Look for the specific "build and check" workflow
const buildPattern = db.prepare(`
  SELECT 
    json_extract(json_extract(p.data, '$.state.input'), '$.command') as cmd,
    m.session_id,
    m.time_created
  FROM message m
  JOIN part p ON p.message_id = m.id
  WHERE json_extract(m.data, '$.role') = 'assistant'
    AND json_extract(p.data, '$.tool') = 'bash'
    AND m.session_id IN (${placeholders})
    AND json_extract(json_extract(p.data, '$.state.input'), '$.command') LIKE '%build%'
  ORDER BY m.session_id, m.time_created
`).all(...sessionIds);

// Group by session to see patterns
const bySession = {};
for (const b of buildPattern) {
  if (!bySession[b.session_id]) bySession[b.session_id] = [];
  bySession[b.session_id].push(b.cmd.substring(0, 100));
}

console.log(`Sessions with build commands: ${Object.keys(bySession).length}`);
for (const [sid, cmds] of Object.entries(bySession)) {
  console.log(`  [${sid}] ${cmds.length} build calls: ${cmds.join(' → ')}`);
}

// Look for the "test then build" or "build then test" pattern
console.log('\n=== TEST COMMAND PATTERNS ===');
const testPattern = db.prepare(`
  SELECT 
    json_extract(json_extract(p.data, '$.state.input'), '$.command') as cmd,
    m.session_id
  FROM message m
  JOIN part p ON p.message_id = m.id
  WHERE json_extract(m.data, '$.role') = 'assistant'
    AND json_extract(p.data, '$.tool') = 'bash'
    AND m.session_id IN (${placeholders})
    AND (
      json_extract(json_extract(p.data, '$.state.input'), '$.command') LIKE '%test%'
      OR json_extract(json_extract(p.data, '$.state.input'), '$.command') LIKE '%jest%'
    )
  ORDER BY m.session_id
`).all(...sessionIds);

for (const t of testPattern) {
  console.log(`  [${t.session_id}] ${t.cmd.substring(0, 120)}`);
}

// Find "npm install" patterns
console.log('\n=== NPM INSTALL PATTERNS ===');
const npmInstall = db.prepare(`
  SELECT 
    json_extract(json_extract(p.data, '$.state.input'), '$.command') as cmd,
    m.session_id
  FROM message m
  JOIN part p ON p.message_id = m.id
  WHERE json_extract(m.data, '$.role') = 'assistant'
    AND json_extract(p.data, '$.tool') = 'bash'
    AND m.session_id IN (${placeholders})
    AND json_extract(json_extract(p.data, '$.state.input'), '$.command') LIKE '%install%'
  ORDER BY m.session_id
`).all(...sessionIds);

for (const n of npmInstall) {
  console.log(`  [${n.session_id}] ${n.cmd.substring(0, 150)}`);
}

// Find read → edit sequences on the same file (iterative editing pattern)
console.log('\n=== ITERATIVE EDITING HOTSPOTS ===');
const editSequences = db.prepare(`
  SELECT 
    json_extract(json_extract(p.data, '$.state.input'), '$.file_path') as file_path,
    m.session_id,
    count(*) as edit_count
  FROM message m
  JOIN part p ON p.message_id = m.id
  WHERE json_extract(m.data, '$.role') = 'assistant'
    AND json_extract(p.data, '$.tool') = 'edit'
    AND m.session_id IN (${placeholders})
  GROUP BY m.session_id, file_path
  HAVING edit_count > 5
  ORDER BY edit_count DESC
  LIMIT 20
`).all(...sessionIds);

for (const e of editSequences) {
  const file = e.file_path?.replace(/.*obsidian-calendar-plugin-remastered\\/, '');
  console.log(`  [${e.session_id}] ${e.edit_count}x edits to ${file}`);
}

db.close();
