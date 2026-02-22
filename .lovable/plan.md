

# Force Landscape Print Orientation

## Changes

### `src/index.css` - Update `@media print` section

Add `@page { size: landscape; margin: 10mm; }` at the top of the print block, and update `.print-map-container` to use flexbox for horizontal layout of sections.

**Specific changes (lines 133-179):**

1. Add `@page` directive right after `@media print {`:
```css
@page {
  size: landscape;
  margin: 10mm;
}
```

2. Update `.print-map-container` (line 166-170) to include flex layout:
```css
.print-map-container {
  display: flex !important;
  flex-wrap: wrap !important;
  flex-direction: row !important;
  gap: 20px !important;
  justify-content: center !important;
  width: 100% !important;
  overflow: visible !important;
  page-break-inside: avoid;
}
```

| File | Change |
|---|---|
| `src/index.css` | Add `@page { size: landscape; margin: 10mm; }` and update `.print-map-container` with flex layout |

