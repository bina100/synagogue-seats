

# Fix Empty Cell Source Data and Gabbai Absence Indicator

## Changes

### 1. Edge Function: Mark blank cells as `element_type: 'empty'`

**File: `supabase/functions/import-seating-map/index.ts`** (line 292-296)

Currently, when a parsed seat has no name and no element_type (a blank cell), it gets inserted with `element_type: null`, making it indistinguishable from a real unassigned seat.

Fix: In the seat insertion block, if `seat.name` is null AND `seat.element_type` is null, set `element_type` to `'empty'`:

```typescript
// Line 292-296 change:
const isEmptyCell = !seat.name && !seat.element_type;
seatsToInsert.push({
  row_id: newRow.id,
  seat_number: idx + 1,
  assigned_to: assignedTo,
  element_type: isEmptyCell ? 'empty' : (seat.element_type || null),
});
```

Deploy the updated function.

### 2. Stats in AbsenceManager.tsx -- Already Correct

Line 506: `if (seat.element_type) return;` already skips ALL non-null element_types including `'empty'`, `'bima'`, `'aron_kodesh'`, `'amud'`. No change needed.

SeatingMap.tsx has no stats bar, so no change needed there either.

### 3. SeatCell.tsx: Show red dot for Gabbai too

**File: `src/components/seating/SeatCell.tsx`** (line 70-73)

Current code only shows the red absence dot when `isCurrentUser && isAbsent`. Change to show it whenever the seat is absent from either perspective:

```typescript
{/* Red dot for absent seat */}
{((isCurrentUser && isAbsent) || isAbsentForGabbai) && (
  <div className="absolute -top-1 -right-1 w-4 h-4 bg-red-600 rounded-full border-2 border-white z-10" />
)}
```

This ensures the Gabbai sees a red indicator on every absent seat, not just the current user's.

## Files to Change

| File | Change |
|---|---|
| `supabase/functions/import-seating-map/index.ts` | Set `element_type: 'empty'` for blank cells during import |
| `src/components/seating/SeatCell.tsx` | Show red absence dot for `isAbsentForGabbai` too, increase size to w-4/h-4 |

