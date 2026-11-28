// Renders a comparison board: one column per direction, each showing the mark large on light
// and dark, in one color, as an app icon, a maskable icon, an avatar, a favicon at real 32 and
// 16 pixel sizes in light and dark browser tabs, and the palette with contrast ratios.
//
//   node board.mjs <out.png> <direction-a.json> [direction-b.json ...]
import { readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { contrastReport, loadFont, loadMark, nest, png, resolveConfig, svgDoc, textPath } from './lib.mjs';

export const COL_W = 380;
const GRAY = '#8a8a8a';

const text = (font, s, x, y, size, fill) => {
  const t = textPath(font, s, x, y, size);
  return { svg: `<path d="${t.d}" fill="${fill}"/>`, width: t.width };
};

/** One direction as a column of SVG elements, starting at (x, 0). Returns { svg, height }. */
export function column(c, x) {
  const mark = loadMark(c.markFile);
  const bold = loadFont(undefined, 600), reg = loadFont(undefined, 400);
  const W = COL_W - 40, X = x + 20;
  let y = 20, s = '';

  s += text(bold, c.label, X, y + 18, 20, '#111').svg; y += 40;

  // Large mark on light and on dark.
  const half = (W - 12) / 2;
  s += `<rect x="${X}" y="${y}" width="${half}" height="${half}" fill="${c.light.bg}"/>`;
  s += nest(mark, c.light, X + half * 0.2, y + half * 0.2, half * 0.6);
  s += `<rect x="${X + half + 12}" y="${y}" width="${half}" height="${half}" fill="${c.dark.bg}"/>`;
  s += nest(mark, c.dark, X + half + 12 + half * 0.2, y + half * 0.2, half * 0.6);
  y += half + 12;

  // One color: black on white, white on black.
  const q = (W - 36) / 4;
  const mono = [['#000', '#fff'], ['#fff', '#000']];
  mono.forEach(([fg, bg], i) => {
    const bx = X + i * (q + 12);
    s += `<rect x="${bx}" y="${y}" width="${q}" height="${q}" fill="${bg}" stroke="#e5e5e5"/>`;
    s += nest(mark, { fg, accent: fg }, bx + q * 0.2, y + q * 0.2, q * 0.6);
  });
  // App icon (rounded corners like iOS) and maskable (circle crop).
  const ax = X + 2 * (q + 12), id = `m${Math.round(x)}`;
  s += `<rect x="${ax}" y="${y}" width="${q}" height="${q}" rx="${q * 0.2237}" fill="${c.icon.tile}"/>`;
  s += nest(mark, c.icon, ax + q * (1 - c.iconScale) / 2, y + q * (1 - c.iconScale) / 2, q * c.iconScale);
  const mx = X + 3 * (q + 12);
  s += `<clipPath id="${id}"><circle cx="${mx + q / 2}" cy="${y + q / 2}" r="${q / 2}"/></clipPath>`;
  s += `<g clip-path="url(#${id})"><rect x="${mx}" y="${y}" width="${q}" height="${q}" fill="${c.icon.tile}"/>`;
  s += nest(mark, c.icon, mx + q * 0.25, y + q * 0.25, q * 0.5) + '</g>';
  y += q + 6;
  ['one color', 'one color', 'app icon', 'maskable'].forEach((l, i) => {
    s += text(reg, l, X + i * (q + 12), y + 12, 11, GRAY).svg;
  });
  y += 30;

  // Browser tabs with the favicon at real size.
  for (const [mode, tabBg, txt] of [['light', '#f1f1f1', '#222'], ['dark', '#2b2b2b', '#eee']]) {
    const colors = mode === 'light' ? c.light : c.dark;
    s += `<rect x="${X}" y="${y}" width="${W}" height="36" rx="8" fill="${tabBg}"/>`;
    s += nest(mark, colors, X + 12, y + 10, 16);
    s += text(reg, c.name, X + 38, y + 23, 13, txt).svg;
    s += nest(mark, colors, X + W - 44, y + 2, 32);
    s += text(reg, '16px and 32px', X + W - 150, y + 23, 11, GRAY).svg;
    y += 44;
  }
  y += 6;

  // Palette with contrast ratios.
  const sw = [['fg', c.light.fg], ['bg', c.light.bg], ['accent', c.light.accent], ['tile', c.icon.tile]];
  const seen = new Set();
  let sx = X;
  for (const [name, hex] of sw) {
    if (seen.has(hex.toLowerCase())) continue;
    seen.add(hex.toLowerCase());
    s += `<rect x="${sx}" y="${y}" width="28" height="28" rx="6" fill="${hex}" stroke="#e5e5e5"/>`;
    s += text(reg, `${name} ${hex}`, sx + 34, y + 18, 11, '#333').svg;
    sx += 34 + textPath(reg, `${name} ${hex}`, 0, 0, 11).width + 14;
  }
  y += 40;
  for (const r of contrastReport(c)) {
    s += text(reg, `${r.ok ? 'pass' : 'low'}  ${r.what}: ${r.ratio}:1`, X, y + 12, 11, r.ok ? '#3a3a3a' : '#c62828').svg;
    y += 17;
  }
  return { svg: s, height: y + 16 };
}

export function board(configs) {
  const cols = configs.map((c, i) => column(c, i * COL_W));
  const h = Math.max(...cols.map((c) => c.height));
  const w = configs.length * COL_W;
  let body = `<rect width="${w}" height="${h}" fill="#ffffff"/>`;
  for (let i = 1; i < configs.length; i++) body += `<rect x="${i * COL_W}" y="0" width="1" height="${h}" fill="#ececec"/>`;
  body += cols.map((c) => c.svg).join('');
  return { svg: svgDoc(w, h, body), width: w };
}

// Compare real paths, because the skill usually runs through a symlink in ~/.claude/skills.
if (process.argv[1] && pathToFileURL(realpathSync(process.argv[1])).href === import.meta.url) {
  const [out, ...files] = process.argv.slice(2);
  if (!out || files.length === 0) {
    console.error('usage: node board.mjs <out.png> <direction.json> [...]');
    process.exit(2);
  }
  const configs = files.map((f) => resolveConfig(JSON.parse(readFileSync(f, 'utf8')), dirname(resolve(f))));
  const { svg, width } = board(configs);
  writeFileSync(out, png(svg, width * 2));
  console.log(JSON.stringify({ board: resolve(out), directions: configs.map((c) => c.label) }, null, 2));
}
