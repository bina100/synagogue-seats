

# שינוי מבנה ניווט לגבאי/מנהל

## מצב נוכחי
דף `SynagogueManage.tsx` מציג:
- 2 כפתורים אופקיים (מפת מקומות, היעדרויות)
- 3 טאבים (מתפללים, גבאים, מחלקות)

## המבנה החדש

### דף SynagogueManage - 3 כפתורים אנכיים בלבד
הדף יציג 3 כפתורים גדולים בצורה אנכית (עמודה אחת):
1. **היעדרויות ולוח בקרה** (CalendarOff) → `/synagogue/:id/absences`
2. **מפת מקומות ישיבה** (Armchair) → `/synagogue/:id/seating`
3. **הגדרות** (Settings) → `/synagogue/:id/settings` (דף חדש)

הסרת הטאבים (מתפללים, גבאים, מחלקות) מהדף הזה.

### דף חדש: Settings (`src/pages/SynagogueSettings.tsx`)
- יכיל את הטאבים **מתפללים** ו**גבאים** (העברת `MembersTab` ו-`GabbaisTab` מ-`SynagogueManage`)
- עיצוב זהה לקיים

### שינוי בדף SeatingMap
- הוספת כפתור **עריכת מפה** שמציג את ניהול המחלקות (`SectionsTab`) כדיאלוג או אזור מתקפל
- העברת `SectionsTab` לשם

### שינויים ב-App.tsx
- הוספת route חדש: `/synagogue/:id/settings` → `SynagogueSettings`

### קבצים שישתנו
| קובץ | שינוי |
|---|---|
| `src/pages/SynagogueManage.tsx` | החלפת התוכן ל-3 כפתורים אנכיים, הסרת טאבים |
| `src/pages/SynagogueSettings.tsx` | **חדש** - מתפללים + גבאים |
| `src/pages/SeatingMap.tsx` | הוספת כפתור "עריכת מפה" עם ניהול מחלקות |
| `src/App.tsx` | הוספת route ל-settings |

הכפתורים יהיו בסגנון cards גדולים עם אייקון, כותרת ותיאור קצר, בעמודה אנכית אחידה.

