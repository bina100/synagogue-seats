

# Print Full Seating Map Like Reference Image

## Overview

The SeatingMap page already renders all sections side-by-side in a unified floor plan. We need to make this print correctly by adding print-specific CSS, a print header/footer, and a print button.

## Reference Image Analysis

The reference shows:
- All columns (1-7) displayed horizontally, right-to-left
- Bima structural element rendered in the middle
- Compact seat cells with names
- Clean borderless look
- Title banner at the bottom: "מפת מקומות תשפ"ו" on a yellow/gold background
- No navigation, no legend, no buttons

## Changes

### 1. `src/pages/SeatingMap.tsx` - Add Print Button and Print-Only Footer

**Add a print button** in the actions bar (around line 344):
```tsx
<Button variant="outline" size="sm" className="gap-2 no-print" onClick={() => window.print()}>
  <Printer className="h-4 w-4" />
  הדפסה
</Button>
```

**Add print-only footer** after the Card (around line 518), with synagogue name:
```tsx
<div className="print-header">
  <h1 style={{ fontSize: '20px', fontWeight: 'bold', margin: 0 }}>
    מפת מקומות - {synagogue?.name || ""}
  </h1>
</div>
```

**Add `print-seat` class** to the seat button in `SeatCell.tsx` (line 54) so print CSS can target it for compact sizing.

### 2. `src/components/seating/SeatCell.tsx` - Add `print-seat` class

Add the `print-seat` class to the seat button element (line 54-66):
```tsx
<button
  className={`
    print-seat relative flex flex-col items-center justify-center
    w-14 h-14 sm:w-16 sm:h-16 rounded-md border text-xs font-medium transition-all
    ...
  `}
```

### 3. `src/index.css` - Update Print Styles

Update the `@media print` block to handle the SeatingMap floor plan layout:

```css
@media print {
  @page {
    size: landscape;
    margin: 10mm;
  }

  header, nav, .no-print, [role="dialog"] {
    display: none !important;
  }

  body {
    background: white !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    font-size: 10px;
  }

  .print-header {
    display: block !important;
    text-align: center;
    margin-top: 12px;
    border-top: 3px solid #c8a951;
    background: #f5e6a3;
    padding: 8px 16px;
    font-size: 20px;
  }

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
  .print-only .print-seat-row {
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

  /* The main floor plan card for SeatingMap */
  .print-floor-plan {
    border: none !important;
    box-shadow: none !important;
    zoom: 0.55;
  }

  .print-floor-plan .print-seat {
    width: 38px !important;
    height: 38px !important;
    font-size: 6.5px !important;
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
}
```

Key additions:
- `.print-floor-plan` class targets the SeatingMap Card to remove borders and scale it
- `.print-header` now styled with gold/yellow banner like the reference image
- `print-seat` compact sizing applies to SeatCell buttons

### 4. `src/pages/SeatingMap.tsx` - Add `print-floor-plan` Class to Card

The main Card wrapping the floor plan (line 419) gets a `print-floor-plan` class:
```tsx
<Card className="print-floor-plan">
```

This allows print CSS to remove borders/shadows and scale the entire floor plan.

## Files to Change

| File | Change |
|---|---|
| `src/pages/SeatingMap.tsx` | Add print button, print-header footer, `print-floor-plan` class on Card |
| `src/components/seating/SeatCell.tsx` | Add `print-seat` class to seat button |
| `src/index.css` | Add `.print-floor-plan` and gold banner `.print-header` print styles |
