# vite.config.ts — CVF (2026-10-14)

SvelteKit 3 (released 2026-10-01) differences hit here:
- No `svelte.config.js`; options go to `sveltekit({...})`.
- `$lib` alias is gone → Node subpath imports: `"imports": { "#lib/*": "./src/lib/*" }` in package.json, imported with explicit `.ts` extensions (also lets `node --experimental-strip-types` load engine modules for profiling).
- tsconfig extends `$app/tsconfig`.
- With `router.type: 'hash'`, page options (`export const ssr`) are a build error; CSR is implied.
- `bundleStrategy: 'inline'` puts all JS/CSS into `build/index.html`; `scripts/artifact.mjs` strips the document shell for claude.ai artifacts (they add their own).
- TypeScript is pinned to 6.x (kit peer range); TS 7 lacks the JS API svelte-check uses.
