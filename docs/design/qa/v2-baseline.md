# Rove design QA report

Base URL: http://localhost:4355  
Run: 2026-10-24T01:48:44.649Z (553 s)  
Chrome: Chrome/155.0.8059.86

Rerun: `node scripts/preview-site.mjs 4348` then `node docs/design/qa/design-qa.mjs --base http://localhost:4348 --puppeteer <dir with node_modules/puppeteer-core> --out docs/design/qa/<name>`. Configs: widths 320/375/390/430/768/1024 at 844 high, 1440x900, 1920x1080, 390 and 1440 dark, landscape 844x390, short 390x500, 390 with 200% root font size, classic mode (390, 390 dark, 1440) and audio-first mode (390, 390 dark) via localStorage rove-mode.

Audits run with `prefers-reduced-motion: reduce`; motion/performance sections use normal motion. Contrast counts are unique element+colour pairs with ratio < 4.5:1 (WCAG fail column applies the 3:1 large-text threshold). Dock overlap counts interactive elements whose centre hits `.rg-dock` after `scrollIntoView({block:"nearest"})`.

## Summary by viewport and scene

| Config | Scene | View | H-overflow | Targets | <44px | <48px | Contrast <4.5 | WCAG fail | Dock overlap (now / after scroll) | Text clipped | Panel overlaps | Console errors |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 320 | home | home | no | 7 | 0 | 1 | 0 | 0 | — | 0 | 0 | 0 |
| 320 | plan-search | plan | no | 10 | 0 | 1 | 0 | 0 | — | 0 | 0 | 0 |
| 320 | results-demo | results | no | 12 | 0 | 1 | 0 | 0 | — | 1 | 0 | 0 |
| 320 | trip-1 | navigate | no | 5 | 0 | 1 | 0 | 0 | 0 / 0 | 0 | 0 | 0 |
| 320 | trip-2 | navigate | no | 6 | 0 | 1 | 0 | 0 | 0 / 0 | 1 | 0 | 0 |
| 320 | trip-3 | navigate | no | 6 | 0 | 1 | 0 | 0 | 0 / 0 | 0 | 0 | 0 |
| 320 | trip-4 | navigate | no | 5 | 0 | 1 | 0 | 0 | 0 / 0 | 0 | 0 | 0 |
| 320 | trip-5 | navigate | no | 6 | 0 | 1 | 0 | 0 | 0 / 0 | 1 | 0 | 0 |
| 320 | trip-6 | navigate | no | 6 | 0 | 1 | 0 | 0 | 0 / 0 | 0 | 0 | 0 |
| 320 | arrival | navigate | no | 2 | 0 | 1 | 0 | 0 | 0 / 0 | 0 | 0 | 0 |
| 320 | help-open | navigate | no | 8 | 0 | 1 | 0 | 0 | 0 / 0 | 1 | 0 | 0 |
| 320 | results-real | results | no | 11 | 0 | 1 | 0 | 0 | — | 0 | 0 | 0 |
| 375 | home | home | no | 7 | 0 | 1 | 0 | 0 | — | 0 | 0 | 0 |
| 375 | plan-search | plan | no | 10 | 0 | 1 | 0 | 0 | — | 0 | 0 | 0 |
| 375 | results-demo | results | no | 12 | 0 | 1 | 0 | 0 | — | 1 | 0 | 0 |
| 375 | trip-1 | navigate | no | 5 | 0 | 1 | 0 | 0 | 0 / 0 | 0 | 0 | 0 |
| 375 | trip-2 | navigate | no | 6 | 0 | 1 | 0 | 0 | 0 / 0 | 1 | 0 | 0 |
| 375 | trip-3 | navigate | no | 6 | 0 | 1 | 0 | 0 | 1 / 0 | 0 | 0 | 0 |
| 375 | trip-4 | navigate | no | 5 | 0 | 1 | 0 | 0 | 0 / 0 | 0 | 0 | 0 |
| 375 | trip-5 | navigate | no | 6 | 0 | 1 | 0 | 0 | 0 / 0 | 1 | 0 | 0 |
| 375 | trip-6 | navigate | no | 6 | 0 | 1 | 0 | 0 | 0 / 0 | 0 | 0 | 0 |
| 375 | arrival | navigate | no | 2 | 0 | 1 | 0 | 0 | 0 / 0 | 0 | 0 | 0 |
| 375 | help-open | navigate | no | 8 | 0 | 1 | 0 | 0 | 0 / 0 | 1 | 0 | 0 |
| 375 | results-real | results | no | 11 | 0 | 1 | 0 | 0 | — | 0 | 0 | 0 |
| 390 | home | home | no | 7 | 0 | 1 | 0 | 0 | — | 0 | 0 | 0 |
| 390 | plan-search | plan | no | 10 | 0 | 1 | 0 | 0 | — | 0 | 0 | 0 |
| 390 | results-demo | results | no | 12 | 0 | 1 | 0 | 0 | — | 1 | 0 | 0 |
| 390 | trip-1 | navigate | no | 5 | 0 | 1 | 0 | 0 | 0 / 0 | 0 | 0 | 0 |
| 390 | trip-2 | navigate | no | 6 | 0 | 1 | 0 | 0 | 1 / 0 | 1 | 0 | 0 |
| 390 | trip-3 | navigate | no | 6 | 0 | 1 | 0 | 0 | 1 / 0 | 0 | 0 | 0 |
| 390 | trip-4 | navigate | no | 5 | 0 | 1 | 0 | 0 | 0 / 0 | 0 | 0 | 0 |
| 390 | trip-5 | navigate | no | 6 | 0 | 1 | 0 | 0 | 1 / 0 | 1 | 0 | 0 |
| 390 | trip-6 | navigate | no | 6 | 0 | 1 | 0 | 0 | 0 / 0 | 0 | 0 | 0 |
| 390 | arrival | navigate | no | 2 | 0 | 1 | 0 | 0 | 0 / 0 | 0 | 0 | 0 |
| 390 | help-open | navigate | no | 8 | 0 | 1 | 0 | 0 | 0 / 0 | 1 | 0 | 0 |
| 390 | results-real | results | no | 11 | 0 | 1 | 0 | 0 | — | 0 | 0 | 0 |
| 430 | home | home | no | 7 | 0 | 1 | 0 | 0 | — | 0 | 0 | 0 |
| 430 | plan-search | plan | no | 10 | 0 | 1 | 0 | 0 | — | 0 | 0 | 0 |
| 430 | results-demo | results | no | 12 | 0 | 1 | 0 | 0 | — | 0 | 0 | 0 |
| 430 | trip-1 | navigate | no | 5 | 0 | 1 | 0 | 0 | 0 / 0 | 0 | 0 | 0 |
| 430 | trip-2 | navigate | no | 6 | 0 | 1 | 0 | 0 | 1 / 0 | 1 | 0 | 0 |
| 430 | trip-3 | navigate | no | 6 | 0 | 1 | 0 | 0 | 1 / 0 | 0 | 0 | 0 |
| 430 | trip-4 | navigate | no | 5 | 0 | 1 | 0 | 0 | 0 / 0 | 0 | 0 | 0 |
| 430 | trip-5 | navigate | no | 6 | 0 | 1 | 0 | 0 | 1 / 0 | 1 | 0 | 0 |
| 430 | trip-6 | navigate | no | 6 | 0 | 1 | 0 | 0 | 0 / 0 | 0 | 0 | 0 |
| 430 | arrival | navigate | no | 2 | 0 | 1 | 0 | 0 | 0 / 0 | 0 | 0 | 0 |
| 430 | help-open | navigate | no | 8 | 0 | 1 | 0 | 0 | 0 / 0 | 1 | 0 | 0 |
| 430 | results-real | results | no | 11 | 0 | 1 | 0 | 0 | — | 0 | 0 | 0 |
| 768 | home | home | no | 8 | 0 | 2 | 0 | 0 | — | 0 | 0 | 0 |
| 768 | plan-search | plan | no | 11 | 0 | 2 | 0 | 0 | — | 0 | 0 | 0 |
| 768 | results-demo | results | no | 13 | 0 | 2 | 0 | 0 | — | 0 | 0 | 0 |
| 768 | trip-1 | navigate | no | 6 | 0 | 2 | 0 | 0 | 0 / 0 | 0 | 0 | 0 |
| 768 | trip-2 | navigate | no | 7 | 0 | 2 | 0 | 0 | 0 / 0 | 1 | 0 | 0 |
| 768 | trip-3 | navigate | no | 7 | 0 | 2 | 0 | 0 | 1 / 0 | 0 | 0 | 0 |
| 768 | trip-4 | navigate | no | 6 | 0 | 2 | 0 | 0 | 0 / 0 | 0 | 0 | 0 |
| 768 | trip-5 | navigate | no | 7 | 0 | 2 | 0 | 0 | 0 / 0 | 1 | 0 | 0 |
| 768 | trip-6 | navigate | no | 7 | 0 | 2 | 0 | 0 | 0 / 0 | 0 | 0 | 0 |
| 768 | arrival | navigate | no | 3 | 0 | 2 | 0 | 0 | 0 / 0 | 0 | 0 | 0 |
| 768 | help-open | navigate | no | 9 | 0 | 2 | 0 | 0 | 0 / 0 | 1 | 0 | 0 |
| 768 | results-real | results | no | 12 | 0 | 2 | 0 | 0 | — | 0 | 0 | 0 |
| 1024 | home | home | no | 17 | 4 | 10 | 1 | 1 | — | 0 | 0 | 0 |
| 1024 | plan-search | plan | no | 21 | 4 | 10 | 0 | 0 | — | 0 | 0 | 0 |
| 1024 | results-demo | results | no | 22 | 4 | 10 | 0 | 0 | — | 0 | 0 | 0 |
| 1024 | trip-1 | navigate | no | 15 | 4 | 10 | 0 | 0 | 0 / 0 | 0 | 0 | 0 |
| 1024 | trip-2 | navigate | no | 16 | 4 | 10 | 0 | 0 | 1 / 0 | 1 | 0 | 0 |
| 1024 | trip-3 | navigate | no | 16 | 4 | 10 | 0 | 0 | 1 / 0 | 0 | 0 | 0 |
| 1024 | trip-4 | navigate | no | 15 | 4 | 10 | 0 | 0 | 0 / 0 | 0 | 0 | 0 |
| 1024 | trip-5 | navigate | no | 16 | 4 | 10 | 0 | 0 | 1 / 0 | 1 | 0 | 0 |
| 1024 | trip-6 | navigate | no | 16 | 4 | 10 | 0 | 0 | 0 / 0 | 0 | 0 | 0 |
| 1024 | arrival | navigate | no | 12 | 4 | 10 | 0 | 0 | 0 / 0 | 0 | 0 | 0 |
| 1024 | help-open | navigate | no | 18 | 4 | 10 | 0 | 0 | 0 / 0 | 1 | 0 | 0 |
| 1024 | results-real | results | no | 21 | 4 | 10 | 0 | 0 | — | 0 | 0 | 0 |
| 1440 | home | home | no | 17 | 4 | 10 | 1 | 1 | — | 0 | 0 | 0 |
| 1440 | plan-search | plan | no | 21 | 4 | 10 | 0 | 0 | — | 0 | 0 | 0 |
| 1440 | results-demo | results | no | 22 | 4 | 10 | 0 | 0 | — | 0 | 0 | 0 |
| 1440 | trip-1 | navigate | no | 15 | 4 | 10 | 0 | 0 | 0 / 0 | 0 | 0 | 0 |
| 1440 | trip-2 | navigate | no | 16 | 4 | 10 | 0 | 0 | 1 / 0 | 1 | 0 | 0 |
| 1440 | trip-3 | navigate | no | 16 | 4 | 10 | 0 | 0 | 1 / 0 | 0 | 0 | 0 |
| 1440 | trip-4 | navigate | no | 15 | 4 | 10 | 0 | 0 | 0 / 0 | 0 | 0 | 0 |
| 1440 | trip-5 | navigate | no | 16 | 4 | 10 | 0 | 0 | 1 / 0 | 1 | 0 | 0 |
| 1440 | trip-6 | navigate | no | 16 | 4 | 10 | 0 | 0 | 0 / 0 | 0 | 0 | 0 |
| 1440 | arrival | navigate | no | 12 | 4 | 10 | 0 | 0 | 0 / 0 | 0 | 0 | 0 |
| 1440 | help-open | navigate | no | 18 | 4 | 10 | 0 | 0 | 0 / 0 | 1 | 0 | 0 |
| 1440 | results-real | results | no | 21 | 4 | 10 | 0 | 0 | — | 0 | 0 | 0 |
| 1920 | home | home | no | 17 | 4 | 10 | 1 | 1 | — | 0 | 0 | 0 |
| 1920 | plan-search | plan | no | 27 | 4 | 10 | 0 | 0 | — | 0 | 0 | 0 |
| 1920 | results-demo | results | no | 22 | 4 | 10 | 0 | 0 | — | 0 | 0 | 0 |
| 1920 | trip-1 | navigate | no | 15 | 4 | 10 | 0 | 0 | 0 / 0 | 0 | 0 | 0 |
| 1920 | trip-2 | navigate | no | 16 | 4 | 10 | 0 | 0 | 0 / 0 | 1 | 0 | 0 |
| 1920 | trip-3 | navigate | no | 16 | 4 | 10 | 0 | 0 | 0 / 0 | 0 | 0 | 0 |
| 1920 | trip-4 | navigate | no | 15 | 4 | 10 | 0 | 0 | 0 / 0 | 0 | 0 | 0 |
| 1920 | trip-5 | navigate | no | 16 | 4 | 10 | 0 | 0 | 0 / 0 | 1 | 0 | 0 |
| 1920 | trip-6 | navigate | no | 16 | 4 | 10 | 0 | 0 | 0 / 0 | 0 | 0 | 0 |
| 1920 | arrival | navigate | no | 12 | 4 | 10 | 0 | 0 | 0 / 0 | 0 | 0 | 0 |
| 1920 | help-open | navigate | no | 18 | 4 | 10 | 0 | 0 | 0 / 0 | 1 | 0 | 0 |
| 1920 | results-real | results | no | 21 | 4 | 10 | 0 | 0 | — | 0 | 0 | 0 |
| 390-dark | home | home | no | 7 | 0 | 1 | 0 | 0 | — | 0 | 0 | 0 |
| 390-dark | plan-search | plan | no | 16 | 0 | 1 | 0 | 0 | — | 0 | 0 | 0 |
| 390-dark | results-demo | results | no | 12 | 0 | 1 | 0 | 0 | — | 1 | 0 | 0 |
| 390-dark | trip-1 | navigate | no | 5 | 0 | 1 | 0 | 0 | 0 / 0 | 0 | 0 | 0 |
| 390-dark | trip-2 | navigate | no | 6 | 0 | 1 | 0 | 0 | 1 / 0 | 1 | 0 | 0 |
| 390-dark | trip-3 | navigate | no | 6 | 0 | 1 | 0 | 0 | 1 / 0 | 0 | 0 | 0 |
| 390-dark | trip-4 | navigate | no | 5 | 0 | 1 | 0 | 0 | 0 / 0 | 0 | 0 | 0 |
| 390-dark | trip-5 | navigate | no | 6 | 0 | 1 | 0 | 0 | 1 / 0 | 1 | 0 | 0 |
| 390-dark | trip-6 | navigate | no | 6 | 0 | 1 | 0 | 0 | 0 / 0 | 0 | 0 | 0 |
| 390-dark | arrival | navigate | no | 2 | 0 | 1 | 0 | 0 | 0 / 0 | 0 | 0 | 0 |
| 390-dark | help-open | navigate | no | 8 | 0 | 1 | 0 | 0 | 0 / 0 | 1 | 0 | 0 |
| 390-dark | results-real | results | no | 11 | 0 | 1 | 0 | 0 | — | 0 | 0 | 0 |
| 1440-dark | home | home | no | 17 | 4 | 10 | 0 | 0 | — | 0 | 0 | 0 |
| 1440-dark | plan-search | plan | no | 27 | 4 | 10 | 0 | 0 | — | 0 | 0 | 0 |
| 1440-dark | results-demo | results | no | 22 | 4 | 10 | 0 | 0 | — | 0 | 0 | 0 |
| 1440-dark | trip-1 | navigate | no | 15 | 4 | 10 | 0 | 0 | 0 / 0 | 0 | 0 | 0 |
| 1440-dark | trip-2 | navigate | no | 16 | 4 | 10 | 0 | 0 | 1 / 0 | 1 | 0 | 0 |
| 1440-dark | trip-3 | navigate | no | 16 | 4 | 10 | 0 | 0 | 1 / 0 | 0 | 0 | 0 |
| 1440-dark | trip-4 | navigate | no | 15 | 4 | 10 | 0 | 0 | 0 / 0 | 0 | 0 | 0 |
| 1440-dark | trip-5 | navigate | no | 16 | 4 | 10 | 0 | 0 | 1 / 0 | 1 | 0 | 0 |
| 1440-dark | trip-6 | navigate | no | 16 | 4 | 10 | 0 | 0 | 0 / 0 | 0 | 0 | 0 |
| 1440-dark | arrival | navigate | no | 12 | 4 | 10 | 0 | 0 | 0 / 0 | 0 | 0 | 0 |
| 1440-dark | help-open | navigate | no | 18 | 4 | 10 | 0 | 0 | 0 / 0 | 1 | 0 | 0 |
| 1440-dark | results-real | results | no | 21 | 4 | 10 | 0 | 0 | — | 0 | 0 | 0 |
| landscape-844x390 | home | home | no | 17 | 4 | 10 | 0 | 0 | — | 0 | 0 | 0 |
| landscape-844x390 | plan-search | plan | no | 21 | 4 | 10 | 0 | 0 | — | 0 | 0 | 0 |
| landscape-844x390 | results-demo | results | no | 22 | 4 | 10 | 0 | 0 | — | 0 | 0 | 0 |
| landscape-844x390 | trip-1 | navigate | no | 15 | 4 | 10 | 0 | 0 | 0 / 0 | 0 | 0 | 0 |
| landscape-844x390 | trip-2 | navigate | no | 16 | 4 | 10 | 0 | 0 | 0 / 0 | 1 | 0 | 0 |
| landscape-844x390 | trip-3 | navigate | no | 16 | 4 | 10 | 0 | 0 | 0 / 0 | 0 | 0 | 0 |
| landscape-844x390 | trip-4 | navigate | no | 15 | 4 | 10 | 0 | 0 | 0 / 0 | 0 | 0 | 0 |
| landscape-844x390 | trip-5 | navigate | no | 16 | 4 | 10 | 0 | 0 | 0 / 0 | 1 | 0 | 0 |
| landscape-844x390 | trip-6 | navigate | no | 16 | 4 | 10 | 0 | 0 | 0 / 0 | 0 | 0 | 0 |
| landscape-844x390 | arrival | navigate | no | 12 | 4 | 10 | 0 | 0 | 0 / 0 | 0 | 0 | 0 |
| landscape-844x390 | help-open | navigate | no | 18 | 4 | 10 | 0 | 0 | 0 / 0 | 1 | 0 | 0 |
| landscape-844x390 | results-real | results | no | 21 | 4 | 10 | 0 | 0 | — | 0 | 0 | 0 |
| short-390x500 | home | home | no | 7 | 0 | 1 | 0 | 0 | — | 0 | 0 | 0 |
| short-390x500 | plan-search | plan | no | 10 | 0 | 1 | 0 | 0 | — | 0 | 0 | 0 |
| short-390x500 | results-demo | results | no | 12 | 0 | 1 | 0 | 0 | — | 1 | 0 | 0 |
| short-390x500 | trip-1 | navigate | no | 5 | 0 | 1 | 0 | 0 | 0 / 0 | 0 | 0 | 0 |
| short-390x500 | trip-2 | navigate | no | 6 | 0 | 1 | 0 | 0 | 0 / 0 | 1 | 0 | 0 |
| short-390x500 | trip-3 | navigate | no | 6 | 0 | 1 | 0 | 0 | 0 / 0 | 0 | 0 | 0 |
| short-390x500 | trip-4 | navigate | no | 5 | 0 | 1 | 0 | 0 | 0 / 0 | 0 | 0 | 0 |
| short-390x500 | trip-5 | navigate | no | 6 | 0 | 1 | 0 | 0 | 0 / 0 | 1 | 0 | 0 |
| short-390x500 | trip-6 | navigate | no | 6 | 0 | 1 | 0 | 0 | 0 / 0 | 0 | 0 | 0 |
| short-390x500 | arrival | navigate | no | 2 | 0 | 1 | 0 | 0 | 0 / 0 | 0 | 0 | 0 |
| short-390x500 | help-open | navigate | no | 8 | 0 | 1 | 0 | 0 | 0 / 0 | 1 | 0 | 0 |
| short-390x500 | results-real | results | no | 11 | 0 | 1 | 0 | 0 | — | 0 | 0 | 0 |
| 390-text200 | home | home | no | 7 | 0 | 1 | 0 | 0 | — | 0 | 0 | 0 |
| 390-text200 | plan-search | plan | no | 16 | 0 | 1 | 0 | 0 | — | 0 | 0 | 0 |
| 390-text200 | results-demo | results | no | 12 | 0 | 1 | 0 | 0 | — | 4 | 0 | 0 |
| 390-text200 | trip-1 | navigate | no | 5 | 0 | 1 | 0 | 0 | 0 / 0 | 2 | 0 | 0 |
| 390-text200 | trip-2 | navigate | no | 6 | 0 | 1 | 0 | 0 | 0 / 0 | 2 | 0 | 0 |
| 390-text200 | trip-3 | navigate | no | 6 | 0 | 1 | 0 | 0 | 0 / 0 | 2 | 0 | 0 |
| 390-text200 | trip-4 | navigate | no | 5 | 0 | 1 | 0 | 0 | 0 / 0 | 2 | 0 | 0 |
| 390-text200 | trip-5 | navigate | no | 6 | 0 | 1 | 0 | 0 | 0 / 0 | 2 | 0 | 0 |
| 390-text200 | trip-6 | navigate | no | 6 | 0 | 1 | 0 | 0 | 0 / 0 | 2 | 0 | 0 |
| 390-text200 | arrival | navigate | no | 2 | 0 | 1 | 0 | 0 | 0 / 0 | 2 | 0 | 0 |
| 390-text200 | help-open | navigate | no | 8 | 0 | 1 | 0 | 0 | 0 / 0 | 2 | 0 | 0 |
| 390-text200 | results-real | results | no | 11 | 0 | 1 | 0 | 0 | — | 3 | 0 | 0 |
| 390-classic | home | home | no | 7 | 0 | 1 | 0 | 0 | — | 0 | 0 | 0 |
| 390-classic | plan-search | plan | no | 10 | 0 | 1 | 0 | 0 | — | 0 | 0 | 1 |
| 390-classic | results-demo | results | no | 12 | 0 | 1 | 0 | 0 | — | 1 | 0 | 0 |
| 390-classic | trip-1 | navigate | no | 5 | 0 | 1 | 0 | 0 | 0 / 0 | 0 | 0 | 0 |
| 390-classic | trip-2 | navigate | no | 6 | 0 | 1 | 0 | 0 | 1 / 0 | 1 | 0 | 0 |
| 390-classic | trip-3 | navigate | no | 6 | 0 | 1 | 0 | 0 | 1 / 0 | 0 | 0 | 0 |
| 390-classic | trip-4 | navigate | no | 5 | 0 | 1 | 0 | 0 | 0 / 0 | 0 | 0 | 0 |
| 390-classic | trip-5 | navigate | no | 6 | 0 | 1 | 0 | 0 | 1 / 0 | 1 | 0 | 0 |
| 390-classic | trip-6 | navigate | no | 6 | 0 | 1 | 0 | 0 | 0 / 0 | 0 | 0 | 0 |
| 390-classic | arrival | navigate | no | 2 | 0 | 1 | 0 | 0 | 0 / 0 | 0 | 0 | 0 |
| 390-classic | help-open | navigate | no | 8 | 0 | 1 | 0 | 0 | 0 / 0 | 1 | 0 | 0 |
| 390-classic | results-real | results | no | 11 | 0 | 1 | 0 | 0 | — | 0 | 0 | 0 |
| 390-classic-dark | home | home | no | 7 | 0 | 1 | 0 | 0 | — | 0 | 0 | 0 |
| 390-classic-dark | plan-search | plan | no | 10 | 0 | 1 | 0 | 0 | — | 0 | 0 | 0 |
| 390-classic-dark | results-demo | results | no | 12 | 0 | 1 | 0 | 0 | — | 1 | 0 | 0 |
| 390-classic-dark | trip-1 | navigate | no | 5 | 0 | 1 | 0 | 0 | 0 / 0 | 0 | 0 | 0 |
| 390-classic-dark | trip-2 | navigate | no | 6 | 0 | 1 | 0 | 0 | 1 / 0 | 1 | 0 | 0 |
| 390-classic-dark | trip-3 | navigate | no | 6 | 0 | 1 | 0 | 0 | 1 / 0 | 0 | 0 | 0 |
| 390-classic-dark | trip-4 | navigate | no | 5 | 0 | 1 | 0 | 0 | 0 / 0 | 0 | 0 | 0 |
| 390-classic-dark | trip-5 | navigate | no | 6 | 0 | 1 | 0 | 0 | 1 / 0 | 1 | 0 | 0 |
| 390-classic-dark | trip-6 | navigate | no | 6 | 0 | 1 | 0 | 0 | 0 / 0 | 0 | 0 | 0 |
| 390-classic-dark | arrival | navigate | no | 2 | 0 | 1 | 0 | 0 | 0 / 0 | 0 | 0 | 0 |
| 390-classic-dark | help-open | navigate | no | 8 | 0 | 1 | 0 | 0 | 0 / 0 | 1 | 0 | 0 |
| 390-classic-dark | results-real | results | no | 11 | 0 | 1 | 0 | 0 | — | 0 | 0 | 0 |
| 1440-classic | home | home | no | 17 | 4 | 10 | 0 | 0 | — | 0 | 0 | 0 |
| 1440-classic | plan-search | plan | no | 21 | 4 | 10 | 0 | 0 | — | 0 | 0 | 0 |
| 1440-classic | results-demo | results | no | 22 | 4 | 10 | 0 | 0 | — | 0 | 0 | 0 |
| 1440-classic | trip-1 | navigate | no | 15 | 4 | 10 | 0 | 0 | 0 / 0 | 0 | 0 | 0 |
| 1440-classic | trip-2 | navigate | no | 16 | 4 | 10 | 0 | 0 | 1 / 0 | 1 | 0 | 0 |
| 1440-classic | trip-3 | navigate | no | 16 | 4 | 10 | 0 | 0 | 1 / 0 | 0 | 0 | 0 |
| 1440-classic | trip-4 | navigate | no | 15 | 4 | 10 | 0 | 0 | 0 / 0 | 0 | 0 | 0 |
| 1440-classic | trip-5 | navigate | no | 16 | 4 | 10 | 0 | 0 | 1 / 0 | 1 | 0 | 0 |
| 1440-classic | trip-6 | navigate | no | 16 | 4 | 10 | 0 | 0 | 0 / 0 | 0 | 0 | 0 |
| 1440-classic | arrival | navigate | no | 12 | 4 | 10 | 0 | 0 | 0 / 0 | 0 | 0 | 0 |
| 1440-classic | help-open | navigate | no | 18 | 4 | 10 | 0 | 0 | 0 / 0 | 1 | 0 | 0 |
| 1440-classic | results-real | results | no | 21 | 4 | 10 | 0 | 0 | — | 0 | 0 | 0 |
| 390-audio | home | home | no | 7 | 0 | 1 | 0 | 0 | — | 0 | 0 | 0 |
| 390-audio | plan-search | plan | no | 10 | 0 | 1 | 0 | 0 | — | 0 | 0 | 0 |
| 390-audio | results-demo | results | no | 12 | 0 | 1 | 0 | 0 | — | 1 | 0 | 0 |
| 390-audio | trip-1 | navigate | no | 5 | 0 | 1 | 0 | 0 | 0 / 0 | 0 | 0 | 0 |
| 390-audio | trip-2 | navigate | no | 6 | 0 | 1 | 0 | 0 | 1 / 0 | 1 | 0 | 0 |
| 390-audio | trip-3 | navigate | no | 6 | 0 | 1 | 0 | 0 | 1 / 0 | 0 | 0 | 0 |
| 390-audio | trip-4 | navigate | no | 5 | 0 | 1 | 0 | 0 | 0 / 0 | 0 | 0 | 0 |
| 390-audio | trip-5 | navigate | no | 6 | 0 | 1 | 0 | 0 | 1 / 0 | 1 | 0 | 0 |
| 390-audio | trip-6 | navigate | no | 6 | 0 | 1 | 0 | 0 | 0 / 0 | 0 | 0 | 0 |
| 390-audio | arrival | navigate | no | 2 | 0 | 1 | 0 | 0 | 0 / 0 | 0 | 0 | 0 |
| 390-audio | help-open | navigate | no | 8 | 0 | 1 | 0 | 0 | 0 / 0 | 1 | 0 | 0 |
| 390-audio | results-real | results | no | 11 | 0 | 1 | 0 | 0 | — | 0 | 0 | 0 |
| 390-audio-dark | home | home | no | 7 | 0 | 1 | 0 | 0 | — | 0 | 0 | 0 |
| 390-audio-dark | plan-search | plan | no | 10 | 0 | 1 | 0 | 0 | — | 0 | 0 | 0 |
| 390-audio-dark | results-demo | results | no | 12 | 0 | 1 | 0 | 0 | — | 1 | 0 | 0 |
| 390-audio-dark | trip-1 | navigate | no | 5 | 0 | 1 | 0 | 0 | 0 / 0 | 0 | 0 | 0 |
| 390-audio-dark | trip-2 | navigate | no | 6 | 0 | 1 | 0 | 0 | 1 / 0 | 1 | 0 | 0 |
| 390-audio-dark | trip-3 | navigate | no | 6 | 0 | 1 | 0 | 0 | 1 / 0 | 0 | 0 | 0 |
| 390-audio-dark | trip-4 | navigate | no | 5 | 0 | 1 | 0 | 0 | 0 / 0 | 0 | 0 | 0 |
| 390-audio-dark | trip-5 | navigate | no | 6 | 0 | 1 | 0 | 0 | 1 / 0 | 1 | 0 | 0 |
| 390-audio-dark | trip-6 | navigate | no | 6 | 0 | 1 | 0 | 0 | 0 / 0 | 0 | 0 | 0 |
| 390-audio-dark | arrival | navigate | no | 2 | 0 | 1 | 0 | 0 | 0 / 0 | 0 | 0 | 0 |
| 390-audio-dark | help-open | navigate | no | 8 | 0 | 1 | 0 | 0 | 0 / 0 | 1 | 0 | 0 |
| 390-audio-dark | results-real | results | no | 11 | 0 | 1 | 0 | 0 | — | 0 | 0 | 0 |

