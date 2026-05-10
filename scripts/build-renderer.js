const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const distDir = path.join(root, 'dist');

async function main() {
  fs.mkdirSync(distDir, { recursive: true });

  const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8')
    .replace('./index.jsx', './index.js');
  fs.writeFileSync(path.join(distDir, 'index.html'), html);

  await esbuild.build({
    entryPoints: [path.join(root, 'public', 'index.jsx')],
    bundle: true,
    outfile: path.join(distDir, 'index.js'),
    platform: 'browser',
    format: 'iife',
    loader: { '.jsx': 'tsx' },
    sourcemap: true
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
