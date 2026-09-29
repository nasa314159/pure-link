import { defineConfig } from 'vitest/config';
import { readFileSync } from 'node:fs';

// Wrangler compiles *.wasm imports with its default CompiledWasm rule, which the
// Node test environment cannot parse. The formula OG image rasterizer imports
// that module in src/index.js; this stub swaps in the same compiled module so
// the identical code paths run under `npm test`.
const resvgWasmPlugin = {
  name: 'purelink-test-resvg-wasm',
  enforce: 'pre',
  resolveId(id) {
    return /index_bg\.wasm$/.test(id) ? '\0purelink-resvg-wasm' : null;
  },
  load(id) {
    if (id !== '\0purelink-resvg-wasm') return null;
    const base64 = readFileSync(new URL('./node_modules/@resvg/resvg-wasm/index_bg.wasm', import.meta.url)).toString('base64');
    return `const BYTES = Uint8Array.from(atob(${JSON.stringify(base64)}), (c) => c.charCodeAt(0));\nexport default new WebAssembly.Module(BYTES);`;
  },
};

export default defineConfig({
  plugins: [resvgWasmPlugin],
  test: {
    environment: 'node',
    include: ['test/**/*.spec.js'],
    reporters: ['default'],
  },
});