## Focus after Confirm (must be #rgHeading)

| Config | Results |
|---|---|
| 320 | 1:board=ok, 2:ride=ok, 3:transfer=ok, 4:board=ok, 5:ride=ok, 6:arrive=ok |
| 375 | 1:board=ok, 2:ride=ok, 3:transfer=ok, 4:board=ok, 5:ride=ok, 6:arrive=ok |
| 390 | 1:board=ok, 2:ride=ok, 3:transfer=ok, 4:board=ok, 5:ride=ok, 6:arrive=ok |
| 430 | 1:board=ok, 2:ride=ok, 3:transfer=ok, 4:board=ok, 5:ride=ok, 6:arrive=ok |
| 768 | 1:board=ok, 2:ride=ok, 3:transfer=ok, 4:board=ok, 5:ride=ok, 6:arrive=ok |
| 1024 | 1:board=ok, 2:ride=ok, 3:transfer=ok, 4:board=ok, 5:ride=ok, 6:arrive=ok |
| 1440 | 1:board=ok, 2:ride=ok, 3:transfer=ok, 4:board=ok, 5:ride=ok, 6:arrive=ok |
| 1920 | 1:board=ok, 2:ride=ok, 3:transfer=ok, 4:board=ok, 5:ride=ok, 6:arrive=ok |
| 390-dark | 1:board=ok, 2:ride=ok, 3:transfer=ok, 4:board=ok, 5:ride=ok, 6:arrive=ok |
| 1440-dark | 1:board=ok, 2:ride=ok, 3:transfer=ok, 4:board=ok, 5:ride=ok, 6:arrive=ok |
| landscape-844x390 | 1:board=ok, 2:ride=ok, 3:transfer=ok, 4:board=ok, 5:ride=ok, 6:arrive=ok |
| short-390x500 | 1:board=ok, 2:ride=ok, 3:transfer=ok, 4:board=ok, 5:ride=ok, 6:arrive=ok |
| 390-text200 | 1:board=ok, 2:ride=ok, 3:transfer=ok, 4:board=ok, 5:ride=ok, 6:arrive=ok |
| 390-classic | 1:board=ok, 2:ride=ok, 3:transfer=ok, 4:board=ok, 5:ride=ok, 6:arrive=ok |
| 390-classic-dark | 1:board=ok, 2:ride=ok, 3:transfer=ok, 4:board=ok, 5:ride=ok, 6:arrive=ok |
| 1440-classic | 1:board=ok, 2:ride=ok, 3:transfer=ok, 4:board=ok, 5:ride=ok, 6:arrive=ok |
| 390-audio | 1:board=ok, 2:ride=ok, 3:transfer=ok, 4:board=ok, 5:ride=ok, 6:arrive=ok |
| 390-audio-dark | 1:board=ok, 2:ride=ok, 3:transfer=ok, 4:board=ok, 5:ride=ok, 6:arrive=ok |

