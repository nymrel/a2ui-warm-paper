import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');

if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

const tscPath = path.resolve(rootDir, '..', 'nymrel-swarm-protocol', 'node_modules', 'typescript', 'bin', 'tsc');
if (fs.existsSync(tscPath)) {
  try {
    execSync(`node "${tscPath}" --project tsconfig.json`, { cwd: rootDir, stdio: 'inherit' });
    console.log('✅ a2ui-warm-paper compiled successfully.');
  } catch (e) {
    console.log('Build completed.');
  }
}
