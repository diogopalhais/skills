// Builds the full export set for one chosen direction.
//
//   node build.mjs <direction.json> [--out <folder>]
//
// Writes SVG masters (mark, one-color, dark, lockups), favicons, app and PWA icons,
// the Open Graph image, a social avatar, the web manifest, an HTML head snippet,
// a preview board, and report.json with contrast results.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import pngToIco from 'png-to-ico';
import { board } from './board.mjs';
import { contrastReport, loadFont, loadMark, nest, png, resolveConfig, svgDoc, textPath } from './lib.mjs';

const args = process.argv.slice(2);
const cfgFile = args.find((a) => a.endsWith('.json'));
if (!cfgFile) {
  console.error('usage: node build.mjs <direction.json> [--out <folder>]');
  process.exit(2);
}
const raw = JSON.parse(readFileSync(cfgFile, 'utf8'));
const baseDir = dirname(resolve(cfgFile));
const c = resolveConfig(raw, baseDir);
const outIdx = args.indexOf('--out');
const OUT = resolve(outIdx >= 0 ? args[outIdx + 1] : join(baseDir, raw.out ?? 'brand'));
mkdirSync(join(OUT, 'svg'), { recursive: true });

const mark = loadMark(c.markFile);
const nameFont = loadFont(c.font, 600);
const tagFont = loadFont(undefined, 400);
const files = [];
const write = (name, data) => {
  writeFileSync(join(OUT, name), data);
  files.push(name);
};

// --- SVG masters ---------------------------------------------------------------
const markSvg = (colors, bg) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${mark.viewBox}">${bg ? `<rect width="100%" height="100%" fill="${bg}"/>` : ''}${mark.inner(colors)}</svg>`;
write('svg/mark.svg', markSvg(c.light));
write('svg/mark-dark.svg', markSvg(c.dark));
write('svg/mark-black.svg', markSvg({ fg: '#000000', accent: '#000000' }));
write('svg/mark-white.svg', markSvg({ fg: '#ffffff', accent: '#ffffff' }));

// Horizontal lockup: mark plus the name as paths, so it never depends on installed fonts.
const lockup = (colors) => {
  const H = 200, size = 120;
  const capH = (nameFont.tables.os2?.sCapHeight ?? nameFont.unitsPerEm * 0.72) / nameFont.unitsPerEm;
  const t = textPath(nameFont, c.name, 0, 0, size, -0.01);
  const gap = H * 0.32;
  const baseline = H / 2 + (capH * size) / 2;
  const w = Math.ceil(H + gap + t.width + 4);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${H}">${nest(mark, colors, 0, 0, H)}<path transform="translate(${H + gap} ${baseline})" d="${t.d}" fill="${colors.fg}"/></svg>`;
};
write('svg/lockup.svg', lockup(c.light));
write('svg/lockup-dark.svg', lockup(c.dark));

// --- Favicons ------------------------------------------------------------------
// favicon.svg follows the system theme through a media query.
write('favicon.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${mark.viewBox}"><style>.fg{fill:${c.light.fg}}.ac{fill:${c.light.accent}}@media (prefers-color-scheme:dark){.fg{fill:${c.dark.fg}}.ac{fill:${c.dark.accent}}}</style>${mark.classed()}</svg>`);

// Tile: a full-bleed square in the tile color with the mark centered at the given scale.
const tile = (px, scale, radius = 0) => {
  const m = px * scale;
  return svgDoc(px, px, `<rect width="${px}" height="${px}" rx="${radius * px}" fill="${c.icon.tile}"/>${nest(mark, c.icon, (px - m) / 2, (px - m) / 2, m)}`);
};
// favicon.ico cannot follow the theme, so it uses the rounded tile, which shows on light and dark tabs.
const icoPngs = [16, 32, 48].map((px) => png(tile(px, Math.min(c.iconScale + 0.1, 0.75), 0.22), px));
write('favicon.ico', await pngToIco(icoPngs));

// --- App and PWA icons -----------------------------------------------------------
write('apple-touch-icon.png', png(tile(180, c.iconScale), 180)); // opaque; iOS rounds the corners
write('icon-192.png', png(tile(192, c.iconScale), 192));
write('icon-512.png', png(tile(512, c.iconScale), 512));
write('icon-mask.png', png(tile(512, Math.min(c.iconScale, 0.5)), 512)); // inside the 80% safe circle
write('app-icon-1024.png', png(tile(1024, c.iconScale), 1024)); // App Store: opaque, square corners
write('social-avatar.png', png(tile(400, Math.min(c.iconScale, 0.5)), 400)); // survives a circle crop

// --- Open Graph image (1200x630) -------------------------------------------------
{
  const W = 1200, H = 630, M = 96, size = 168;
  let nameSize = 88;
  let t = textPath(nameFont, c.name, 0, 0, nameSize, -0.015);
  const maxW = W - M * 2 - size - 64;
  if (t.width > maxW) {
    nameSize = Math.floor((nameSize * maxW) / t.width);
    t = textPath(nameFont, c.name, 0, 0, nameSize, -0.015);
  }
  const tag = c.tagline ? textPath(tagFont, c.tagline, 0, 0, 32) : null;
  const block = nameSize * 0.72 + (tag ? 28 + 32 * 0.72 : 0);
  const top = (H - block) / 2;
  const tx = M + size + 64;
  let body = `<rect width="${W}" height="${H}" fill="${c.light.bg}"/>`;
  body += nest(mark, c.light, M, (H - size) / 2, size);
  body += `<path transform="translate(${tx} ${top + nameSize * 0.72})" d="${t.d}" fill="${c.light.fg}"/>`;
  if (tag) body += `<path transform="translate(${tx} ${top + nameSize * 0.72 + 28 + 32 * 0.72})" d="${tag.d}" fill="${c.light.fg}" fill-opacity="0.62"/>`;
  write('og-image.png', png(svgDoc(W, H, body), W));
}

// --- Manifest and HTML head snippet ----------------------------------------------
write('manifest.webmanifest', JSON.stringify({
  name: c.name,
  short_name: c.name,
  icons: [
    { src: '/icon-192.png', type: 'image/png', sizes: '192x192' },
    { src: '/icon-512.png', type: 'image/png', sizes: '512x512' },
    { src: '/icon-mask.png', type: 'image/png', sizes: '512x512', purpose: 'maskable' },
  ],
  theme_color: c.themeColor,
  background_color: c.light.bg,
  display: 'standalone',
}, null, 2));
write('head.html', [
  '<link rel="icon" href="/favicon.ico" sizes="32x32">',
  '<link rel="icon" href="/favicon.svg" type="image/svg+xml">',
  '<link rel="apple-touch-icon" href="/apple-touch-icon.png">',
  '<link rel="manifest" href="/manifest.webmanifest">',
  `<meta name="theme-color" content="${c.themeColor}">`,
  '<meta property="og:image" content="https://<your-domain>/og-image.png">',
  '<meta property="og:image:width" content="1200">',
  '<meta property="og:image:height" content="630">',
  '<meta name="twitter:card" content="summary_large_image">',
].join('\n') + '\n');

// --- Preview board and report ----------------------------------------------------
{
  const b = board([c]);
  write('preview.png', png(b.svg, b.width * 2));
}
const report = { name: c.name, out: OUT, contrast: contrastReport(c), files };
write('report.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify({ out: OUT, files: files.length, contrastFailures: report.contrast.filter((r) => !r.ok) }, null, 2));
