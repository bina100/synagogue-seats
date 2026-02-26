
# הוספת שדה טלפון למתפללים - כולל עריכת מתפללים קיימים

## סקירה
הוספת מספר טלפון לפרופיל המתפלל, כולל אפשרות לערוך מתפללים קיימים (לא רק חדשים). מספרי הטלפון יוצגו ב-LTR כדי שלא "יתהפכו" בממשק העברי.

## שינויים

### 1. מסד נתונים - הוספת עמודת phone
מיגרציה פשוטה:
```sql
ALTER TABLE profiles ADD COLUMN phone text;
```

### 2. Edge Function חדש - `update-member`
נדרש כי ה-RLS של טבלת `profiles` מאפשר לכל משתמש לעדכן רק את עצמו (`auth_id = auth.uid()`). הגבאי צריך לעדכן טלפון של מתפללים אחרים, לכן נשתמש ב-service role.

הפונקציה תקבל:
- `profile_id` - מזהה המתפלל
- `synagogue_id` - לוידוא הרשאות
- `phone` - מספר הטלפון

תבצע:
1. וידוא שהקורא הוא גבאי/מנהל של בית הכנסת
2. עדכון שדה `phone` ב-profiles דרך service role

### 3. Edge Function קיים - `add-member`
- הוספת `phone` ל-destructuring של הבקשה
- אחרי יצירת הפרופיל, עדכון הטלפון אם סופק

### 4. ממשק הגבאי - `SynagogueManage.tsx`

#### טפסי הוספה (מתפלל + גבאי)
- הוספת state של `phone` ושדה קלט "טלפון" בטפסים
- שליחת `phone` ל-edge function
- שדה הטלפון יהיה עם `dir="ltr"` ו-`text-left` כדי שהמספרים לא יתהפכו

#### עריכת מתפלל קיים (חדש!)
- הוספת כפתור עריכה (אייקון עיפרון) ליד כל מתפלל ברשימה
- לחיצה פותחת דיאלוג עריכה עם שדה טלפון (מאוכלס בערך הנוכחי)
- שמירה קוראת ל-edge function `update-member`
- אותו דבר גם בלשונית הגבאים

#### הצגה ברשימות
- הצגת מספר הטלפון מתחת לשם המשתמש בכל שורה
- מספר הטלפון מוצג ב-LTR: `<span dir="ltr" className="text-left">`

### 5. שאילתות נתונים
- עדכון ה-select queries לכלול `phone`:
  - מתפללים: `profiles(id, username, full_name, phone)`
  - גבאים: `profiles:user_id(id, username, full_name, phone)`

## פירוט טכני

| קובץ | שינוי |
|---|---|
| מיגרציה | `ALTER TABLE profiles ADD COLUMN phone text` |
| `supabase/functions/update-member/index.ts` | Edge function חדש לעדכון טלפון של מתפלל קיים |
| `supabase/functions/add-member/index.ts` | הוספת תמיכה בשדה phone |
| `src/pages/SynagogueManage.tsx` | שדה טלפון בטפסים, כפתור + דיאלוג עריכה, הצגת טלפון ברשימות |
