

# Fix "Mark for Other" Mutation + Perfect Print Map

## Issue 1: markOtherAbsentMutation missing seat_id

**Problem**: When the Gabbai uses the dropdown to mark a member absent (lines 205-224), the mutation inserts into `absences` without a `seat_id`. Since `absentSeatIds` (used for the red dot) checks by `seat_id`, no red icon appears on the map.

**Fix**: Change `markOtherAbsentMutation` to:
1. First query `seats` table for all seats where `assigned_to = profileId` within the current synagogue (join through `seat_rows` -> `sections`).
2. Insert one `absences` row per seat found, each with its specific `seat_id`.

**File: `src/pages/AbsenceManager.tsx`** (lines 205-224)

Replace the mutation function with:

```typescript
const markOtherAbsentMutation = useMutation({
  mutationFn: async (profileId: string) => {
    // Find all seats assigned to this profile in this synagogue
    const { data: seatRows } = await supabase
      .from("seat_rows")
      .select("id, sections!inner(synagogue_id)")
      .eq("sections.synagogue_id", synagogueId!);

    const rowIds = seatRows?.map((r: any) => r.id) || [];

    const { data: seats } = await supabase
      .from("seats")
      .select("id")
      .in("row_id", rowIds)
      .eq("assigned_to", profileId);

    if (!seats || seats.length === 0) {
      // Fallback: insert without seat_id (member has no assigned seats)
      const { error } = await supabase.from("absences").insert({
        profile_id: profileId,
        synagogue_id: synagogueId!,
        shabbat_date: shabbatDate,
        marked_by: myProfileId,
      });
      if (error) throw error;
      return;
    }

    // Insert one absence per seat
    const rows = seats.map((s: any) => ({
      profile_id: profileId,
      synagogue_id: synagogueId!,
      shabbat_date: shabbatDate,
      marked_by: myProfileId,
      seat_id: s.id,
    }));
    const { error } = await supabase.from("absences").insert(rows);
    if (error) throw error;
  },
  // ... onSuccess/onError unchanged
});
```

## Issue 2: Perfect Print Map (mirror of interactive map, no extras)

**Problem**: The print view currently shows "Row X" labels, stats bar ("X occupied, Y available"), Card headers, and legend text. The user wants ONLY the seat grid with names and absence indicators.

### Changes to `src/index.css` (print section):

Add rules to hide extra text in print:
- Hide the Card header/title and stats line: `.print-map-container .card-header, .print-map-container [class*="CardHeader"]`
- Hide row labels: target the "שורה X" spans
- Hide the legend div
- Add auto-scaling with `transform: scale()` and `transform-origin: top center`

```css
@media print {
  /* existing rules... */

  /* Hide stats, row labels, card headers in print */
  .print-map-container > div > div > .space-y-1 > .text-xs.text-muted-foreground {
    display: none !important;
  }

  /* Hide card header (stats bar) */
  .print-only .print-map-container [data-print-hide] {
    display: none !important;
  }

  /* Scale map to fit A4 */
  .print-only {
    width: 100%;
    transform-origin: top center;
  }
}
```

A cleaner approach: add `data-print-hide` attributes or `no-print` class to the stats and row labels inside `AbsenceSeatingMap`, and hide the legend in print.

### Changes to `src/pages/AbsenceManager.tsx`:

1. **Stats bar** (line 562-568): Wrap in `no-print` class.
2. **Card header** (line 562-568): Add `no-print` to the CardHeader containing "מפת מקומות" and stats.
3. **Row labels** (line 573): Add `no-print` to the "שורה X" span.
4. **Legend** (lines 431-444): Add `no-print` class.
5. **Card wrapper in AbsenceSeatingMap**: Remove Card/CardHeader/CardContent wrapping in print -- simplest approach is to add `no-print` to CardHeader and keep CardContent as-is.

Specific line changes:
- Line 431: Change `<div className="flex gap-4 ...">` to add `no-print`
- Line 562-568: Add `className="no-print"` to the CardHeader
- Line 573: Add `no-print` class to row label span

## Files to Change

| File | Change |
|---|---|
| `src/pages/AbsenceManager.tsx` | Fix `markOtherAbsentMutation` to fetch seats and include `seat_id`; add `no-print` to stats header, row labels, and legend |
| `src/index.css` | No additional changes needed (existing print rules sufficient once `no-print` is applied correctly) |