(dom-click) means the Confirm centre was not hittable by a real pointer at that moment, so the script fell back to element.click().

## Help open, scrolled to bottom

| Config | Dock has Confirm | Close help in dock | Buttons hit | Obscured | Offscreen | Focus after open |
|---|---|---|---|---|---|---|
| 320 | no | yes | 3/5 | 0 | "Find another route", "Where am I?" | rgHelpHeading |
| 375 | no | yes | 3/5 | 0 | "Find another route", "Where am I?" | rgHelpHeading |
| 390 | no | yes | 3/5 | "Where am I?" by main#panel > header.panel-top | "Find another route" | rgHelpHeading |
| 430 | no | yes | 3/5 | "Where am I?" by main#panel > header.panel-top | "Find another route" | rgHelpHeading |
| 768 | no | yes | 3/5 | "Find another route" by main#panel > header.panel-top > div.brand-row; "Where am I?" by main#panel > header.panel-top | 0 | rgHelpHeading |
| 1024 | no | yes | 2/5 | "Undo last confirmation" by main#panel > header.panel-top > div.brand-row | "Find another route", "Where am I?" | rgHelpHeading |
| 1440 | no | yes | 3/5 | "Where am I?" by main#panel > header.panel-top > div.brand-row | "Find another route" | rgHelpHeading |
| 1920 | no | yes | 5/5 | 0 | 0 | rgHelpHeading |
| 390-dark | no | yes | 3/5 | "Where am I?" by main#panel > header.panel-top | "Find another route" | rgHelpHeading |
| 1440-dark | no | yes | 3/5 | "Where am I?" by main#panel > header.panel-top > div.brand-row | "Find another route" | rgHelpHeading |
| landscape-844x390 | no | yes | 1/5 | 0 | "Find another route", "Where am I?", "Undo last confirmation", "Rove voice: Off" | rgHelpHeading |
| short-390x500 | no | yes | 1/5 | 0 | "Find another route", "Where am I?", "Undo last confirmation", "Rove voice: Off" | rgHelpHeading |
| 390-text200 | no | yes | 1/5 | 0 | "Find another route", "Where am I?", "Undo last confirmation", "Rove voice: Off" | rgHelpHeading |
| 390-classic | no | yes | 3/5 | "Where am I?" by main#panel > header.panel-top | "Find another route" | rgHelpHeading |
| 390-classic-dark | no | yes | 3/5 | "Where am I?" by main#panel > header.panel-top | "Find another route" | rgHelpHeading |
| 1440-classic | no | yes | 3/5 | "Where am I?" by main#panel > header.panel-top > div.brand-row | "Find another route" | rgHelpHeading |
| 390-audio | no | yes | 3/5 | "Where am I?" by main#panel > header.panel-top | "Find another route" | rgHelpHeading |
| 390-audio-dark | no | yes | 3/5 | "Where am I?" by main#panel > header.panel-top | "Find another route" | rgHelpHeading |

