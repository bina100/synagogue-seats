## תיקון: תחביר פקודת `read` של ימות המשיח

### הבעיה
Gemini צודק לגמרי. ב-`supabase/functions/yemot-ivr/index.ts` שורה 74 כתבתי:

```
read=t-<text>,1,extension,yes,,7
```

הסדר הזה שגוי. ימות המשיח מצפה ל:
```
read=t-<text>,<var-name>,<play-beep>,<max-digits>,<min-digits>,<timeout-sec>
```

כלומר:
- מקום 2 צריך להיות **שם המשתנה** (`ApiExtension`) — שמתי שם `1`
- מקום 3 צריך להיות **כן/לא לביפ** (`yes`) — שמתי שם `extension`
- מקום 4 צריך להיות **מקסימום ספרות** (`1`) — שמתי שם `yes`
- מקום 5 הוא **מינימום ספרות** (`1`) — השארתי ריק

בנוסף, שם המשתנה חייב להיות **`ApiExtension`** (לא `extension`) כדי שימות המשיח יחזיר אותו אלינו בקריאה הבאה תחת השם הזה — וככה הקוד שלי כבר קורא את זה (`params.get("ApiExtension")`).

### התיקון
שינוי שורה אחת ב-`supabase/functions/yemot-ivr/index.ts`, פונקציית `readDigit`:

```ts
// לפני
return `read=t-${safe},1,extension,yes,,7`;

// אחרי
return `read=t-${safe},ApiExtension,yes,1,1,7`;
```

### פריסה ובדיקה
1. פריסה מחדש של `yemot-ivr`.
2. בדיקה ב-curl לוודא שהתגובה החדשה תקינה: `read=t-...,ApiExtension,yes,1,1,7`.
3. שיחת בדיקה אמיתית מהטלפון — אמור לשמוע את התפריט ולהצליח להקיש 1/2/9.

### מה לא משתנה
- כל שאר הלוגיקה (זיהוי טלפון, חיפוש מתפלל, insert/delete ל-`absences`, אבטחת `ApiDID`).
- אין שינויים ב-DB, RLS, או בפרונטנד.
