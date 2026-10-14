# artifact.mjs — CVF (2026-10-14)

claude.ai artifacts wrap the page in their own `<!doctype><html><head><body>`, so this keeps only `<title>`, the inline `<style>`s and the body markup (which carries the inline SvelteKit boot script). Hash router means the artifact's URL path does not matter; a hash on the artifact link would route to the 404 page.