## Reduced motion

Running animations/transitions with non-zero duration under `prefers-reduced-motion: reduce`: **0**


## Performance (390x844, normal motion)

### Demo journey: layout shift and long tasks

| CPU | CLS (all / excl. recent input) | Long tasks (count / total / max ms) |
|---|---|---|
| 1x | 0 / 0 | 1 / 63 / 63 |
| 4x | 0 / 0 | 4 / 400 / 135 |

### requestAnimationFrame intervals over 3 s (vsync measured at 33.3 ms)

"dropped" = missed vsyncs relative to the measured refresh interval. Transition = home → results (startDemo) → trip (Start) → next step (Confirm) inside one 3 s recording. 4x = CDP CPU throttling to approximate a phone.

| CPU | Home motif p50 / p95 / max ms | dropped / frames | Transition p50 / p95 / max ms | dropped / frames |
|---|---|---|---|---|
| 1x | 33.3 / 33.4 / 33.5 | 0 / 90 | 33.3 / 33.4 / 33.4 | 0 / 90 |
| 4x | 33.3 / 33.4 / 33.5 | 0 / 90 | 33.3 / 33.4 / 133.3 | 4 / 86 |

Home motif animations running during measurement: 6.

## Mode passes (classic / audio-first)

| Config | Requested | body classes | window.RoveMode | Applied |
|---|---|---|---|---|
| 390-classic | classic | rove-accessible | — | **no** (mode not implemented on this build, or not applied) |
| 390-classic-dark | classic | rove-accessible | — | **no** (mode not implemented on this build, or not applied) |
| 1440-classic | classic | rove-accessible | — | **no** (mode not implemented on this build, or not applied) |
| 390-audio | audio | rove-accessible | — | **no** (mode not implemented on this build, or not applied) |
| 390-audio-dark | audio | rove-accessible | — | **no** (mode not implemented on this build, or not applied) |

