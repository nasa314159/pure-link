import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const katexSource = resolve(projectRoot, 'node_modules/katex/dist');
const katexDestination = resolve(projectRoot, 'public/assets/katex');
const assetsRoot = resolve(projectRoot, 'public/assets');

await mkdir(katexDestination, { recursive: true });
const katexCss = await readFile(resolve(katexSource, 'katex.min.css'), 'utf8');
await writeFile(
  resolve(katexDestination, 'katex.min.css'),
  katexCss.replaceAll('url(fonts/', 'url(/assets/katex/fonts/'),
);
await cp(resolve(katexSource, 'fonts'), resolve(katexDestination, 'fonts'), { recursive: true });

await build({
  entryPoints: {
    'content-actions': resolve(projectRoot, 'client/content-actions.js'),
    'formula-editor': resolve(projectRoot, 'client/formula-editor.js'),
  },
  outdir: assetsRoot,
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: ['es2022'],
  minify: true,
  legalComments: 'none',
});
