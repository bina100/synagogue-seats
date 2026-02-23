

# חילוץ פונקציות תאריכים עבריים לקובץ עזר משותף (DRY)

## מה ישתנה

במקום לכפול את לוגיקת חישוב התאריכים העבריים בשני דפים שונים, ניצור קובץ עזר אחד שישרת את שניהם. בנוסף, נוסיף פונקציה חדשה לחישוב "תווית השבת/חג הקרוב" (shabbatLabel) לשימוש בפופאפ של המתפלל.

## קובץ חדש

### `src/lib/hebrewDates.ts`
קובץ עזר שמרכז את כל הפונקציות הקשורות לתאריכים עבריים:

- `getNextShabbat()` - תאריך שבת הקרובה (כבר קיימת בשני קבצים)
- `getUpcomingHolidays()` - חגים ב-30 יום הקרובים (כבר קיימת ב-AbsenceManager)
- `formatHebrewDate()` - עיצוב תאריך עברי (כבר קיימת ב-AbsenceManager)
- `getNextEventLabel()` - **חדשה** - מחזירה תווית כמו "שבת פרשת וירא (כ"ב חשוון תשפ"ו)" או "סוכות (ט"ו תשרי תשפ"ו)" אם חג קודם לשבת

## קבצים שישתנו

| קובץ | שינוי |
|---|---|
| `src/lib/hebrewDates.ts` | **חדש** - קובץ עזר עם כל פונקציות התאריכים העבריים + פונקציה חדשה `getNextEventLabel` |
| `src/pages/SeatingMap.tsx` | הסרת `getNextShabbat` המקומית, ייבוא מ-`hebrewDates`, שימוש ב-`getNextEventLabel` והעברת `shabbatLabel` ל-SeatCell |
| `src/pages/AbsenceManager.tsx` | הסרת `getNextShabbat`, `getUpcomingHolidays`, `formatHebrewDate` המקומיות, ייבוא מ-`hebrewDates`, העברת `shabbatLabel` ל-SeatCell |
| `src/components/seating/SeatCell.tsx` | הוספת prop `shabbatLabel?: string` והכנסתו לטקסט הפופאפ של מתפלל רגיל |

## פירוט הפונקציה החדשה `getNextEventLabel`

```text
1. בודקת אם יש חג לפני שבת הקרובה (getUpcomingHolidays)
2. אם כן -> מחזירה "סוכות (ט"ו תשרי תשפ"ו)"
3. אם לא -> מחשבת את פרשת השבוע באמצעות HebrewCalendar.calendar
4. מחזירה "שבת פרשת וירא (כ"ב חשוון תשפ"ו)"
```

## דוגמה לפופאפ המעודכן (SeatCell)

### שחרור מקום:
> המקום יסומן כ"פנוי" **לשבת פרשת וירא (כ"ב חשוון תשפ"ו)** במפת הגבאי ויתאפשר שיבוץ אורחים. האם להמשיך?

### ביטול שחרור:
> המקום יסומן מחדש כ"תפוס" **לשבת פרשת וירא (כ"ב חשוון תשפ"ו)** במפת הגבאי ולא יתאפשר שיבוץ אורחים. האם להמשיך?

