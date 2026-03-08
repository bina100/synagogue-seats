

## Print CSS Rewrite — Final Plan

The Gemini suggestions are spot-on. Here's the refined plan:

### Changes to `src/index.css` — Complete rewrite of `@media print` block

**1. Page setup**
- `@page { size: A4 landscape; margin: 0; }`
- `.print-floor-plan` forced to `width: 297mm; height: 210mm; overflow: hidden;`

**2. CSS Grid for sections — fixed 7 columns, no wrapping**
- Override the flex container to `display: grid; grid-template-columns: repeat(7, 1fr); gap: 1mm;`
- Remove `min-w-max`, `flex`, `justify-center` overrides
- Hide section separators (the `w-px` dividers) — grid gap handles spacing

**3. Relative seat sizing — `max-width: 6.5mm`**
- `.print-seat`: `width: 100%; aspect-ratio: 1; max-width: 6.5mm; font-size: 5px;`
- Remove all fixed pixel width/height overrides
- Keep `print-color-adjust: exact`

**4. Cleanup**
- Hide nav, header, dialogs, `.no-print`
- Minimize Bima/Aron Kodesh sizing
- Seat rows: `display: flex; gap: 0.5mm; justify-content: center;`
- Print header banner kept with reduced sizing

### Single file changed
- **`src/index.css`** — rewrite the `@media print` block (~80 lines)

