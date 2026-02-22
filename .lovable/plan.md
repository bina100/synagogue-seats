
# Phase 3: ייבוא אקסל + יצירת משתמשים אוטומטית + כפיית שינוי סיסמה

## סקירה

שדרוג מלא של תהליך ייבוא האקסל: כל שם שלא קיים במערכת ייצור אוטומטית חשבון משתמש עם סיסמת ברירת מחדל, ובכניסה הראשונה המשתמש יידרש לשנות סיסמה.

## שינויים

### 1. Migration -- הוספת עמודה `requires_password_change` לטבלת `profiles`

```sql
ALTER TABLE profiles ADD COLUMN requires_password_change boolean NOT NULL DEFAULT false;
```

### 2. שכתוב Edge Function `import-seating-map`

הלוגיקה המעודכנת לכל שם שלא נמצא ב-profiles:

```text
1. cleanedName = cellValue.trim().replace(/\s+/g, " ")
2. email = cleanedName.replace(/\s/g, "_") + "@synagogue.local"
   (זהה בדיוק לפרונט-אנד -- תומך בעברית)
3. password = "123456"
4. admin.createUser({ email, password, email_confirm: true, user_metadata: { username: cleanedName, full_name: cleanedName } })
5. מיד אחרי -- INSERT ישיר ל-profiles:
   INSERT INTO profiles (auth_id, username, full_name, requires_password_change)
   VALUES (authData.user.id, cleanedName, cleanedName, true)
   ON CONFLICT (auth_id) DO UPDATE SET requires_password_change = true
6. קבלת profile.id מתוצאת ה-upsert
7. upsert ל-synagogue_members
8. upsert ל-user_roles (role: member)
9. שיוך ל-seat
```

ה-stats יחזיר:
```text
{
  sections, rows, seats, matched,
  createdUsers: [{ fullName, username, password }],
  failed: [{ name, error }]
}
```

### 3. עדכון `src/pages/SeatingMap.tsx`

לאחר ייבוא מוצלח:
- אם `stats.createdUsers.length > 0`, הצגת דיאלוג עם טבלה: שם מלא | שם משתמש | סיסמה
- כפתור "הורד CSV" שמייצר קובץ עם הפרטים להפצה

### 4. רכיב חדש `src/components/ForcePasswordChange.tsx`

- מודאל שלא ניתן לסגור (ללא X, ללא סגירה בלחיצה בחוץ)
- שדות: סיסמה חדשה + אישור סיסמה
- בלחיצה על "שמור":
  1. `supabase.auth.updateUser({ password: newPassword })`
  2. עדכון `profiles.requires_password_change = false`

### 5. עדכון `src/hooks/useAuth.tsx`

- הוספת `requires_password_change: boolean` ל-interface `Profile`
- שליפת השדה ב-`fetchProfile`

### 6. עדכון `src/components/AppLayout.tsx`

- import של `ForcePasswordChange`
- הצגת המודאל כאשר `profile?.requires_password_change === true`

## קבצים

| קובץ | פעולה |
|---|---|
| Migration SQL | הוספת `requires_password_change` |
| `supabase/functions/import-seating-map/index.ts` | שכתוב מלא עם יצירת משתמשים מיידית |
| `src/pages/SeatingMap.tsx` | דיאלוג תוצאות ייבוא + הורדת CSV |
| `src/components/ForcePasswordChange.tsx` | רכיב חדש |
| `src/hooks/useAuth.tsx` | הוספת שדה לפרופיל |
| `src/components/AppLayout.tsx` | שילוב מודאל כפיית סיסמה |