## Autocomplete (type "Lake Mer" in To; .result rows must appear)

| Config | Rows | First row | aria-expanded |
|---|---|---|---|
| 320 | 4 | Lake MerrittBART, lines BlueGreenOrange | true |
| 375 | 4 | Lake MerrittBART, lines BlueGreenOrange | true |
| 390 | 4 | Lake MerrittBART, lines BlueGreenOrange | true |
| 430 | 4 | Lake MerrittBART, lines BlueGreenOrange | true |
| 768 | 4 | Lake MerrittBART, lines BlueGreenOrange | true |
| 1024 | 5 | Lake MerrittBART, lines BlueGreenOrange | true |
| 1440 | 5 | Lake MerrittBART, lines BlueGreenOrange | true |
| 1920 | 5 | Lake MerrittBART, lines BlueGreenOrange | true |
| 390-dark | 4 | Lake MerrittBART, lines BlueGreenOrange | true |
| 1440-dark | 5 | Lake MerrittBART, lines BlueGreenOrange | true |
| landscape-844x390 | 5 | Lake MerrittBART, lines BlueGreenOrange | true |
| short-390x500 | 4 | Lake MerrittBART, lines BlueGreenOrange | true |
| 390-text200 | 4 | Lake MerrittBART, lines BlueGreenOrange | true |
| 390-classic | 4 | Lake MerrittBART, lines BlueGreenOrange | true |
| 390-classic-dark | 4 | Lake MerrittBART, lines BlueGreenOrange | true |
| 1440-classic | 5 | Lake MerrittBART, lines BlueGreenOrange | true |
| 390-audio | 4 | Lake MerrittBART, lines BlueGreenOrange | true |
| 390-audio-dark | 4 | Lake MerrittBART, lines BlueGreenOrange | true |

## Sheet drag (touch emulation) and grabber keyboard

| Config | Grabber | Name / role | Size | Height before → up → down | Moved up / down | Keyboard ArrowUp |
|---|---|---|---|---|---|---|
| 320 | none | | | | | |
| 375 | none | | | | | |
| 390 | none | | | | | |
| 430 | none | | | | | |
| 768 | none | | | | | |
| 390-dark | none | | | | | |
| short-390x500 | none | | | | | |
| 390-text200 | none | | | | | |
| 390-classic | none | | | | | |
| 390-classic-dark | none | | | | | |
| 390-audio | none | | | | | |
| 390-audio-dark | none | | | | | |

## Overlapping panels (sheet / map controls / layers / dock / live / speech bar)

None.

## Text clipping (overflow hidden / ellipsis and content larger than the box)

| Selector | Text | Axis | Over by (px) | Ellipsis | Seen in |
|---|---|---|---|---|---|
| `div.rg-jl > span.rg-jl-node.now > b` | N | y | 2 | yes | 54: 320/trip-2, 320/trip-5, 320/help-open, 375/trip-2… |
| `div.trip-ends > p > span` | La Playa St & Judah St (demo start) | x | 107 | yes | 11: 320/results-demo, 375/results-demo, 390/results-demo, 390-dark/results-demo… |
| `div.rg-jl > span.rg-jl-node.next > b` | N | y | 3 | yes | 5: 390-text200/trip-1, 390-text200/trip-2, 390-text200/trip-3, 390-text200/trip-4… |
| `div.rg-jl > span.rg-jl-node.done > b` | N | y | 3 | yes | 5: 390-text200/trip-3, 390-text200/trip-4, 390-text200/trip-5, 390-text200/trip-6… |
| `span.rg-strip-seg > span.rg-strip-line > b` | N | y | 3 | yes | 2: 390-text200/results-demo, 390-text200/results-real |

## Keyboard-only reachability

Every visible interactive element on the screen is tagged, then Tab is pressed until focus wraps. Unreachable = never received focus.

| Config | Screen | Interactive | Reached by Tab | Unreachable |
|---|---|---|---|---|
| 390 | home | 7 | 7 | 0 |
| 390 | plan | 7 | 7 | 1: `select#planTimeMode` "Leave now Depart at Arrive by" (hid after focus moved) |
| 390 | results | 12 | 12 | 0 |
| 390 | trip | 5 | 5 | 0 |
| 1440 | home | 16 | 16 | 0 |
| 1440 | plan | 17 | 17 | 1: `select#planTimeMode` "Leave now Depart at Arrive by" (hid after focus moved) |
| 1440 | results | 21 | 21 | 0 |
| 1440 | trip | 14 | 14 | 0 |
| 390-classic | home | 7 | 7 | 0 |
| 390-classic | plan | 7 | 7 | 1: `select#planTimeMode` "Leave now Depart at Arrive by" (hid after focus moved) |
| 390-classic | results | 12 | 12 | 0 |
| 390-classic | trip | 5 | 5 | 0 |

## Keyboard-only Tab order (390)

### home

| # | Role | Accessible name | Selector | In view | Focus ring | Under dock |
|---|---|---|---|---|---|---|
| 1 | link | Skip to transit information | `html > body.rove-accessible > a.skip-link` | yes | yes | no |
| 2 | button | Speak destination | `div.rg-home > div.rg-stack.rg-hero > button.rg-primary.rg-speak[data-action="voice-destination"]` | yes | yes | no |
| 3 | button | Type a destination | `div.rg-home > div.rg-stack.rg-hero > button.rg-field[data-action="plan"]` | yes | yes | no |
| 4 | button | Try the demo journey . A simulated trip with a transfer | `div.rg-home > nav.rg-links > button.rg-link[data-action="demo"]` | yes | yes | no |
| 5 | button | Nearby stops . Uses your location | `div.rg-home > nav.rg-links > button.rg-link[data-action="access-nearby"]` | yes | yes | no |
| 6 | button | Voice and accessibility . Rove voice, vibration, how it work | `div.rg-home > nav.rg-links > button.rg-link[data-action="access"]` | yes | yes | no |
| 7 | button | Transit data . Sources and what is live | `div.rg-home > nav.rg-links > button.rg-link[data-action="sources"]` | yes | yes | no |

### plan

