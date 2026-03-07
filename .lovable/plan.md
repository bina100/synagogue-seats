

# תיקון בעיית הטעינה האינסופית

## הבעיה שזוהתה

מהסקירה של הקוד, הלוגים, וצילום המסך, זיהיתי את הבעיה המדויקת:

בקובץ `useAuth.tsx`, ה-callback של `onAuthStateChange` משתמש ב-`await` על `fetchProfile`. זה **חוסם את ה-callback** ומונע מ-Supabase לסיים את תהליך האימות. התוצאה:
- הפרופיל לא נטען (רואים "שלום," בלי שם)
- שאילתות Supabase נוספות (כמו רשימת בתי כנסת) נתקעות כי ה-client במצב לא תקין
- מסך "טוען..." נשאר לנצח

צילום המסך מאשר: הכותרת מציגה "שלום," (בלי שם) והתוכן תקוע על "טוען..."

## הפתרון

### קובץ: `src/hooks/useAuth.tsx`

שינוי אחד קריטי: **להסיר את `await`** מקריאות `fetchProfile` בתוך `onAuthStateChange` ו-`getSession`. הפונקציה `fetchProfile` כבר מטפלת ב-`setLoading(false)` ב-`finally`, אז אין צורך לחכות לה.

**לפני:**
```typescript
async (_event, session) => {
  ...
  if (session?.user) {
    await fetchProfile(session.user.id);  // ← חוסם!
  }
```

**אחרי:**
```typescript
(_event, session) => {
  ...
  if (session?.user) {
    fetchProfile(session.user.id);  // ← לא חוסם
  }
```

אותו שינוי גם ב-`getSession().then()` - להסיר `async/await` ולתת ל-`fetchProfile` לרוץ ברקע.

זה שינוי של שורות בודדות שפותר את שלוש הבעיות בבת אחת.

