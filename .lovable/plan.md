

# תיקון גלילה אוטומטית למקום המשתמש

## הבעיה

הגלילה לא עובדת בגלל בעיית תזמון: כשהנתונים של המפה נטענים, יכול להיות שהפרופיל של המשתמש (`profile?.id`) עדיין לא מוכן. במצב כזה, אף מקום לא מקבל את ה-ref, ולכן הגלילה לא מופעלת.

בנוסף, בדיקת `hasScrolled.current` בזמן הרינדור לא אמינה כי שינוי ב-ref לא גורם לרינדור מחדש.

## הפתרון

שינוי אחד בקובץ `src/pages/SeatingMap.tsx`:

1. **הוספת `profile?.id` ל-dependency array של ה-useEffect** - כך האפקט ירוץ גם כשהפרופיל נטען
2. **שימוש ב-callback ref במקום `useRef`** - כך ברגע שהאלמנט נוצר ב-DOM, הגלילה מופעלת מיידית בלי תלות ב-useEffect
3. **הסרת ה-useEffect** שהיה אחראי על הגלילה - כי ה-callback ref מטפל בזה בעצמו

### הגישה: callback ref

במקום `useRef` + `useEffect`, נשתמש ב-callback ref שמופעל ברגע שהאלמנט מתחבר ל-DOM:

```typescript
const hasScrolled = useRef(false);
const userSeatCallbackRef = useCallback((node: HTMLButtonElement | null) => {
  if (node && !hasScrolled.current) {
    hasScrolled.current = true;
    setTimeout(() => {
      node.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    }, 300);
  }
}, []);
```

ב-SeatCell נעביר את ה-callback ref דרך ה-prop `myRef` (נשנה את הטיפוס לתמוך גם ב-callback ref).

### שינויים טכניים

| קובץ | שינוי |
|---|---|
| `src/pages/SeatingMap.tsx` | החלפת useRef+useEffect ב-callback ref שמפעיל scrollIntoView ברגע שהאלמנט מתחבר ל-DOM |
| `src/components/seating/SeatCell.tsx` | שינוי טיפוס `myRef` לתמיכה גם ב-callback ref (`Ref<HTMLButtonElement>`) |

