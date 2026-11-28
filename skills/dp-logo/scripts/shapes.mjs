// Downloads the shapes.gallery SVG set into a local cache (not into the skills repo, because
// the site states no license), normalizes each shape, and renders a numbered contact sheet.
//
//   node shapes.mjs            -> prints the cache folder and the contact sheet path
//   node shapes.mjs --refresh  -> downloads the set again
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadFont, png, svgDoc, textPath } from './lib.mjs';

const ZIP_URL = 'https://framerusercontent.com/assets/4sPcycMSQHlrtNTStxvoTt4Xd7g.zip';
const CACHE = join(process.env.XDG_CACHE_HOME ?? join(homedir(), '.cache'), 'dp-logo', 'shapes');
const refresh = process.argv.includes('--refresh');

if (refresh) rmSync(CACHE, { recursive: true, force: true });
if (!existsSync(join(CACHE, 'index.json'))) {
  mkdirSync(CACHE, { recursive: true });
  const work = join(tmpdir(), `dp-logo-zip-${process.pid}`);
  mkdirSync(work, { recursive: true });
  const zip = join(work, 'shapes.zip');
  const res = await fetch(ZIP_URL);
  if (!res.ok) throw new Error(`download failed: HTTP ${res.status}. Check ${ZIP_URL} on https://www.shapes.gallery/`);
  writeFileSync(zip, Buffer.from(await res.arrayBuffer()));
  execFileSync('unzip', ['-q', '-o', zip, '-d', join(work, 'x')]);

  const index = [];
  for (const f of readdirSync(join(work, 'x')).filter((n) => /^Shape \d+\.svg$/.test(n))) {
    const id = Number(f.match(/\d+/)[0]);
    const src = readFileSync(join(work, 'x', f), 'utf8');
    const w = Number(src.match(/width="([\d.]+)"/)?.[1] ?? 256);
    const h = Number(src.match(/height="([\d.]+)"/)?.[1] ?? 256);
    // Keep only the drawing elements; set every fill to the FG token so the shape is ready to use in a mark.
    const body = src
      .replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '')
      .replace(/fill="(?!none)[^"]*"/g, 'fill="FG"');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">${body}</svg>`;
    writeFileSync(join(CACHE, `shape-${id}.svg`), svg);
    index.push({ id, file: `shape-${id}.svg`, viewBox: `0 0 ${w} ${h}` });
  }
  index.sort((a, b) => a.id - b.id);
  writeFileSync(join(CACHE, 'index.json'), JSON.stringify(index, null, 2));
  rmSync(work, { recursive: true, force: true });
}

const index = JSON.parse(readFileSync(join(CACHE, 'index.json'), 'utf8'));
const sheet = join(CACHE, 'contact-sheet.png');
if (!existsSync(sheet) || refresh) {
  const font = loadFont(undefined, 600);
  const cols = 12, cell = 120, pad = 18, size = cell - pad * 2 - 14;
  const rows = Math.ceil(index.length / cols);
  let body = `<rect width="100%" height="100%" fill="#ffffff"/>`;
  index.forEach((s, i) => {
    const x = (i % cols) * cell, y = Math.floor(i / cols) * cell;
    const inner = readFileSync(join(CACHE, s.file), 'utf8')
      .replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').replaceAll('"FG"', '"#1a1a1a"');
    body += `<svg x="${x + pad + 7}" y="${y + pad - 4}" width="${size}" height="${size}" viewBox="${s.viewBox}">${inner}</svg>`;
    const t = textPath(font, String(s.id), 0, 0, 13);
    body += `<path transform="translate(${x + cell / 2 - t.width / 2} ${y + cell - 12})" d="${t.d}" fill="#8a8a8a"/>`;
  });
  writeFileSync(sheet, png(svgDoc(cols * cell, rows * cell, body), cols * cell));
}

console.log(JSON.stringify({ cache: CACHE, count: index.length, contactSheet: sheet }, null, 2));
