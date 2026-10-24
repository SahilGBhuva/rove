# Rove design system v2

Forest green on warm ivory. Calm, legible, and built for riders who are blind or have low vision first.
All tokens live in `site/css/rg-tokens.css` (spacing, radius, type, elevation, accents, layout, motion) and
at the end of `site/styles.css` (the `--rg-*` colour tokens). Existing names (`--rg-radius`, `--rg-gutter`,
`--rg-tint`, `--m-*`, `--e-*`) keep working; new work should use the v2 tokens below.

## Colour

| Token | Light | Dark | Use |
|---|---|---|---|
| `--rg-bg` | #f6f3ec | #0f1411 | page and panel background |
| `--rg-surface` | #fffdf8 | #171d19 | cards, fields, grouped lists |
| `--rg-ink` | #17201a | #eef0ea | primary text (15.1:1 / 16.2:1 on bg) |
| `--rg-ink-2` | #4a524b | #b4bcb3 | secondary text (7.3:1 on bg, 6.5:1 on mint / 8.8:1 on dark surface) |
| `--rg-line` | #e1dccf | #2b342e | hairlines, borders |
| `--rg-green` | #1f5a3d | #86d3a3 | primary actions, accents |
| `--rg-on-green` | #ffffff | #0b1f13 | text on green |
| `--rg-mint` (new) | #dcebdf | #203528 | accent surface: segmented tracks, quiet buttons, icon tiles. Text on it uses `--rg-green` (6.6:1 / 7.4:1) or `--rg-ink` |
| `--rg-mint-line` (new) | #c4dccb | #2f4a39 | border for mint surfaces |
| `--rg-sage` (new) | #4d6656 | #a9c3b1 | quiet accent text and icons (5.7:1 on bg / 9.1:1 on dark surface) |
| `--rg-hairline` (new) | 80% `--rg-line` | same | dividers that should almost disappear |
| `--rg-warn*`, `--rg-bad*` | unchanged | unchanged | notices and errors |

Rules: body text is never below 4.5:1 in either theme; use green for one primary action per screen;
no decorative gradients, glass or glow.

## Spacing (4px base)

`--s-1` 4 · `--s-2` 8 · `--s-3` 12 · `--s-4` 16 · `--s-5` 20 · `--s-6` 24 · `--s-7` 32 · `--s-8` 40 · `--s-9` 56.
Gutter: `--rg-gutter` (20px, 16px at ≤ 800px). Gap between related controls 8–12; between sections 24–32.

## Radius

`--r-xs` 6 (badges) · `--r-sm` 10 (segments, small tiles) · `--r-md` 14 (fields, buttons, notices) ·
`--r-lg` 20 (cards, grouped lists, the desktop sidebar) · `--r-pill` (chips, mic, switches).

## Type (rem; Atkinson Hyperlegible Next)

| Token | Size | Use |
|---|---|---|
| `--t-label` | 0.8125rem / 13px, uppercase, `--track-label` | section labels, field tags |
| `--t-meta` | 0.9375rem / 15px | secondary lines, segmented options |
| `--t-body` | 1.0625rem / 17px | body, row titles, inputs |
| `--t-lead` | 1.125rem / 18px | intro text, primary buttons |
| `--t-title-3` | 1.25rem / 20px | card titles |
| `--t-title-2` | 1.625rem / 26px | screen titles (Directions) |
| `--t-title-1` | 2rem / 32px | page titles (Settings, Transit data) |
| `--t-display` | 2.75rem / 44px | home headline |

Leading `--lh-tight` 1.08, `--lh-snug` 1.3, `--lh-body` 1.5. Weights `--w-regular` 500, `--w-medium` 620,
`--w-semibold` 700, `--w-bold` 780, `--w-heavy` 820. Display text tracks `--track-display` (−0.035em).

## Elevation (three levels)

| Token | Light | Dark |
|---|---|---|
| `--elev-1` | 1–2px warm shadow | 1px hairline ring |
| `--elev-2` | soft 20px warm drop | 1px hairline ring |
| `--elev-3` | floating sidebar over the map | hairline ring + deep, low-alpha drop |

Shadows are tinted warm (rgba(52, 42, 20, …)), never blue or black. Dark mode is flat with hairlines.

## Layout

- Phones (≤ 800px): one full-screen panel, gutter 16px.
- 600–800px (tablet portrait, large phones landscape): the panel content is a centred 600px column; the
  header aligns to it.
- Desktop (≥ 801px): the map is full-bleed; the panel floats as a sidebar at `--rg-panel-inset` (16px, 20px
  from 1600px) with width `--rg-panel-w` = clamp(360px, 30vw, 440px), radius `--r-lg`, `--elev-3`. Its height
  follows its content (a short Directions form is a compact card) up to the viewport, and scrolls inside.
- Readable measure inside any panel: `--rg-measure` (34rem).

## Controls

- Minimum target `--rg-control` (48px). Primary CTAs 60px; the home Speak button 72–80px.
- One visible focus ring: 3px `--rg-focus`, offset 2px. Composite controls (from/to card, search field,
  segmented "When", time field) draw the ring on the visible control and suppress the inner input's ring.
- Segmented control: mint track, `--r-md`; selected segment is surface + green text + `--elev-1`
  (dark: inset green ring). Built from native radios so arrow keys and screen readers work.
- Switch: native `input[type=checkbox][role=switch]`, 52×32 inside a ≥ 76px row; the whole row is the target.

## Motion

Use only `--m-press` 120ms, `--m-small` 200ms, `--m-card` 280ms, `--m-journey` 400ms with `--e-out` /
`--e-std`. Animate transform and opacity only. Durations are 0 under `prefers-reduced-motion`, and every
keyframe also has an explicit reduced-motion override. Example: swapping From/To turns the swap icon half a
revolution and slides the two values past each other in 280ms; focus returns to the swap button and the
new order is announced.

## Icons

`rgIcon(name)` in app.js: 24px grid, 1.75 stroke, round caps. v2 adds `home`, `work`, `star`, `map`, `swap`.