| # | Role | Accessible name | Selector | In view | Focus ring | Under dock |
|---|---|---|---|---|---|---|
| 1 | link | Skip to transit information | `html > body.rove-accessible > a.skip-link` | yes | yes | no |
| 2 | button | Back | `div#panelBody > div.view-head > button.back-button[data-action="back"]` | yes | yes | no |
| 3 | button | Speak destination | `div#panelBody > div.rg-voice-row > button.rg-mic[data-action="voice-destination"]` | yes | yes | no |
| 4 | combobox | FROM , STARTING POINT | `input#planFrom` | yes | **no** | no |
| 5 | combobox | TO , DESTINATION | `input#planTo` | yes | **no** | no |
| 6 | button | Swap starting point and destination | `form.plan-form.suggesting > div.plan-fields > button.swap-button[data-action="plan-swap"]` | yes | yes | no |
| 7 | button | Use my location Your browser will ask for permission | `ul.rows > li > button.row.result[data-action="plan-locate"]` | yes | yes | no |

### results

| # | Role | Accessible name | Selector | In view | Focus ring | Under dock |
|---|---|---|---|---|---|---|
| 1 | link | Skip to transit information | `html > body.rove-accessible > a.skip-link` | yes | yes | no |
| 2 | button | Back | `div#panelBody > div.view-head > button.back-button[data-action="back"]` | yes | yes | no |
| 3 | button | Edit | `div#panelBody > div.trip-card.rg-trip > button.text-button.rg-trip-edit[data-action="back"]` | yes | yes | no |
| 4 | button | Read route choices aloud | `div#panelBody > div.rg-results-head > button.rg-read[data-action="access-all-routes"]` | yes | yes | no |
| 5 | button | Route 1: 1 hour 2 minutes. Muni N train, then BART Blue line | `ul.itineraries.rg-routes > li.rg-route-item > button.itinerary.rg-route[data-action="it-toggle"]` | yes | yes | no |
| 6 | button | Listen to route 1 stop by stop | `li.rg-route-item > div.rg-route-actions.has-start > button.button.secondary[data-action="access-route"]` | yes | yes | no |
| 7 | button | Start route 1 | `li.rg-route-item > div.rg-route-actions.has-start > button.button.primary[data-action="nav-start"]` | yes | yes | no |
| 8 | button | Walk 260 ft | `li.rg-tl-row.seg-walk > span.rg-tl-body > button.leg-link[data-action="leg-focus"]` | yes | yes | no |
| 9 | button | Judah/La Playa/Ocean Beach | `li.rg-tl-row.seg-ride > span.rg-tl-body > button.leg-link[data-action="leg-focus"]` | yes | yes | no |
| 10 | button | Walk 180 ft | `li.rg-tl-row.seg-walk > span.rg-tl-body > button.leg-link[data-action="leg-focus"]` | yes | yes | no |
| 11 | button | Civic Center / UN Plaza | `li.rg-tl-row.seg-ride > span.rg-tl-body > button.leg-link[data-action="leg-focus"]` | yes | yes | no |
| 12 | button | Walk 70 ft | `li.rg-tl-row.seg-walk > span.rg-tl-body > button.leg-link[data-action="leg-focus"]` | yes | yes | no |

### trip

| # | Role | Accessible name | Selector | In view | Focus ring | Under dock |
|---|---|---|---|---|---|---|
| 1 | link | Skip to transit information | `html > body.rove-accessible > a.skip-link` | yes | yes | no |
| 2 | button | End trip | `div.rg-nav > div.rg-top > button.rg-end[data-action="rg-end"]` | yes | yes | no |
| 3 | button | I'm at Judah/La Playa/Ocean Beach | `div.rg-nav > div.rg-dock > button.rg-confirm[data-action="rg-confirm"]` | yes | yes | no |
| 4 | button | Repeat | `div.rg-dock > div.rg-dock-row > button.rg-secondary[data-action="rg-repeat"]` | yes | yes | no |
| 5 | button | Help | `div.rg-dock > div.rg-dock-row > button.rg-secondary[data-action="rg-help"]` | yes | yes | no |


## Keyboard-only Tab order (1440)

### home

| # | Role | Accessible name | Selector | In view | Focus ring | Under dock |
|---|---|---|---|---|---|---|
| 1 | link | Skip to transit information | `html > body.rove-accessible > a.skip-link` | yes | yes | no |
| 2 | region | Map | `div#map > div.maplibregl-canvas-container.maplibregl-interactive > canvas.maplibregl-canvas` | yes | yes | no |
| 3 | DisclosureTriangle | Toggle attribution | `div.maplibregl-ctrl-bottom-left > details.maplibregl-ctrl.maplibregl-ctrl-attrib > summary.maplibregl-ctrl-attrib-button` | yes | yes | no |
| 4 | link | OpenFreeMap | `details.maplibregl-ctrl.maplibregl-ctrl-attrib > div.maplibregl-ctrl-attrib-inner > a` | yes | yes | no |
| 5 | link | © OpenMapTiles | `details.maplibregl-ctrl.maplibregl-ctrl-attrib > div.maplibregl-ctrl-attrib-inner > a` | yes | yes | no |
| 6 | link | OpenStreetMap | `details.maplibregl-ctrl.maplibregl-ctrl-attrib > div.maplibregl-ctrl-attrib-inner > a` | yes | yes | no |
| 7 | button | More options | `button#menuButton` | yes | yes | no |
| 8 | button | Speak destination | `div.rg-home > div.rg-stack.rg-hero > button.rg-primary.rg-speak[data-action="voice-destination"]` | yes | yes | no |
| 9 | button | Type a destination | `div.rg-home > div.rg-stack.rg-hero > button.rg-field[data-action="plan"]` | yes | yes | no |
| 10 | button | Try the demo journey . A simulated trip with a transfer | `div.rg-home > nav.rg-links > button.rg-link[data-action="demo"]` | yes | yes | no |
| 11 | button | Nearby stops . Uses your location | `div.rg-home > nav.rg-links > button.rg-link[data-action="access-nearby"]` | yes | yes | no |
| 12 | button | Voice and accessibility . Rove voice, vibration, how it work | `div.rg-home > nav.rg-links > button.rg-link[data-action="access"]` | yes | yes | no |
| 13 | button | Transit data . Sources and what is live | `div.rg-home > nav.rg-links > button.rg-link[data-action="sources"]` | yes | yes | no |
| 14 | button | Zoom in | `button#zoomIn` | yes | yes | no |
| 15 | button | Zoom out | `button#zoomOut` | yes | yes | no |
| 16 | button | Show my location | `button#locateButton` | yes | yes | no |
| 17 | button | Map layers | `button#layersButton` | yes | yes | no |

### plan

| # | Role | Accessible name | Selector | In view | Focus ring | Under dock |
|---|---|---|---|---|---|---|
| 1 | link | Skip to transit information | `html > body.rove-accessible > a.skip-link` | yes | yes | no |
| 2 | region | Map | `div#map > div.maplibregl-canvas-container.maplibregl-interactive > canvas.maplibregl-canvas` | yes | yes | no |
| 3 | DisclosureTriangle | Toggle attribution | `div.maplibregl-ctrl-bottom-left > details.maplibregl-ctrl.maplibregl-ctrl-attrib > summary.maplibregl-ctrl-attrib-button` | yes | yes | no |
| 4 | link | OpenFreeMap | `details.maplibregl-ctrl.maplibregl-ctrl-attrib > div.maplibregl-ctrl-attrib-inner > a` | yes | yes | no |
| 5 | link | © OpenMapTiles | `details.maplibregl-ctrl.maplibregl-ctrl-attrib > div.maplibregl-ctrl-attrib-inner > a` | yes | yes | no |
| 6 | link | OpenStreetMap | `details.maplibregl-ctrl.maplibregl-ctrl-attrib > div.maplibregl-ctrl-attrib-inner > a` | yes | yes | no |
| 7 | button | More options | `button#menuButton` | yes | yes | no |
| 8 | button | Back | `div#panelBody > div.view-head > button.back-button[data-action="back"]` | yes | yes | no |
| 9 | button | Speak destination | `div#panelBody > div.rg-voice-row > button.rg-mic[data-action="voice-destination"]` | yes | yes | no |
| 10 | combobox | FROM , STARTING POINT | `input#planFrom` | yes | **no** | no |
| 11 | combobox | TO , DESTINATION | `input#planTo` | yes | **no** | no |
| 12 | button | Back | `div#panelBody > div.view-head > button.back-button[data-action="back"]` | yes | yes | no |
| 13 | button | Speak destination | `div#panelBody > div.rg-voice-row > button.rg-mic[data-action="voice-destination"]` | yes | yes | no |
| 14 | combobox | FROM , STARTING POINT | `input#planFrom` | yes | **no** | no |
| 15 | combobox | TO , DESTINATION | `input#planTo` | yes | **no** | no |
| 16 | button | Back | `div#panelBody > div.view-head > button.back-button[data-action="back"]` | yes | yes | no |
| 17 | button | Speak destination | `div#panelBody > div.rg-voice-row > button.rg-mic[data-action="voice-destination"]` | yes | yes | no |
| 18 | combobox | FROM , STARTING POINT | `input#planFrom` | yes | **no** | no |
| 19 | combobox | TO , DESTINATION | `input#planTo` | yes | **no** | no |
| 20 | button | Back | `div#panelBody > div.view-head > button.back-button[data-action="back"]` | yes | yes | no |
| 21 | button | Speak destination | `div#panelBody > div.rg-voice-row > button.rg-mic[data-action="voice-destination"]` | yes | yes | no |
| 22 | combobox | FROM , STARTING POINT | `input#planFrom` | yes | **no** | no |
| 23 | combobox | TO , DESTINATION | `input#planTo` | yes | **no** | no |
| 24 | button | Swap starting point and destination | `form.plan-form.suggesting > div.plan-fields > button.swap-button[data-action="plan-swap"]` | yes | yes | no |
| 25 | button | Use my location Your browser will ask for permission | `ul.rows > li > button.row.result[data-action="plan-locate"]` | yes | yes | no |
| 26 | button | Choose on map Tap any point on the map | `ul.rows.plan-map-row > li > button.row.result[data-action="plan-map"]` | yes | yes | no |
| 27 | button | Zoom in | `button#zoomIn` | yes | yes | no |
| 28 | button | Zoom out | `button#zoomOut` | yes | yes | no |
| 29 | button | Show my location | `button#locateButton` | yes | yes | no |
| 30 | button | Map layers | `button#layersButton` | yes | yes | no |

