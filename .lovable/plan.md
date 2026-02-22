

# Fix Print Layout: Unified Grid on Single Page

## Problem

The print output breaks individual seat rows/columns across pages because:
- The `Card` wrapper inside `.print-map-container` adds padding/structure that triggers page breaks
- The seat rows use `flex-wrap` which can split across pages
- The zoom factor (0.7) may not be aggressive enough for large maps
- The `break-inside: avoid` on wildcard `*` conflicts with the need for the container itself to stay unified

## Changes

### 1. `src/index.css` - Overhaul print rules (lines 158-199)

Replace the current `.print-only`, page-break, and `.print-map-container` rules with:

```css
.print-only {
  display: flex !important;
  flex-direction: row !important;
  flex-wrap: wrap !important;
  gap: 20px !important;
  justify-content: center !important;
  width: 100vw !important;
  overflow: visible !important;
  zoom: 0.55;
}

/* Each section block must not split */
.print-only .print-map-container {
  break-inside: avoid !important;
  page-break-inside: avoid !important;
  break-before: auto !important;
  break-after: auto !important;
  flex-shrink: 0;
}

/* Remove all forced breaks from children */
.print-only * {
  break-before: auto !important;
  break-after: auto !important;
}

/* Card inside print should be borderless and compact */
.print-only .print-map-container > div {
  border: none !important;
  box-shadow: none !important;
  padding: 0 !important;
}

/* Rows must stay horizontal */
.print-only .flex.flex-wrap {
  flex-wrap: nowrap !important;
  gap: 2px !important;
}

/* Compact seats for print */
.print-seat {
  width: 40px !important;
  height: 40px !important;
  font-size: 7px !important;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

/* Hide section title if only one section */
.print-only .print-map-container:only-child .print-section-title {
  display: none !important;
}

/* Section titles should not force page breaks */
.print-section-title {
  page-break-before: auto !important;
  page-break-after: auto !important;
  font-size: 12px;
  font-weight: bold;
  text-align: center;
  margin: 4px 0;
  border-bottom: 1px solid #ccc;
  padding-bottom: 2px;
}
```

Key differences from current:
- `width: 100vw` instead of `100%` to use full page width
- `zoom: 0.55` (more aggressive shrink) to fit large maps
- Seat rows set to `flex-wrap: nowrap` so columns stay inline (mirrors screen view)
- Smaller seats (40px instead of 44px) and gaps (2px instead of 1.5) for compactness
- Card borders/shadows removed in print for clean look
- Section titles don't force page breaks; hidden when only one section

### 2. `src/pages/AbsenceManager.tsx` - Line 601

Change the row flex container to use a print-specific class so the CSS rule can target it precisely. Add `print-seat-row` class:

```tsx
<div className="flex flex-wrap gap-1.5 justify-center print-seat-row">
```

Then in CSS, target `.print-seat-row` instead of `.flex.flex-wrap`:

```css
.print-only .print-seat-row {
  flex-wrap: nowrap !important;
  gap: 2px !important;
}
```

This is cleaner than targeting generic `.flex.flex-wrap`.

## Files to Change

| File | Change |
|---|---|
| `src/index.css` | Replace print rules (lines 158-199) with unified grid, aggressive scaling, nowrap rows, compact seats |
| `src/pages/AbsenceManager.tsx` | Add `print-seat-row` class to seat row container (line 601) |
