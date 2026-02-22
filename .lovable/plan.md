

# DB Migration + Full seat_id Precision for Absences

## Database Migration

Add `seat_id` column to `absences` table and update the unique constraint:

```text
ALTER TABLE absences ADD COLUMN seat_id uuid REFERENCES seats(id);
ALTER TABLE absences DROP CONSTRAINT absences_profile_id_synagogue_id_shabbat_date_key;
ALTER TABLE absences ADD CONSTRAINT absences_profile_seat_date_key UNIQUE (profile_id, synagogue_id, shabbat_date, seat_id);
```

## Frontend Changes

### 1. `src/pages/SeatingMap.tsx` -- Per-seat absence queries and mutations

**Absence query (lines 99-114):** Change from fetching a single absence record to fetching ALL absence records for this user/synagogue/shabbat, including `seat_id`:

```text
const { data: myAbsences } = useQuery({
  queryKey: ["my_absences", synagogueId, profile?.id, nextShabbat],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("absences")
      .select("id, seat_id")
      .eq("profile_id", profile!.id)
      .eq("synagogue_id", synagogueId!)
      .eq("shabbat_date", nextShabbat);
    if (error) throw error;
    return data;
  },
  enabled: !!synagogueId && !!profile?.id,
});
const absentSeatIds = new Set(myAbsences?.map(a => a.seat_id) || []);
```

**Insert mutation (lines 132-149):** Accept `seatId: string` parameter, include `seat_id`:

```text
mutationFn: async (seatId: string) => {
  await supabase.from("absences").insert({
    profile_id: profile!.id,
    synagogue_id: synagogueId!,
    shabbat_date: nextShabbat,
    seat_id: seatId,
  });
}
```

**Delete mutation (lines 151-169):** Accept `seatId: string`, filter by `seat_id`:

```text
mutationFn: async (seatId: string) => {
  await supabase.from("absences").delete()
    .eq("profile_id", profile!.id)
    .eq("synagogue_id", synagogueId!)
    .eq("shabbat_date", nextShabbat)
    .eq("seat_id", seatId);
}
```

Both mutations invalidate `["my_absences", synagogueId]`.

**handleToggleAbsence (lines 178-184):** Accept `seatId: string`:

```text
const handleToggleAbsence = useCallback((seatId: string) => {
  if (absentSeatIds.has(seatId)) {
    deleteAbsenceMutation.mutate(seatId);
  } else {
    insertAbsenceMutation.mutate(seatId);
  }
}, [absentSeatIds, ...]);
```

**SeatCell rendering (lines 429-439):** Pass per-seat props:

```text
isAbsent={seat.assigned_to === profile?.id ? absentSeatIds.has(seat.id) : undefined}
onToggleAbsence={seat.assigned_to === profile?.id ? () => handleToggleAbsence(seat.id) : undefined}
```

### 2. `src/components/seating/SeatCell.tsx` -- Empty cell rendering

Add early return for `element_type === 'empty'` before the existing structural element check (before line 36):

```text
if (seat.element_type === 'empty') {
  return <div className="w-14 h-14 sm:w-16 sm:h-16 pointer-events-none" />;
}
```

### 3. `src/pages/AbsenceManager.tsx` -- Full seat_id precision + Gabbai per-seat toggle + empty cells

**Absences query (lines 127-139):** Also select `seat_id`:

```text
.select("*, profiles:profile_id(id, full_name, username), seat_id")
```

**Replace `absentProfileIds` with `absentSeatIds` (lines 155-158):**

```text
const absentSeatIds = useMemo(
  () => new Set(absences?.map((a) => a.seat_id).filter(Boolean) || []),
  [absences]
);
```

**Update parent-level `iAmAbsent` check (line 161):** Remove or keep for the top card -- but since absences are now per-seat, this check no longer makes sense for a single toggle. Remove the "I'm absent" card for now (the user uses the seating map instead), OR keep it but note it's approximate. Simplest: keep the card but base it on whether the user has ANY absence:

```text
const iAmAbsent = absences?.some(a => a.profile_id === myProfileId) || false;
```

**Pass `shabbatDate` and `absentSeatIds` to `AbsenceSeatingMap` (line 389-394):**

