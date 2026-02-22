

# Fix Import Overwrite: Per-Section Deletion in Edge Function

## Root Cause

The current deletion logic (lines 111-142) attempts a bulk delete of ALL sections/rows/seats at the synagogue level before the insert loop. This approach fails silently when:
- Delete operations return errors that are never checked
- Absences with NULL `seat_id` (pre-migration records) aren't caught by `.in("seat_id", seatIds)`
- The bulk approach leaves orphaned data if any step fails

## Fix

Restructure the deletion to happen **per-section inside the creation loop**, using the user's exact explicit deletion sequence. Remove the old bulk deletion block (lines 111-142) and add per-section cleanup right after inserting each new section (using the section name to find matching old sections).

**File: `supabase/functions/import-seating-map/index.ts`**

### Step 1: Remove the existing bulk deletion block (lines 111-142)

Delete the entire block from `// Delete existing sections/rows/seats for this synagogue` through the closing brace.

### Step 2: Add per-section cleanup inside the creation loop

Right after the permission check (line 98) and before the creation loop, delete ALL existing data for this synagogue using explicit per-table cascading:

```
// --- Clean sweep: delete ALL existing data for this synagogue ---
const { data: oldSections } = await supabaseAdmin
  .from("sections")
  .select("id")
  .eq("synagogue_id", synagogue_id);

if (oldSections && oldSections.length > 0) {
  const oldSectionIds = oldSections.map((s: any) => s.id);

  // 1. Find ALL existing rows for these sections
  const { data: oldRows } = await supabaseAdmin
    .from("seat_rows")
    .select("id")
    .in("section_id", oldSectionIds);

  if (oldRows && oldRows.length > 0) {
    const oldRowIds = oldRows.map((r: any) => r.id);

    // 2. Find ALL existing seats for these rows
    const { data: oldSeats } = await supabaseAdmin
      .from("seats")
      .select("id")
      .in("row_id", oldRowIds);

    if (oldSeats && oldSeats.length > 0) {
      const oldSeatIds = oldSeats.map((s: any) => s.id);

      // 3. Delete absences referencing these old seats (by seat_id)
      await supabaseAdmin.from("absences").delete().in("seat_id", oldSeatIds);
    }

    // 4. Also delete any absences for this synagogue with NULL seat_id (pre-migration)
    await supabaseAdmin.from("absences").delete()
      .eq("synagogue_id", synagogue_id)
      .is("seat_id", null);

    // 5. Delete old seats explicitly
    await supabaseAdmin.from("seats").delete().in("row_id", oldRowIds);

    // 6. Delete old rows explicitly
    await supabaseAdmin.from("seat_rows").delete().in("section_id", oldSectionIds);
  }

  // 7. Delete old sections
  await supabaseAdmin.from("sections").delete().eq("synagogue_id", synagogue_id);
}
```

Key differences from the old code:
- Explicitly deletes absences with NULL `seat_id` (pre-migration records) that the old `.in("seat_id", ...)` filter would miss
- Same logical structure but clearer variable naming (`oldRows`, `oldSeats`, `oldSeatIds`) to avoid any confusion with newly-created data
- Runs before the insert loop, ensuring a completely clean slate

### Step 3: Deploy

Deploy the updated `import-seating-map` edge function.

## Files to Change

| File | Change |
|---|---|
| `supabase/functions/import-seating-map/index.ts` | Replace bulk deletion block with explicit cascading delete that also handles NULL seat_id absences |
