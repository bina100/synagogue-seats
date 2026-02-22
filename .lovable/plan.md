

# Print Full Map Feature for AbsenceManager

## Overview

Add a print-optimized view that renders the entire seating map on a single A4 page with a header, scaled-down seats, and preserved colors.

## Changes

### 1. Update `src/index.css` - Add print-specific CSS

Add comprehensive `@media print` styles that:
- Hide header, navigation, buttons, cards (non-map elements) using `.no-print` class
- Force the map to fit A4 width using `transform: scale()` approach or `width: 100%` with smaller seat sizes
- Preserve colors with `print-color-adjust: exact; -webkit-print-color-adjust: exact`
- Show a print-only header div (`.print-header`) that is hidden on screen
- Make seats smaller (e.g., 40x40px) with slightly larger font (9px) for legibility on paper
- Remove all padding/margins from container to maximize space

### 2. Update `src/pages/AbsenceManager.tsx`

**Print header**: Add a hidden-on-screen div at the top of the page with class `print-header` that shows:
- "לוח היעדרויות ושיבוץ אורחים"
- Synagogue name (`synagogue?.name`)
- Shabbat date (`formatHebrewDate(shabbatDate)`)

**Print button**: Already exists (line 306-309). Keep it as-is calling `window.print()`.

**Mark non-map elements as `no-print`**: Add `no-print` class to:
- The Shabbat info card (personal action)
- The holidays card
- The Gabbai controls card
- The mark-for-other dialog
- The absence list card
- The section tab buttons
- The legend (or keep it visible for reference)

**Show ALL sections in print**: Currently only one section is shown at a time. For print, render ALL sections (loop through `sections` array) so the full map prints. Use a separate div with class `print-only` (hidden on screen, shown on print) that renders `AbsenceSeatingMap` for each section with a section title.

### 3. Update `AbsenceSeatingMap` component

Add `print-color-adjust: exact` inline or via class to seat buttons so colors survive printing. Add a `sectionName` prop to display section headers in print view.

## Technical Details

### Print CSS additions to `src/index.css`:

```css
@media print {
  /* Hide everything not needed */
  header, .no-print, [role="dialog"] {
    display: none !important;
  }
  
  body {
    background: white !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  
  .print-header {
    display: block !important;
    text-align: center;
    margin-bottom: 12px;
    border-bottom: 2px solid #333;
    padding-bottom: 8px;
  }
  
  .print-only {
    display: block !important;
  }
  
  /* Scale seats for print */
  .print-seat {
    width: 44px !important;
    height: 44px !important;
    font-size: 7px !important;
  }
  
  /* Ensure map fits A4 width */
  .print-map-container {
    width: 100% !important;
    overflow: visible !important;
  }
}
```

### Screen-only hiding:

```css
.print-header, .print-only {
  display: none;
}
```

### AbsenceManager changes:

- Add `print-header` div before the main content with synagogue name and date
- Add `no-print` class to all control cards
- Add a `print-only` div that loops through ALL sections and renders each `AbsenceSeatingMap`
- Keep the interactive single-section view as-is for screen

## Files to Change

| File | Change |
|---|---|
| `src/index.css` | Add print media styles, print-header/print-only classes |
| `src/pages/AbsenceManager.tsx` | Add print header, mark controls as no-print, render all sections for print |

