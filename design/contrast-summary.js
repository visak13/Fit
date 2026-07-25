/*
 * GENERATED FILE - DO NOT EDIT BY HAND.
 *
 * Written by design/build-contrast-summary.mjs out of design/contrast-report.json, which is
 * itself written by design/contrast.mjs. Every number below was computed and then copied by
 * machine. If you are tempted to correct one here, the correction belongs in the palette and
 * the measurement, not in the report of it.
 *
 * Regenerate:  node design/contrast.mjs && node design/build-contrast-summary.mjs
 */
window.CONTRAST_SUMMARY = {
  "generatedFrom": "design/contrast-report.json",
  "generatedByReport": "design/contrast.mjs",
  "command": "node design/contrast.mjs",
  "commandDirectory": "C:\\Projects\\Fit",
  "standard": "WCAG 2.2 SC 1.4.3 (contrast minimum) and SC 1.4.11 (non-text contrast)",
  "thresholds": {
    "text": 4.5,
    "large-text": 3,
    "non-text": 3,
    "informational": null
  },
  "totals": {
    "palettes": 3,
    "themes": 6,
    "evaluated": 444,
    "measured": 390,
    "passed": 390,
    "failed": 0,
    "informational": 54
  },
  "everyMeasuredPairPasses": true,
  "palettes": [
    {
      "id": "house-sepia",
      "direction": "ledger",
      "name": "Sepia and pure black",
      "summary": "A warm paper light theme and a pure-black dark theme. Low glare, warm rather than clinical, and the least tiring of the three over a long continuous session.",
      "measured": 130,
      "passed": 130,
      "failed": 0,
      "perTheme": {
        "light": {
          "measured": 65,
          "passed": 65
        },
        "dark": {
          "measured": 65,
          "passed": 65
        }
      },
      "tightest": {
        "ratio": 4.67,
        "threshold": 4.5,
        "theme": "light",
        "context": "text-warning read at body size on surface-selected",
        "foreground": "text-warning",
        "foregroundHex": "#835900",
        "background": "surface-selected",
        "backgroundHex": "#EADFC7"
      }
    },
    {
      "id": "slate-blue",
      "direction": "console",
      "name": "Cool slate and deep navy",
      "summary": "A cool, crisp light theme and a deep blue-charcoal dark theme. Reads as an instrument rather than as paper, and holds structure better when a screen is genuinely dense.",
      "measured": 130,
      "passed": 130,
      "failed": 0,
      "perTheme": {
        "light": {
          "measured": 65,
          "passed": 65
        },
        "dark": {
          "measured": 65,
          "passed": 65
        }
      },
      "tightest": {
        "ratio": 3.32,
        "threshold": 3,
        "theme": "light",
        "context": "line-control drawn against surface-selected",
        "foreground": "line-control",
        "foregroundHex": "#6C7A88",
        "background": "surface-selected",
        "backgroundHex": "#D8E1EB"
      }
    },
    {
      "id": "ink-neutral",
      "direction": "roster",
      "name": "Neutral ink with one accent",
      "summary": "Near-achromatic surfaces carrying a single strong accent. The highest tonal contrast of the three, so structure is read from edges and weight rather than from colour.",
      "measured": 130,
      "passed": 130,
      "failed": 0,
      "perTheme": {
        "light": {
          "measured": 65,
          "passed": 65
        },
        "dark": {
          "measured": 65,
          "passed": 65
        }
      },
      "tightest": {
        "ratio": 3.61,
        "threshold": 3,
        "theme": "light",
        "context": "line-control drawn against surface-selected",
        "foreground": "line-control",
        "foregroundHex": "#73716C",
        "background": "surface-selected",
        "backgroundHex": "#DEDEDA"
      }
    }
  ]
};
