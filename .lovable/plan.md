

## תגובה להערות של Gemini

קראתי את הקוד הקיים בפועל לפני שעדכנתי את התוכנית. הנה ההתייחסות לכל הערה:

### הערה 1 (ארכיטקטורה): **שגויה** ❌

Gemini טעה. **אין** עמודה `is_absent` בטבלת `seats` במערכת שלך. בדקתי גם את הקוד וגם את סכמת ה-DB:

- טבלת `seats` מכילה: `id, row_id, seat_number, assigned_to, element_type, created_at` — **אין `is_absent`**.
- כל מנגנון ההיעדרויות במערכת (`SeatingMap.tsx`, `AbsenceManager.tsx`, edge function `reset-absences`) עובד **אך ורק** דרך טבלת `absences`, עם `insert`/`delete` לפי `shabbat_date`.
- המפה של הגבאי **כבר קוראת מטבלת `absences`** (`allAbsentSeatIds` ב-`SeatingMap.tsx` שורות 150-163) — אז insert לטבלה הזו **כן** יעדכן את המפה.

המסקנה: התוכנית המקורית שלי נכונה — חייבים להשתמש ב-`absences`. אם נשנה ל-`seats.is_absent` נשבור את המודל הקיים (שכולל איפוס שבועי, היסטוריה, סימון לפי תאריך, ו-RLS).

### הערה 2 (משתני סביבה): **צודקת** ✅

Gemini צודק כאן — אין סיבה לחכות. אכתוב את ה-Edge Function מיד תוך שימוש ב-`Deno.env.get("YEMOT_TOKEN")`. הפונקציה תעבוד מהרגע שתכניס את ה-secret דרך הממשק. רק שים לב: כדי להירשם בפועל למספר טלפון פעיל בימות המשיח, **כן** תצטרך חשבון, אבל זה לא חוסם את כתיבת הקוד.

### תוכנית מעודכנת

**1. צור Edge Function `yemot-ivr` עכשיו** (ללא `verify_jwt`, נטפל בולידציה בקוד):
- מקבלת query params מימות המשיח: `ApiPhone`, `ApiExtension`, `ApiCallId`, `ApiDID`
- שלב א' (אין `ApiExtension`): נורמל הטלפון של המתקשר → חיפוש ב-`profiles.phone` → זיהוי `synagogue_id` ו-`seat_id` (דרך `synagogue_members` ו-`seats.assigned_to = profile.id`) → תגובה קולית: "שלום [שם], לדיווח היעדרות לשבת הקרובה הקש 1, לביטול הקש 2"
- שלב ב' (`ApiExtension=1`): `INSERT` ל-`absences` עם service role (אותה לוגיקה כמו `markGabbaiAbsenceMutation` ב-`SeatingMap.tsx`) → תגובה: "היעדרותך נרשמה לשבת [תאריך]"
- שלב ב' (`ApiExtension=2`): `DELETE` מ-`absences` → תגובה: "ההיעדרות בוטלה"
- טלפון לא מזוהה → "המספר לא נמצא, פנה לגבאי"
- ריבוי בתי כנסת → תפריט בחירה

**2. נרמול טלפון** — פונקציה שמטפלת ב-`0501234567`, `+972501234567`, `972501234567`, רווחים ומקפים.

**3. פורמט תגובה לימות המשיח** — מחרוזת בפורמט שלהם, למשל:
```
id_list_message=t-שלום [שם], להקלטת היעדרות הקש 1.&read=t,1,extension,yes,,1
```
(אאמת את הפורמט המדויק במהלך הכתיבה לפי תיעוד ימות המשיח.)

**4. אבטחה**: ולידציה ש-`ApiDID` תואם למספר המערכת המוגדר ב-secret נוסף `YEMOT_DID` (אופציונלי), כדי שלא כל אחד יוכל להזעיק את ה-endpoint.

**5. Secret עתידי**: `YEMOT_TOKEN` ו-`YEMOT_DID` יבוקשו ממך בנפרד ב-default mode כשנגיע לפריסה — הקוד עצמו מוכן מראש.

### מה ישתנה
- **חדש**: `supabase/functions/yemot-ivr/index.ts`
- **ללא שינוי**: DB, RLS, frontend, edge functions אחרות

### הצעדים אחרי ההטמעה
- אתה תספק לי URL של ה-Edge Function (שיהיה `https://ywtdvuaxvpqrhoazpqwx.supabase.co/functions/v1/yemot-ivr`)
- תגדיר אותו כ-webhook במערכת ימות המשיח אחרי שתפתח חשבון
- נבדוק יחד עם curl לפני שיחה אמיתית