### results

| # | Role | Accessible name | Selector | In view | Focus ring | Under dock |
|---|---|---|---|---|---|---|
| 1 | link | Skip to transit information | `html > body.rove-accessible > a.skip-link` | yes | yes | no |
| 2 | region | Map | `div#map > div.maplibregl-canvas-container.maplibregl-interactive > canvas.maplibregl-canvas` | yes | yes | no |
| 3 | DisclosureTriangle | Toggle attribution | `div.maplibregl-ctrl-bottom-left > details.maplibregl-ctrl.maplibregl-ctrl-attrib > summary.maplibregl-ctrl-attrib-button` | yes | yes | no |
| 4 | link | OpenFreeMap | `details.maplibregl-ctrl.maplibregl-ctrl-attrib > div.maplibregl-ctrl-attrib-inner > a` | yes | yes | no |
| 5 | link | © OpenMapTiles | `details.maplibregl-ctrl.maplibregl-ctrl-attrib > div.maplibregl-ctrl-attrib-inner > a` | yes | yes | no |
| 6 | link | OpenStreetMap | `details.maplibregl-ctrl.maplibregl-ctrl-attrib > div.maplibregl-ctrl-attrib-inner > a` | yes | yes | no |
| 7 | button | More options | `button#menuButton` | yes | yes | no |
| 8 | button | Back | `div#panelBody > div.view-head > button.back-button[data-action="back"]` | yes | yes | no |
| 9 | button | Edit | `div#panelBody > div.trip-card.rg-trip > button.text-button.rg-trip-edit[data-action="back"]` | yes | yes | no |
| 10 | button | Read route choices aloud | `div#panelBody > div.rg-results-head > button.rg-read[data-action="access-all-routes"]` | yes | yes | no |
| 11 | button | Route 1: 1 hour 2 minutes. Muni N train, then BART Blue line | `ul.itineraries.rg-routes > li.rg-route-item > button.itinerary.rg-route[data-action="it-toggle"]` | yes | yes | no |
| 12 | button | Listen to route 1 stop by stop | `li.rg-route-item > div.rg-route-actions.has-start > button.button.secondary[data-action="access-route"]` | yes | yes | no |
| 13 | button | Start route 1 | `li.rg-route-item > div.rg-route-actions.has-start > button.button.primary[data-action="nav-start"]` | yes | yes | no |
| 14 | button | Walk 260 ft | `li.rg-tl-row.seg-walk > span.rg-tl-body > button.leg-link[data-action="leg-focus"]` | yes | yes | no |
| 15 | button | Judah/La Playa/Ocean Beach | `li.rg-tl-row.seg-ride > span.rg-tl-body > button.leg-link[data-action="leg-focus"]` | yes | yes | no |
| 16 | button | Walk 180 ft | `li.rg-tl-row.seg-walk > span.rg-tl-body > button.leg-link[data-action="leg-focus"]` | yes | yes | no |
| 17 | button | Civic Center / UN Plaza | `li.rg-tl-row.seg-ride > span.rg-tl-body > button.leg-link[data-action="leg-focus"]` | yes | yes | no |
| 18 | button | Walk 70 ft | `li.rg-tl-row.seg-walk > span.rg-tl-body > button.leg-link[data-action="leg-focus"]` | yes | yes | no |
| 19 | button | Zoom in | `button#zoomIn` | yes | yes | no |
| 20 | button | Zoom out | `button#zoomOut` | yes | yes | no |
| 21 | button | Show my location | `button#locateButton` | yes | yes | no |
| 22 | button | Map layers | `button#layersButton` | yes | yes | no |

### trip

| # | Role | Accessible name | Selector | In view | Focus ring | Under dock |
|---|---|---|---|---|---|---|
| 1 | link | Skip to transit information | `html > body.rove-accessible > a.skip-link` | yes | yes | no |
| 2 | region | Map | `div#map > div.maplibregl-canvas-container.maplibregl-interactive > canvas.maplibregl-canvas` | yes | yes | no |
| 3 | DisclosureTriangle | Toggle attribution | `div.maplibregl-ctrl-bottom-left > details.maplibregl-ctrl.maplibregl-ctrl-attrib > summary.maplibregl-ctrl-attrib-button` | yes | yes | no |
| 4 | link | OpenFreeMap | `details.maplibregl-ctrl.maplibregl-ctrl-attrib > div.maplibregl-ctrl-attrib-inner > a` | yes | yes | no |
| 5 | link | © OpenMapTiles | `details.maplibregl-ctrl.maplibregl-ctrl-attrib > div.maplibregl-ctrl-attrib-inner > a` | yes | yes | no |
| 6 | link | OpenStreetMap | `details.maplibregl-ctrl.maplibregl-ctrl-attrib > div.maplibregl-ctrl-attrib-inner > a` | yes | yes | no |
| 7 | button | More options | `button#menuButton` | yes | yes | no |
| 8 | button | End trip | `div.rg-nav > div.rg-top > button.rg-end[data-action="rg-end"]` | yes | yes | no |
| 9 | button | I'm at Judah/La Playa/Ocean Beach | `div.rg-nav > div.rg-dock > button.rg-confirm[data-action="rg-confirm"]` | yes | yes | no |
| 10 | button | Repeat | `div.rg-dock > div.rg-dock-row > button.rg-secondary[data-action="rg-repeat"]` | yes | yes | no |
| 11 | button | Help | `div.rg-dock > div.rg-dock-row > button.rg-secondary[data-action="rg-help"]` | yes | yes | no |
| 12 | button | Zoom in | `button#zoomIn` | yes | yes | no |
| 13 | button | Zoom out | `button#zoomOut` | yes | yes | no |
| 14 | button | Show my location | `button#locateButton` | yes | yes | no |
| 15 | button | Map layers | `button#layersButton` | yes | yes | no |


## Keyboard-only Tab order (390-classic)

### home

| # | Role | Accessible name | Selector | In view | Focus ring | Under dock |
|---|---|---|---|---|---|---|
| 1 | link | Skip to transit information | `html > body.rove-accessible > a.skip-link` | yes | yes | no |
| 2 | button | Speak destination | `div.rg-home > div.rg-stack.rg-hero > button.rg-primary.rg-speak[data-action="voice-destination"]` | yes | yes | no |
| 3 | button | Type a destination | `div.rg-home > div.rg-stack.rg-hero > button.rg-field[data-action="plan"]` | yes | yes | no |
| 4 | button | Try the demo journey . A simulated trip with a transfer | `div.rg-home > nav.rg-links > button.rg-link[data-action="demo"]` | yes | yes | no |
| 5 | button | Nearby stops . Uses your location | `div.rg-home > nav.rg-links > button.rg-link[data-action="access-nearby"]` | yes | yes | no |
| 6 | button | Voice and accessibility . Rove voice, vibration, how it work | `div.rg-home > nav.rg-links > button.rg-link[data-action="access"]` | yes | yes | no |
| 7 | button | Transit data . Sources and what is live | `div.rg-home > nav.rg-links > button.rg-link[data-action="sources"]` | yes | yes | no |

### plan

