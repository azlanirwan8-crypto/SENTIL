import { cpSync, mkdirSync } from 'node:fs';
import { build } from 'esbuild';

// Semua yang boleh disajikan publik masuk ke public/. Vercel menyajikan isi output directory
// apa adanya, jadi sumber server (lib/, api/, server.mjs) sengaja tidak ikut ke sana.
mkdirSync('public', { recursive: true });

await build({
  entryPoints: ['src/main.jsx'],
  bundle: true,
  minify: true,
  format: 'iife',
  target: ['chrome100', 'firefox100', 'safari15'],
  outfile: 'public/app.js',
  jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"' },
  legalComments: 'none',
  charset: 'utf8',
  logLevel: 'info',
});

cpSync('index.html', 'public/index.html');
cpSync('assets', 'public/assets', { recursive: true });
