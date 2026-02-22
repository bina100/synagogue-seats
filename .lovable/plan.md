

# Interactive Absence Reporting from Seating Map

## Overview
Remove the Absences tab for regular members and let them report absences by clicking their own turquoise seat directly on the seating map. This creates a much simpler UX where regular members only interact with a single page.

## Changes

### 1. Hide Absences Button for Regular Members (`SynagogueManage.tsx`)

Wrap the "Absences" link/button (lines 55-60) in a `{canManage && ...}` conditional, so only gabbais and super admins see it. Regular members will only see the "Seating Map" button.

### 2. Make User's Own Seat Clickable for Absence Reporting (`SeatCell.tsx`)

Currently, the seat button is `disabled={!canManage}` -- regular members can't click anything. The changes:

- Accept new props: `isAbsent` (boolean), `onToggleAbsence` (callback), `synagogueId` (string)
- Change `disabled` logic: allow clicking if `isCurrentUser` (even if not canManage)
- When `isCurrentUser` and not `canManage`, clicking opens an absence dialog instead of the admin assign dialog
- The absence dialog shows two states:
  - **Present (not absent)**: Title "Report Absence", button "I'm not coming" -- inserts into `absences`
  - **Absent**: Title "Cancel Absence", button "I'm coming (cancel)" -- deletes from `absences`
- Add a small red dot indicator on the turquoise seat when the user is marked absent

### 3. Fetch Absence Data and Wire Up Mutations (`SeatingMap.tsx`)

- Import `getNextShabbat` utility (copy the function from AbsenceManager or extract it)
- Add a query to fetch the current user's absence for the upcoming Shabbat:
  ```
  SELECT * FROM absences 
  WHERE profile_id = profile.id 
  AND synagogue_id = synagogueId 
  AND shabbat_date = nextShabbat
  ```
- Add insert/delete mutations for absences
- Pass `isAbsent` and `onToggleAbsence` to `SeatCell`
- Invalidate the absence query on success and show a toast

### 4. Visual Indicator on Absent Seat

When the user's own seat is marked absent, add a small red dot (absolute positioned) in the top-right corner of the turquoise seat button, so the user can see at a glance that their absence is registered.

## Technical Details

### SeatCell.tsx - Updated Props Interface
```text
interface SeatCellProps {
  seat: any;
  members: any[];
  canManage: boolean;
  onAssign: (seatId: string, profileId: string | null) => void;
  currentUserProfileId?: string;
  isAbsent?: boolean;
  onToggleAbsence?: () => void;
}
```

### SeatCell.tsx - Button disabled logic change
```text
// Old: disabled={!canManage}
// New: disabled={!canManage && !isCurrentUser}
```

### SeatCell.tsx - Dialog rendering logic
```text
// If canManage -> show admin assign dialog (existing)
// Else if isCurrentUser -> show absence toggle dialog (new)
```

### SeatCell.tsx - Absence dialog content
```text
Dialog State 1 (Present):
  Title: "דיווח היעדרות"
  Description: "האם ברצונך לעדכן את הגבאי שאינך מגיע השבת / בחג הקרוב? המקום שלך יסומן כפנוי לאורחים."
  Button: "כן, איני מגיע"

Dialog State 2 (Absent):
  Title: "ביטול היעדרות"
  Description: "סימנת שאינך מגיע השבת. האם ברצונך לבטל את ההיעדרות?"
  Button: "אני מגיע (בטל היעדרות)"
```

### SeatingMap.tsx - getNextShabbat function
Copy the `getNextShabbat()` helper from AbsenceManager.tsx (lines 37-44).

### SeatingMap.tsx - Absence query
```text
queryKey: ["my_absence", synagogueId, profile?.id, nextShabbat]
Query: absences table where profile_id = profile.id, synagogue_id, shabbat_date = nextShabbat
```

### SeatingMap.tsx - Mutations
```text
Insert absence: { profile_id, synagogue_id, shabbat_date }
Delete absence: delete where profile_id + synagogue_id + shabbat_date match
Both invalidate the absence query on success
```

### Red dot indicator (CSS)
```text
{isCurrentUser && isAbsent && (
  <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-red-500 border-2 border-white" />
)}
```

### SynagogueManage.tsx - Line 55-60 change
```text
{canManage && (
  <Link to={`/synagogue/${id}/absences`} className="flex-1">
    <Button ...>היעדרויות ולוח בקרה</Button>
  </Link>
)}
```

## Files to Change

| File | Change |
|---|---|
| `src/pages/SynagogueManage.tsx` | Wrap absences link in `canManage` conditional |
| `src/components/seating/SeatCell.tsx` | Add absence dialog for own seat, red dot indicator, updated disabled logic |
| `src/pages/SeatingMap.tsx` | Add getNextShabbat, absence query, insert/delete mutations, pass props to SeatCell |