| # | Role | Accessible name | Selector | In view | Focus ring | Under dock |
|---|---|---|---|---|---|---|
| 1 | link | Skip to transit information | `html > body.rove-accessible > a.skip-link` | yes | yes | no |
| 2 | button | Back | `div#panelBody > div.view-head > button.back-button[data-action="back"]` | yes | yes | no |
| 3 | button | Speak destination | `div#panelBody > div.rg-voice-row > button.rg-mic[data-action="voice-destination"]` | yes | yes | no |
| 4 | combobox | FROM , STARTING POINT | `input#planFrom` | yes | **no** | no |
| 5 | combobox | TO , DESTINATION | `input#planTo` | yes | **no** | no |
| 6 | button | Back | `div#panelBody > div.view-head > button.back-button[data-action="back"]` | yes | yes | no |
| 7 | button | Speak destination | `div#panelBody > div.rg-voice-row > button.rg-mic[data-action="voice-destination"]` | yes | yes | no |
| 8 | combobox | FROM , STARTING POINT | `input#planFrom` | yes | **no** | no |
| 9 | combobox | TO , DESTINATION | `input#planTo` | yes | **no** | no |
| 10 | button | Back | `div#panelBody > div.view-head > button.back-button[data-action="back"]` | yes | yes | no |
| 11 | button | Speak destination | `div#panelBody > div.rg-voice-row > button.rg-mic[data-action="voice-destination"]` | yes | yes | no |
| 12 | combobox | FROM , STARTING POINT | `input#planFrom` | yes | **no** | no |
| 13 | combobox | TO , DESTINATION | `input#planTo` | yes | **no** | no |
| 14 | button | Back | `div#panelBody > div.view-head > button.back-button[data-action="back"]` | yes | yes | no |
| 15 | button | Speak destination | `div#panelBody > div.rg-voice-row > button.rg-mic[data-action="voice-destination"]` | yes | yes | no |
| 16 | combobox | FROM , STARTING POINT | `input#planFrom` | yes | **no** | no |
| 17 | combobox | TO , DESTINATION | `input#planTo` | yes | **no** | no |
| 18 | button | Back | `div#panelBody > div.view-head > button.back-button[data-action="back"]` | yes | yes | no |
| 19 | button | Speak destination | `div#panelBody > div.rg-voice-row > button.rg-mic[data-action="voice-destination"]` | yes | yes | no |
| 20 | combobox | FROM , STARTING POINT | `input#planFrom` | yes | **no** | no |
| 21 | combobox | TO , DESTINATION | `input#planTo` | yes | **no** | no |
| 22 | button | Back | `div#panelBody > div.view-head > button.back-button[data-action="back"]` | yes | yes | no |
| 23 | button | Speak destination | `div#panelBody > div.rg-voice-row > button.rg-mic[data-action="voice-destination"]` | yes | yes | no |
| 24 | combobox | FROM , STARTING POINT | `input#planFrom` | yes | **no** | no |
| 25 | combobox | TO , DESTINATION | `input#planTo` | yes | **no** | no |
| 26 | button | Back | `div#panelBody > div.view-head > button.back-button[data-action="back"]` | yes | yes | no |
| 27 | button | Speak destination | `div#panelBody > div.rg-voice-row > button.rg-mic[data-action="voice-destination"]` | yes | yes | no |
| 28 | combobox | FROM , STARTING POINT | `input#planFrom` | yes | **no** | no |
| 29 | combobox | TO , DESTINATION | `input#planTo` | yes | **no** | no |
| 30 | button | Swap starting point and destination | `form.plan-form.suggesting > div.plan-fields > button.swap-button[data-action="plan-swap"]` | yes | yes | no |
| 31 | button | Back | `div#panelBody > div.view-head > button.back-button[data-action="back"]` | yes | yes | no |
| 32 | button | Speak destination | `div#panelBody > div.rg-voice-row > button.rg-mic[data-action="voice-destination"]` | yes | yes | no |
| 33 | combobox | FROM , STARTING POINT | `input#planFrom` | yes | **no** | no |
| 34 | combobox | TO , DESTINATION | `input#planTo` | yes | **no** | no |
| 35 | button | Swap starting point and destination | `form.plan-form.suggesting > div.plan-fields > button.swap-button[data-action="plan-swap"]` | yes | yes | no |
| 36 | button | Use my location Your browser will ask for permission | `ul.rows > li > button.row.result[data-action="plan-locate"]` | yes | yes | no |

### results

| # | Role | Accessible name | Selector | In view | Focus ring | Under dock |
|---|---|---|---|---|---|---|
| 1 | link | Skip to transit information | `html > body.rove-accessible > a.skip-link` | yes | yes | no |
| 2 | button | Back | `div#panelBody > div.view-head > button.back-button[data-action="back"]` | yes | yes | no |
| 3 | button | Edit | `div#panelBody > div.trip-card.rg-trip > button.text-button.rg-trip-edit[data-action="back"]` | yes | yes | no |
| 4 | button | Read route choices aloud | `div#panelBody > div.rg-results-head > button.rg-read[data-action="access-all-routes"]` | yes | yes | no |
| 5 | button | Route 1: 1 hour 2 minutes. Muni N train, then BART Blue line | `ul.itineraries.rg-routes > li.rg-route-item > button.itinerary.rg-route[data-action="it-toggle"]` | yes | yes | no |
| 6 | button | Listen to route 1 stop by stop | `li.rg-route-item > div.rg-route-actions.has-start > button.button.secondary[data-action="access-route"]` | yes | yes | no |
| 7 | button | Start route 1 | `li.rg-route-item > div.rg-route-actions.has-start > button.button.primary[data-action="nav-start"]` | yes | yes | no |
| 8 | button | Walk 260 ft | `li.rg-tl-row.seg-walk > span.rg-tl-body > button.leg-link[data-action="leg-focus"]` | yes | yes | no |
| 9 | button | Judah/La Playa/Ocean Beach | `li.rg-tl-row.seg-ride > span.rg-tl-body > button.leg-link[data-action="leg-focus"]` | yes | yes | no |
| 10 | button | Walk 180 ft | `li.rg-tl-row.seg-walk > span.rg-tl-body > button.leg-link[data-action="leg-focus"]` | yes | yes | no |
| 11 | button | Civic Center / UN Plaza | `li.rg-tl-row.seg-ride > span.rg-tl-body > button.leg-link[data-action="leg-focus"]` | yes | yes | no |
| 12 | button | Walk 70 ft | `li.rg-tl-row.seg-walk > span.rg-tl-body > button.leg-link[data-action="leg-focus"]` | yes | yes | no |

### trip

| # | Role | Accessible name | Selector | In view | Focus ring | Under dock |
|---|---|---|---|---|---|---|
| 1 | link | Skip to transit information | `html > body.rove-accessible > a.skip-link` | yes | yes | no |
| 2 | button | End trip | `div.rg-nav > div.rg-top > button.rg-end[data-action="rg-end"]` | yes | yes | no |
| 3 | button | I'm at Judah/La Playa/Ocean Beach | `div.rg-nav > div.rg-dock > button.rg-confirm[data-action="rg-confirm"]` | yes | yes | no |
| 4 | button | Repeat | `div.rg-dock > div.rg-dock-row > button.rg-secondary[data-action="rg-repeat"]` | yes | yes | no |
| 5 | button | Help | `div.rg-dock > div.rg-dock-row > button.rg-secondary[data-action="rg-help"]` | yes | yes | no |

## Contrast issues (unique, most widespread first)

| Selector | Text | Ratio | Size/weight | WCAG fail | fg / bg | Seen in |
|---|---|---|---|---|---|---|
| `div#mapLoading > span` | Loading the Bay Area transit network | 4.22 | 15px/600 | **yes** | rgb(105, 120, 140) / rgb(244,248,252) | 3: 1024/home, 1440/home, 1920/home |

## Targets smaller than 44x44 (unique)

| Selector | Name | Size | Inline link | Seen in |
|---|---|---|---|---|
| `div.maplibregl-ctrl-bottom-left > details.maplibregl-ctrl.maplibregl-ctrl-attrib > summary.maplibregl-ctrl-attrib-button` | Toggle attribution | 24x48 | no | 72: 1024/home, 1024/plan-search, 1024/results-demo, 1024/trip-1… |
| `details.maplibregl-ctrl.maplibregl-ctrl-attrib > div.maplibregl-ctrl-attrib-inner > a` | OpenFreeMap | 76x16 | no | 72: 1024/home, 1024/plan-search, 1024/results-demo, 1024/trip-1… |

## Targets 44–47px (meet 44, miss 48)

| Selector | Name | Size | Seen in |
|---|---|---|---|
| `html > body.rove-accessible > a.skip-link` | Skip to transit information | 211x44 | 216: 320/home, 320/plan-search, 320/results-demo, 320/trip-1… |
| `button#menuButton` | More options | 44x48 | 84: 768/home, 768/plan-search, 768/results-demo, 768/trip-1… |
| `button#zoomIn` | Zoom in | 46x48 | 72: 1024/home, 1024/plan-search, 1024/results-demo, 1024/trip-1… |
| `button#zoomOut` | Zoom out | 46x48 | 72: 1024/home, 1024/plan-search, 1024/results-demo, 1024/trip-1… |
| `button#locateButton` | Show my location | 46x48 | 72: 1024/home, 1024/plan-search, 1024/results-demo, 1024/trip-1… |
| `button#layersButton` | Map layers | 46x48 | 72: 1024/home, 1024/plan-search, 1024/results-demo, 1024/trip-1… |

## Horizontal overflow offenders

None.

## Elements hidden under the dock after scrollIntoView

None.

## Console errors (unique)

- [console] Failed to load resource: net::ERR_CONNECTION_CLOSED — 1 scene(s)
