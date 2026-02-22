

# UI Updates: Role-Based Visibility, Seat Highlighting, Full Names

## Changes

### 1. Role-Based UI in `SynagogueManage.tsx`

Currently `canManage` is `isSuperAdmin || false`. Need to also check gabbai role, and hide the management tabs (Members, Gabbais, Sections) from regular members.

- Import `useAuth` to get `roles` and check if user is a gabbai for this synagogue
- Update `canManage = isSuperAdmin || roles.some(r => r.role === 'gabbai' && r.synagogue_id === id)`
- Conditionally render the Tabs section only if `canManage` is true
- Regular members only see the two link buttons (Seating Map + Absences)

### 2. Highlight User's Own Seats in `SeatCell.tsx`

- Add `currentUserProfileId?: string` prop to `SeatCellProps`
- Check `seat.assigned_to === currentUserProfileId`
- If true, apply turquoise styling: `bg-teal-100 border-teal-500 text-teal-900 border-2 font-bold`
- Pass `profile?.id` from `SeatingMap.tsx` when rendering `SeatCell`

### 3. Highlight User's Own Seats in `AbsenceManager.tsx`

- Get `profile` from `useAuth()`
- In the seat rendering loop (line ~503), add check: `const isCurrentUser = seat.assigned_to === profile?.id`
- If `isCurrentUser`, override styling to turquoise (same classes as above), taking priority over absent/present colors

### 4. Show Full Names on Seats

**`SeatCell.tsx` (line 57-61):**
- Change `assignedProfile?.full_name?.split(" ")[0]` to `assignedProfile?.full_name`
- Update span classes: remove `truncate max-w-[40px]`, add `text-[8px] leading-tight text-center whitespace-normal break-words max-w-[44px]`
- Increase button size slightly: `w-14 h-14 sm:w-16 sm:h-16`

**`AbsenceManager.tsx` (line 528-531):**
- Change `assignedName?.split(" ")[0]` to `assignedName`
- Update span classes similarly for full name display

## Files to Change

| File | Change |
|---|---|
| `src/pages/SynagogueManage.tsx` | Check gabbai role for `canManage`; hide tabs for regular members |
| `src/components/seating/SeatCell.tsx` | Add `currentUserProfileId` prop; turquoise highlight for own seat; show full name |
| `src/pages/SeatingMap.tsx` | Pass `profile?.id` to `SeatCell` |
| `src/pages/AbsenceManager.tsx` | Turquoise highlight for own seat; show full name |

