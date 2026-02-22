

# Fix Integration Bugs: Import, Sync, Gabbai Controls, Empty Cells

## 1. Fix Import Overwrite (Edge Function)

The import function already attempts to delete existing data (lines 111-131), but it will **fail silently** now because the new `seat_id` foreign key on `absences` prevents deleting seats that have absence records pointing to them. The fix: delete absences for the synagogue's seats before deleting the seats themselves.

**File: `supabase/functions/import-seating-map/index.ts`**

Add before the seats delete (line 126):

```text
// Delete absences referencing these seats
const { data: existingSeats } = await supabaseAdmin
  .from("seats")
  .select("id")
  .in("row_id", rowIds);
if (existingSeats?.length) {
  const seatIds = existingSeats.map((s: any) => s.id);
  await supabaseAdmin.from("absences").delete().in("seat_id", seatIds);
}
```

This ensures the cascade: absences -> seats -> seat_rows -> sections.

## 2. Fix Absence State Synchronization

**File: `src/pages/SeatingMap.tsx`**

Both mutations (insert line 142, delete line 163) currently invalidate only `["my_absences", synagogueId]`. Change both to **also** invalidate the broader `["absences"]` query key so the Gabbai's `AbsenceManager` view refreshes:

```text
onSuccess: () => {
  queryClient.invalidateQueries({ queryKey: ["my_absences", synagogueId] });
  queryClient.invalidateQueries({ queryKey: ["absences"] });
  toast({ ... });
}
```

The `getNextShabbat()` functions are already identical between both files -- no change needed there.

## 3. Unify Gabbai Controls in SeatCell.tsx (Main Map)

**File: `src/components/seating/SeatCell.tsx`**

Add new props:
- `isAbsentForGabbai?: boolean` -- whether this seat is absent (from gabbai's perspective, checking all seats not just current user's)
- `onToggleGabbaiAbsence?: () => void` -- callback for gabbai to toggle absence on any assigned seat
- `shabbatDate?: string` -- for display text

In the `canManage` dialog (lines 82-131), after the existing assign/remove section, add a new section (only if `isAssigned`):

```text
{/* Shabbat Absence section (only for assigned seats) */}
{isAssigned && (
  <div className="space-y-2 border-t pt-3">
    <Label>היעדרות לשבת</Label>
    {isAbsentForGabbai ? (
      <Button variant="outline" className="w-full gap-2 border-success text-success"
        onClick={() => { onToggleGabbaiAbsence?.(); setOpen(false); }}>
        <CheckCircle2 /> בטל היעדרות למקום זה
      </Button>
    ) : (
      <Button variant="outline" className="w-full gap-2 border-destructive text-destructive"
        onClick={() => { onToggleGabbaiAbsence?.(); setOpen(false); }}>
        <CalendarOff /> סמן כפנוי לשבת
      </Button>
    )}
  </div>
)}
```

Import `CalendarOff` and `CheckCircle2` from lucide-react.

**File: `src/pages/SeatingMap.tsx`**

Fetch ALL absences for the synagogue (not just current user's) so gabbai can see which seats are absent:

```text
const { data: allAbsences } = useQuery({
  queryKey: ["absences", synagogueId, nextShabbat],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("absences")
      .select("id, seat_id, profile_id")
      .eq("synagogue_id", synagogueId!)
      .eq("shabbat_date", nextShabbat);
    if (error) throw error;
    return data;
  },
  enabled: !!synagogueId && canManage,
});
const allAbsentSeatIds = new Set((allAbsences ?? []).map(a => a.seat_id).filter(Boolean));
```

Add gabbai mutations (mark/cancel for any seat):

```text
const markGabbaiAbsenceMutation = useMutation({
  mutationFn: async ({ seatId, profileId }: { seatId: string; profileId: string }) => {
    await supabase.from("absences").insert({
      profile_id: profileId,
      synagogue_id: synagogueId!,
      shabbat_date: nextShabbat,
      seat_id: seatId,
      marked_by: profile!.id,
    } as any);
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["absences"] });
    toast({ title: "סטטוס המקום עודכן" });
  },
});

const cancelGabbaiAbsenceMutation = useMutation({
  mutationFn: async ({ seatId, profileId }: { seatId: string; profileId: string }) => {
    await supabase.from("absences").delete()
      .eq("seat_id", seatId)
      .eq("synagogue_id", synagogueId!)
      .eq("shabbat_date", nextShabbat);
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["absences"] });
    toast({ title: "סטטוס המקום עודכן" });
  },
});
```

Add `handleToggleGabbaiAbsence`:

```text
const handleToggleGabbaiAbsence = useCallback((seatId: string, profileId: string) => {
  if (allAbsentSeatIds.has(seatId)) {
    cancelGabbaiAbsenceMutation.mutate({ seatId, profileId });
  } else {
    markGabbaiAbsenceMutation.mutate({ seatId, profileId });
  }
}, [allAbsentSeatIds, ...]);
```

Pass to SeatCell:

```text
<SeatCell
  ...existing props...
  isAbsentForGabbai={canManage && seat.assigned_to ? allAbsentSeatIds.has(seat.id) : undefined}
  onToggleGabbaiAbsence={canManage && seat.assigned_to
    ? () => handleToggleGabbaiAbsence(seat.id, seat.assigned_to)
    : undefined}
/>
```

## 4. Empty Cells in AbsenceManager

Already fixed in lines 551-553 of `AbsenceManager.tsx`. The empty cells render as invisible spacers. No further changes needed here.

## Files to Change

| File | Change |
|---|---|
| `supabase/functions/import-seating-map/index.ts` | Delete absences referencing seats before deleting seats |
| `src/pages/SeatingMap.tsx` | Broader query invalidation; fetch all absences for gabbai; gabbai absence mutations; pass new props to SeatCell |
| `src/components/seating/SeatCell.tsx` | Add gabbai absence toggle section in admin dialog; new props |