```text
<AbsenceSeatingMap
  sectionId={activeSectionId}
  synagogueId={synagogueId!}
  absentSeatIds={absentSeatIds}
  currentUserProfileId={myProfileId}
  shabbatDate={shabbatDate}
/>
```

**Update AbsenceSeatingMap props (lines 420-429):** Replace `absentProfileIds: Set<string>` with `absentSeatIds: Set<string>` and add `shabbatDate: string`.

**Add mutations inside AbsenceSeatingMap:**

```text
const queryClient = useQueryClient();
const { toast } = useToast();

const markSeatAbsentMutation = useMutation({
  mutationFn: async (seat: any) => {
    const { error } = await supabase.from("absences").insert({
      profile_id: seat.assigned_to,
      synagogue_id: synagogueId,
      shabbat_date: shabbatDate,
      seat_id: seat.id,
      marked_by: currentUserProfileId,
    });
    if (error) throw error;
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["absences", synagogueId, shabbatDate] });
    setSelectedSeat(null);
    toast({ title: "סטטוס המקום עודכן" });
  },
  onError: (e: Error) => {
    toast({ title: "שגיאה", description: e.message, variant: "destructive" });
  },
});

const cancelSeatAbsenceMutation = useMutation({
  mutationFn: async (seat: any) => {
    const { error } = await supabase.from("absences").delete()
      .eq("profile_id", seat.assigned_to)
      .eq("synagogue_id", synagogueId)
      .eq("shabbat_date", shabbatDate)
      .eq("seat_id", seat.id);
    if (error) throw error;
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["absences", synagogueId, shabbatDate] });
    setSelectedSeat(null);
    toast({ title: "סטטוס המקום עודכן" });
  },
});
```

**Stats calculation (lines 453-468):** Skip elements and use `absentSeatIds`:

```text
row.seats?.forEach((seat: any) => {
  if (seat.element_type) return; // skip structural/empty
  total++;
  if (!seat.assigned_to) {
    unassigned++;
  } else if (absentSeatIds.has(seat.id)) {
    available++;
  } else {
    occupied++;
  }
});
```

**Seat rendering (lines 501-548):** Add empty cell check, use `absentSeatIds.has(seat.id)`:

```text
// At top of map callback:
if (seat.element_type === 'empty') {
  return <div key={seat.id} className="w-14 h-14 pointer-events-none" />;
}
if (seat.element_type) return null; // skip other structural

// Change line 503:
const isAbsent = isAssigned && absentSeatIds.has(seat.id);
```

**Selected seat dialog (lines 553-593):** Use `absentSeatIds.has(selectedSeat.id)` instead of `absentProfileIds.has(selectedSeat.assigned_to)`. Add toggle button:

```text
{selectedSeat.profiles && (
  <div className="pt-2">
    {absentSeatIds.has(selectedSeat.id) ? (
      <Button
        variant="outline"
        className="w-full gap-2 border-success text-success"
        onClick={() => cancelSeatAbsenceMutation.mutate(selectedSeat)}
        disabled={cancelSeatAbsenceMutation.isPending}
      >
        <CheckCircle2 className="h-4 w-4" />
        בטל היעדרות למקום זה
      </Button>
    ) : (
      <Button
        variant="outline"
        className="w-full gap-2 border-destructive text-destructive"
        onClick={() => markSeatAbsentMutation.mutate(selectedSeat)}
        disabled={markSeatAbsentMutation.isPending}
      >
        <CalendarOff className="h-4 w-4" />
        סמן מקום זה כפנוי (נעדר)
      </Button>
    )}
  </div>
)}
```

**SeatingMap.tsx display filter (line 419-421):** Allow `empty` through:

```text
const displaySeats = row.seats?.filter(
  (s: any) => !s.element_type || s.element_type === "amud" || s.element_type === "empty"
) || [];
```

## Files to Change

| File | Change |
|---|---|
| Database migration | Add `seat_id` column, update unique constraint |
| `src/components/seating/SeatCell.tsx` | Render `empty` elements as invisible spacers |
| `src/pages/SeatingMap.tsx` | Per-seat absence query/mutations using `absentSeatIds`; allow empty elements in display filter |
| `src/pages/AbsenceManager.tsx` | Switch to `absentSeatIds`; add Gabbai per-seat toggle in dialog; skip empty/structural in stats; render empty as spacers |

