

# הוספת חיפוש לרשימות מתפללים + כיוון RTL לפופאפים

## סיכום

שני שינויים עיקריים:

1. **חיפוש ברשימת מתפללים** - החלפת ה-Select הרגיל ברכיב חיפוש (Combobox) בשני המקומות:
   - שיוך מתפלל למקום (SeatCell - דיאלוג גבאי)
   - סימון היעדרות למתפלל (AbsenceManager - דיאלוג "סמן היעדרות למתפלל")

2. **כיוון RTL לתוכן הפופאפים** - הוספת `dir="rtl"` ו-`text-right` לתוכן כל הדיאלוגים

## פירוט טכני

### רכיב חיפוש (Combobox)

במקום Select רגיל, נשתמש ברכיבי `Command` (cmdk) שכבר קיימים בפרויקט (`src/components/ui/command.tsx`) עם Popover. זה מאפשר הקלדת טקסט לסינון הרשימה.

מבנה הרכיב:
```text
Popover
  PopoverTrigger -> Button (מציג שם נבחר או placeholder)
  PopoverContent
    Command
      CommandInput (שדה חיפוש)
      CommandList
        CommandEmpty ("לא נמצאו תוצאות")
        CommandGroup
          CommandItem (לכל מתפלל)
```

### קבצים שישתנו

| קובץ | שינוי |
|---|---|
| `src/components/seating/SeatCell.tsx` | החלפת Select בשיוך מתפלל ברכיב Combobox עם חיפוש + הוספת `dir="rtl"` לכל DialogContent |
| `src/pages/AbsenceManager.tsx` | החלפת Select בדיאלוג "סמן היעדרות למתפלל" ברכיב Combobox עם חיפוש + הוספת `dir="rtl"` לכל DialogContent |

### שינויים ב-SeatCell.tsx

1. הוספת ייבוא: `Popover, PopoverContent, PopoverTrigger` + `Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem`
2. הוספת state: `searchOpen` לניהול פתיחת הרשימה
3. החלפת בלוק ה-Select (שורות 113-132) ברכיב Combobox שמאפשר חיפוש
4. הוספת `dir="rtl"` ו-`className="text-right"` לכל רכיבי DialogContent (שורה 88, 157)

### שינויים ב-AbsenceManager.tsx

1. הוספת ייבוא: `Popover, PopoverContent, PopoverTrigger` + `Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem`
2. הוספת state: `memberSearchOpen`
3. החלפת ה-Select בדיאלוג "סמן היעדרות למתפלל" (שורות 356-368) ברכיב Combobox
4. הוספת `dir="rtl"` לכל רכיבי DialogContent בדף (שורות 351, 572)

### כיוון RTL

כל `DialogContent` יקבל:
```text
<DialogContent dir="rtl" className="text-right">
```

זה יבטיח שכל התוכן בפופאפים (כותרות, טקסטים, כפתורים) מיושר מימין לשמאל כמו שמצופה בעברית.
