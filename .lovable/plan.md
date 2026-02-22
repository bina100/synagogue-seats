

# Fix: Display Failed User Errors + Add Edge Function Debug Logs

## Changes

### 1. Edge Function (`supabase/functions/import-seating-map/index.ts`)

Add `console.log` debug statements at three key points:
- Before `createUser`: log cleanedName and email
- After `createUser`: log user ID or error message
- After profile upsert: log profile ID or error message

The existing code structure is already correct (try/catch, profileMap dedup, onConflict). The only addition is logging for debugging.

### 2. Frontend (`src/pages/SeatingMap.tsx`)

- Add `failedUsers` state: `useState<{ name: string; error: string }[]>([])`
- Update `handleImport` (lines 151-158): set `failedUsers` from `stats.failed`, open the results dialog if either `createdUsers` or `failed` has items
- Rename dialog state from `showCreatedUsers` to serve both created and failed users
- Update the results dialog (lines 412-444): add a red/warning section below the success table showing each failed name and its exact error message

### Technical Details

**Edge Function logging additions (3 lines):**
```text
Line ~181: console.log("Attempting to create user:", cleanedName, "email:", email);
Line ~195: console.log("createUser result:", authData?.user?.id, "error:", createErr?.message);
Line ~214: console.log("profile upsert result:", profileData?.id, "error:", profileErr?.message);
```

**Frontend dialog update:**
- Success section (green): shown when `createdUsers.length > 0` with table + CSV download
- Error section (red): shown when `failedUsers.length > 0` with name + exact error message
- Dialog title dynamically shows counts for both

### Files

| File | Change |
|---|---|
| `supabase/functions/import-seating-map/index.ts` | Add 3 console.log debug lines |
| `src/pages/SeatingMap.tsx` | Add failedUsers state, update dialog trigger, add error section in dialog |

