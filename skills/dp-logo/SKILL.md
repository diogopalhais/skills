---
name: dp-logo
description: Design a minimal, modern logo for a project from the shapes.gallery SVG shapes. Suggest color palettes, compare directions on one board, and export every format the project needs, such as SVG masters, favicons, app and PWA icons, Open Graph image, social avatar, and web manifest. Use when I ask for a logo, a mark, an app icon, or a favicon set for a project.
argument-hint: "[project notes: what it is, the feel, colors to keep]"
---

# Project logo

Input: `$ARGUMENTS`, optional notes about the project. Work in the current project folder.

## What makes a good logo

Design sources agree on five principles ([Smashing Magazine](https://www.smashingmagazine.com/2009/08/vital-tips-for-effective-logo-design/), [Adobe](https://blog.adobe.com/en/publish/2018/02/16/logos-learn-separates-great-good), [GOV.UK Design102](https://design102.blog.gov.uk/2023/08/25/what-are-the-top-principles-for-great-logo-design/), [Vistaprint](https://www.vistaprint.com/hub/principles-of-logo-design)):

1. **Simple:** easy to recognize at a glance. Too simple is also a failure, because it becomes forgettable.
2. **Memorable:** one distinctive feature that people remember.
3. **Timeless:** built on what the project is, not on current trends.
4. **Versatile:** works from a 16px favicon to a billboard, and in one color.
5. **Appropriate:** fits what the project does and how it should feel.

For this skill, "minimal and modern" means these rules. Check every direction against them:

- One idea, built from one or two shapes.
- Flat fills only: no gradients, shadows, outlines, 3D, or glass effects.
- One corner language: all round or all sharp.
- Negative space as the distinctive feature, when it can be.
- No text inside the mark. The name goes in the lockup, next to the mark.
- Optical balance over math: round shapes look smaller than square ones of the same size, so check the board by eye.
- It must read at 16px, in one color, on a dark background, and inside a circle crop.

## Palette rules

- Three roles: **fg** (the ink, a near-black or deep color), **bg** (the paper, an off-white), and at most one **accent**. Keep pure `#000` and `#fff` for the one-color versions only.
- Contrast for graphics must be at least 3:1 against its background (WCAG 1.4.11), and text needs 4.5:1. The scripts check this and mark failures.
- Give the dark mode its own values when the inverted colors do not work, especially a lighter accent.
- Base the palette on what the project does and the feel it needs, and say why in one line. If the project already has brand colors, start from them.

## Shapes and their license

The shapes come from [shapes.gallery](https://www.shapes.gallery/), 72 SVG shapes by Monika Michalczyk. The site calls them free to copy, but **it states no license**. So:
- The script downloads them into a local cache (`~/.cache/dp-logo/shapes`), never into the skills repo or the project.
- Always change the shapes: combine two, cut one out of another, rotate, crop, or add an accent. Do not ship a shape unchanged.
- Tell me about the missing license in the final report. For commercial use, suggest asking the author.

## Steps

### 0. Set up the scripts (first use only)

```bash
[ -d "${CLAUDE_SKILL_DIR}/scripts/node_modules" ] || npm ci --prefix "${CLAUDE_SKILL_DIR}/scripts"
```

### 1. Read the project, then confirm the brief

Read the README, `package.json`, the site's CSS tokens or Tailwind theme, and any existing logo or favicon. Then write a short brief:
- **Name**, exactly as it should appear.
- **What it does**, in one sentence.
- **Feel**, in three words (for example calm, precise, warm).
- **Colors to keep**, if any.
- **Tagline** for the Open Graph image, if any.

Ask me only for what you could not find, in one message. Use my notes from `$ARGUMENTS` first.

### 2. Shortlist shapes

```bash
node "${CLAUDE_SKILL_DIR}/scripts/shapes.mjs"
```

It prints the cache folder and a numbered contact sheet. Read the contact sheet image. Pick five or six shapes that connect to the project's name or purpose, and write one line on each connection.

### 3. Build three directions and compare them

Make three directions with **different ideas**, not three versions of one idea. Put the source files in `brand/source/` in the project.

**Mark file** (`brand/source/mark-a.svg`):
- A square `viewBox`, for example `0 0 256 256`, the same as the shapes.
- Fills use the color tokens `fill="FG"` and `fill="ACCENT"` only. No strokes (draw them as filled shapes), no text, no other colors.
- Copy shape paths from the cache files (`shape-<n>.svg`) and change them with `transform`, `fill-rule="evenodd"` cut-outs, or combinations.
- Let the mark reach the edges of the viewBox at its widest point, because the scripts add the padding. Nothing may extend past the viewBox, or it is clipped.

**Direction file** (`brand/source/a.json`):

```json
{
  "name": "Seen",
  "label": "A · Ring and pupil",
  "tagline": "Track what you watch",
  "mark": "mark-a.svg",
  "out": "..",
  "palette": {
    "fg": "#14110F", "bg": "#F4F1EA", "accent": "#E0441A",
    "dark": { "fg": "#F4F1EA", "bg": "#14110F", "accent": "#FF6A3D" }
  },
  "appIcon": { "tile": "#14110F", "fg": "#F4F1EA", "accent": "#E0441A" },
  "iconScale": 0.6
}
```

Only `name`, `mark`, `palette.fg` and `palette.bg` are required. `dark` defaults to the inverted colors. `appIcon` defaults to a tile in the accent color (or fg when there is no accent). `font` takes a TTF, OTF or WOFF path for the name; the default is Inter SemiBold.

Render the board:

```bash
node "${CLAUDE_SKILL_DIR}/scripts/board.mjs" brand/source/board.png brand/source/a.json brand/source/b.json brand/source/c.json
```

Read the board image and check it yourself before you show it to me:
- No mark is clipped at its edges.
- Each mark reads at 16px in both browser tabs.
- No contrast line is red. Fix the colors, not the threshold.
- The three directions look clearly different.

Then show me:
1. **Recommendation first:** which direction and why, in one or two sentences.
2. Each direction: the idea in one line, the shapes used and how they were changed, and the palette with its reason.
3. The board image path.

Wait for my choice.

### 4. Refine

Change only what I ask for. Do not resize, recolor or restyle other parts. After each round, render the board again with the chosen direction only, check it as in step 3, and show it.

### 5. Export

```bash
node "${CLAUDE_SKILL_DIR}/scripts/build.mjs" brand/source/<chosen>.json
```

With `"out": ".."`, the files go to `brand/`:

| File | Size | Use |
|---|---|---|
| `svg/mark.svg`, `svg/mark-dark.svg` | vector | The mark in color, for light and dark backgrounds |
| `svg/mark-black.svg`, `svg/mark-white.svg` | vector | One-color versions for print, stamps and overlays |
| `svg/lockup.svg`, `svg/lockup-dark.svg` | vector | Mark and name side by side |
| `favicon.svg` | vector | Browser tab icon; follows the system light or dark theme |
| `favicon.ico` | 16, 32, 48 | Fallback for older browsers |
| `apple-touch-icon.png` | 180 | iOS home screen (opaque; iOS rounds the corners) |
| `icon-192.png`, `icon-512.png` | 192, 512 | PWA icons |
| `icon-mask.png` | 512 | Android maskable icon; the mark stays inside the safe circle |
| `app-icon-1024.png` | 1024 | App Store master (opaque, square corners) |
| `og-image.png` | 1200×630 | Link previews on social sites and chat apps |
| `social-avatar.png` | 400 | Profile picture; works inside a circle crop |
| `manifest.webmanifest`, `head.html` | text | The web manifest and the `<head>` tags |
| `preview.png`, `report.json` | | The final check board and the contrast results |

Read `preview.png` and `og-image.png` and check them. Then report:
- The answer: "The logo set is in `brand/`," with the file count.
- The `head.html` snippet, and where the files go in this project (for example `public/`). Do not copy the files or edit the site unless I ask.
- The shapes used and the license note.
