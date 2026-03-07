

# תיקון RTL בפופאפים + הסרת הרשמה מדף כניסה

## 1. תיקון גלובלי ל-RTL בכל הדיאלוגים

### הבעיה
ב-`DialogHeader` של shadcn יש class קבוע: `sm:text-left` שדורס את כיווניות ה-RTL במסכים גדולים. גם אם מוסיפים `dir="rtl"` ו-`text-right` ל-`DialogContent`, הכותרת עדיין נדחפת שמאלה.

### הפתרון
תיקון חד-פעמי בקובץ `src/components/ui/dialog.tsx` - שינוי `sm:text-left` ל-`sm:text-right` ב-`DialogHeader`. זה יתקן את כל הפופאפים במערכת בבת אחת.

**קובץ: `src/components/ui/dialog.tsx` (שורה 55)**

| לפני | אחרי |
|---|---|
| `text-center sm:text-left` | `text-center sm:text-right` |

בנוסף, נוסיף `dir="rtl" className="text-right"` לכל `DialogContent` שעדיין חסר:
- `src/pages/SynagogueManage.tsx` - 3 דיאלוגים (שורות 164, 323, 477)
- `src/pages/Dashboard.tsx` - דיאלוג אחד (שורה 104)

## 2. הסרת הרשמה מדף כניסה

### קובץ: `src/pages/Auth.tsx`
- הסרת ה-state של `isLogin` ו-`fullName`
- הסרת ה-branch של signUp מ-handleSubmit
- הסרת שדה "שם מלא"
- הסרת כפתור "אין לך חשבון? הירשם כאן"
- הכותרת המשנית תהיה קבועה: "הכנס לחשבונך"
- הסרת import של `signUp` מ-useAuth

