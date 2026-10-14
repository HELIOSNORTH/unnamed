import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const html = readFileSync('build/index.html', 'utf8');
const title = html.match(/<title>[\s\S]*?<\/title>/)?.[0] ?? '<title>Quiet Signals</title>';
const head = html.slice(html.indexOf('<head>'), html.indexOf('</head>'));
const styles = [...head.matchAll(/<style[\s\S]*?<\/style>/g)].map((m) => m[0]).join('\n');
const body = html.slice(html.indexOf('>', html.indexOf('<body')) + 1, html.lastIndexOf('</body>'));

mkdirSync('dist', { recursive: true });
writeFileSync('dist/quiet-signals.html', `${title}\n${styles}\n${body.trim()}\n`);
console.log('dist/quiet-signals.html', (Buffer.byteLength(styles + body) / 1024).toFixed(0), 'KiB');
