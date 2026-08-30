const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const tscPath = require.resolve('typescript/bin/tsc');

fs.rmSync(distDir, { recursive: true, force: true });
fs.mkdirSync(distDir, { recursive: true });

execFileSync(process.execPath, [tscPath, '--project', 'tsconfig.json'], {
  cwd: rootDir,
  stdio: 'inherit',
});

const stylesDir = path.join(distDir, 'styles');
fs.mkdirSync(stylesDir, { recursive: true });
fs.copyFileSync(
  path.join(rootDir, 'src', 'styles', 'warm-paper.css'),
  path.join(stylesDir, 'warm-paper.css'),
);

console.log('✅ a2ui-warm-paper compiled successfully.');
