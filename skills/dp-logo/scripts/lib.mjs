// Shared helpers for the dp-logo scripts: fonts, text to paths, mark loading, rendering, contrast.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import opentype from 'opentype.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const INTER = (w) => join(HERE, 'node_modules/@fontsource/inter/files', `inter-latin-${w}-normal.woff`);

const fontCache = new Map();
/** Loads a font file (TTF, OTF or WOFF). With no path, loads Inter at the given weight. */
export function loadFont(path, weight = 600) {
  const file = path ?? INTER(weight);
  if (!fontCache.has(file)) {
    const buf = readFileSync(file);
    fontCache.set(file, opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)));
  }
  return fontCache.get(file);
}

/** Text as an SVG path, so the output never depends on installed fonts. Returns { d, width }. */
export function textPath(font, text, x, y, size, letterSpacing = 0) {
  // Lays out glyphs one by one with kerning. This skips opentype.js text shaping, which
  // fails on some fonts (for example Inter's ccmp lookups). Fine for names and taglines.
  const scale = size / font.unitsPerEm;
  const glyphs = [...text].map((ch) => font.charToGlyph(ch));
  let cursor = x;
  const parts = [];
  glyphs.forEach((g, i) => {
    parts.push(g.getPath(cursor, y, size).toPathData(2));
    const kern = i < glyphs.length - 1 ? font.getKerningValue(g, glyphs[i + 1]) : 0;
    cursor += (g.advanceWidth + kern) * scale + (i < glyphs.length - 1 ? letterSpacing * size : 0);
  });
  return { d: parts.join(' '), width: cursor - x };
}

/**
 * Reads a mark SVG. The mark must have a square viewBox and use the color tokens
 * FG and ACCENT (for example fill="FG"). Returns { viewBox, inner(colors) }.
 */
export function loadMark(file) {
  const src = readFileSync(file, 'utf8');
  const viewBox = src.match(/viewBox="([^"]+)"/)?.[1];
  if (!viewBox) throw new Error(`${file}: the mark needs a viewBox`);
  const [, , w, h] = viewBox.split(/[\s,]+/).map(Number);
  if (Math.abs(w - h) > 0.01) throw new Error(`${file}: the viewBox must be square, got ${w}x${h}`);
  const body = src.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
  return {
    viewBox,
    usesAccent: body.includes('"ACCENT"'),
    inner: ({ fg, accent }) => body.replaceAll('"FG"', `"${fg}"`).replaceAll('"ACCENT"', `"${accent ?? fg}"`),
    classed: () => body.replaceAll('fill="FG"', 'class="fg"').replaceAll('fill="ACCENT"', 'class="ac"'),
  };
}

/** Places a mark inside a larger SVG at (x, y) with the given size. */
export function nest(mark, colors, x, y, size) {
  return `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="${mark.viewBox}">${mark.inner(colors)}</svg>`;
}

export const svgDoc = (w, h, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;

/** Renders an SVG string to a PNG buffer at the given pixel width. */
export function png(svg, width) {
  return new Resvg(svg, { fitTo: { mode: 'width', value: width }, font: { loadSystemFonts: false } }).render().asPng();
}

/** WCAG 2 contrast ratio between two hex colors. */
export function contrast(a, b) {
  const lum = (hex) => {
    const n = hex.replace('#', '');
    const full = n.length === 3 ? [...n].map((c) => c + c).join('') : n;
    const [r, g, bl] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255)
      .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
  return Math.round(((l1 + 0.05) / (l2 + 0.05)) * 100) / 100;
}

/** Fills in defaults for a direction config. */
export function resolveConfig(cfg, baseDir) {
  const p = cfg.palette;
  if (!p?.fg || !p?.bg) throw new Error('palette.fg and palette.bg are required');
  const dark = { fg: p.bg, bg: p.fg, accent: p.accent, ...(p.dark ?? {}) };
  const icon = {
    tile: p.accent ?? p.fg,
    fg: p.accent ? p.fg : p.bg,
    accent: p.bg,
    ...(cfg.appIcon ?? {}),
  };
  return {
    name: cfg.name,
    label: cfg.label ?? cfg.name,
    tagline: cfg.tagline ?? '',
    markFile: join(baseDir, cfg.mark),
    font: cfg.font ? join(baseDir, cfg.font) : undefined,
    light: { fg: p.fg, bg: p.bg, accent: p.accent ?? p.fg },
    dark: { ...dark, accent: dark.accent ?? dark.fg },
    icon,
    iconScale: cfg.iconScale ?? 0.6,
    themeColor: cfg.themeColor ?? icon.tile,
  };
}

/** Contrast report for the pairs that matter. Graphics need at least 3:1 (WCAG 1.4.11). */
export function contrastReport(c) {
  const usesAccent = loadMark(c.markFile).usesAccent;
  const pairs = [
    ['mark on light background', c.light.fg, c.light.bg],
    ...(usesAccent ? [['accent on light background', c.light.accent, c.light.bg]] : []),
    ['mark on dark background', c.dark.fg, c.dark.bg],
    ...(usesAccent ? [['accent on dark background', c.dark.accent, c.dark.bg]] : []),
    ['app icon mark on tile', c.icon.fg, c.icon.tile],
    ...(usesAccent ? [['app icon accent on tile', c.icon.accent, c.icon.tile]] : []),
  ];
  return pairs.map(([what, a, b]) => {
    const ratio = contrast(a, b);
    return { what, a, b, ratio, ok: ratio >= 3 };
  });
}
