import { execFileSync } from 'node:child_process';

// Operator-only utility. Wrangler uses the operator's existing Cloudflare login;
// no administrative credential or customer record is exposed through the site.
const [command = 'list', ...args] = process.argv.slice(2);
const database = 'bookvideotoexam-appeals';
const quote = value => `'${value.replaceAll("'", "''")}'`;
const uuid = value => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value || '');
let sql;
if (command === 'list') {
  const [status = 'open', offset = '0'] = args;
  if (!['open', 'resolved', 'dismissed', 'all'].includes(status) || !/^\d{1,6}$/.test(offset)) throw new Error('Usage: npm run appeals:list -- [open|resolved|dismissed|all] [offset]');
  sql = `SELECT id, received_at, subject, question_type, question_id, category, message, expected_answer, context_json, status, operator_note FROM appeals ${status === 'all' ? '' : `WHERE status = ${quote(status)}`} ORDER BY received_at DESC LIMIT 100 OFFSET ${Number(offset)}`;
} else if (command === 'resolve') {
  const [id, status, note = ''] = args;
  if (!uuid(id) || !['open', 'resolved', 'dismissed'].includes(status) || note.length > 3000) throw new Error('Usage: node tools/appeals.mjs resolve <receipt UUID> <open|resolved|dismissed> [operator note]');
  sql = `UPDATE appeals SET status = ${quote(status)}, operator_note = ${quote(note)}, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ${quote(id.toLowerCase())} RETURNING id, status, operator_note`;
} else throw new Error('Supported commands: list, resolve');
const output = execFileSync('npx', ['wrangler', 'd1', 'execute', database, '--remote', '--command', sql, '--json'], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
const records = JSON.parse(output).flatMap(batch => batch.results || []).map(({ context_json, ...record }) => context_json === undefined ? record : { ...record, context: JSON.parse(context_json) });
process.stdout.write(JSON.stringify(records, null, 2) + '\n');
