
# Fix Print Layout: Unified Container, Page-Break Prevention, and Scaling

## Overview

The print layout is breaking sections across pages because each `.print-map-container` div can trigger page breaks, and the `.print-only` container uses `display: block` instead of flex. Four changes are needed.

## Changes

### 1. `src/pages/AbsenceManager.tsx` - Unified Print Container (line 440)

Change the `.print-only` wrapper to use inline flex styles so all sections flow horizontally in one block:

```tsx
<div className="print-only" style={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: '20px', justifyContent: 'center' }}>
```

This ensures all sections are siblings in a single flex row, wrapping as needed.

### 2. `src/index.css` - Update `.print-only` rule (line 158-160)

Change from `display: block` to `display: flex` with row wrapping and add scaling:

```css
.print-only {
  display: flex !important;
  flex-direction: row !important;
  flex-wrap: wrap !important;
  gap: 20px !important;
  justify-content: center !important;
  width: 100% !important;
  overflow: visible !important;
  zoom: 0.7;
}
```

### 3. `src/index.css` - Aggressive page-break prevention (add after `.print-only`)

```css
.print-only *,
.print-only section,
.print-only .print-map-container {
  break-inside: avoid !important;
  page-break-inside: avoid !important;
}

.print-only * {
  break-before: auto !important;
  break-after: auto !important;
}
```

### 4. `src/index.css` - Keep `.print-map-container` but remove redundant page-break

The `.print-map-container` rule (line 171-180) stays but the `page-break-inside: avoid` is now covered by the wildcard rule above. No change needed here as the aggressive rule covers it.

## Summary of file changes

| File | Lines | Change |
|---|---|---|
| `src/index.css` | 158-160 | Change `.print-only` from `display: block` to flex layout with `zoom: 0.7` |
| `src/index.css` | After 160 | Add aggressive page-break prevention rules for `.print-only *` |
| `src/pages/AbsenceManager.tsx` | 440 | Add inline flex styles to `.print-only` div for unified container |
