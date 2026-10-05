import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { transformSync } from 'esbuild';
import { gzipSync } from 'node:zlib';

// Keep Wrangler's generated routing and ASSETS fallback. A second parser-backed
// transform changes character encoding without changing string values, regexes,
// literal backslash-u sequences or any source data. Deploy with --no-bundle so
// Wrangler does not turn the Korean text back into six-byte ASCII escapes.
const directory = mkdtempSync(join(tmpdir(), 'book-to-exam-functions-'));
try {
  execFileSync('npx', ['wrangler', 'pages', 'functions', 'build', '--outdir', directory,
    '--minify', '--output-routes-path', resolve('dist/_routes.json')], { stdio: 'inherit' });
  if (readdirSync(directory).some(name => name !== 'index.js')) {
    throw new Error('The Functions build contains additional modules; package them before deploying.');
  }
  const source = readFileSync(join(directory, 'index.js'), 'utf8');
  const { code } = transformSync(source, { loader: 'js', format: 'esm', charset: 'utf8', minify: true, keepNames: true });
  const bytes = Buffer.byteLength(code);
  if (bytes >= 25 * 1024 * 1024) throw new Error(`Pages Functions bundle exceeds 25 MiB: ${bytes} bytes`);
  writeFileSync('dist/_worker.js', code);
  console.log(`Pages Functions: ${bytes.toLocaleString()} bytes, gzip ${gzipSync(code).length.toLocaleString()} bytes; UTF-8, no data removed.`);
} finally {
  rmSync(directory, { recursive: true, force: true });
}
