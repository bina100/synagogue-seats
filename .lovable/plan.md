

# תיקון: גבאים ומנהלים מועברים בטעות למפת המקומות

## הבעיה

יש מרוץ תזמון (race condition): כשמשתמש מתחבר, ה-`loading` מסתיים **לפני** שהתפקידים (`roles`) נטענו מהמסד. בזמן הזה `roles` הוא מערך ריק `[]`, מה שגורם ל-`isRegularMember` להחזיר `true` לכולם - גם למנהלים וגם לגבאים. התוצאה: כולם מועברים למפת המקומות.

## הפתרון

שני שינויים:

### 1. קובץ `src/hooks/useAuth.tsx`
- לא לסמן `loading = false` עד שגם הפרופיל **וגם** התפקידים נטענו
- להעביר את `setLoading(false)` לתוך `fetchProfile` (אחרי שגם roles נטענו), במקום לקרוא לו מיד אחרי קבלת ה-session

### 2. קובץ `src/pages/Dashboard.tsx`
- להוסיף בדיקה שהפרופיל נטען לפני שמפעילים את לוגיקת ההפניה
- לשנות את התנאי ל: `if (!profile) return;` לפני ההפניה, כדי לוודא שהתפקידים כבר נטענו

## פירוט טכני

### `src/hooks/useAuth.tsx`

**שינוי ב-fetchProfile** - להעביר את `setLoading(false)` לסוף הפונקציה:

```text
const fetchProfile = async (authId: string) => {
  const { data } = await supabase
    .from("profiles")
    .select("id, username, full_name, requires_password_change")
    .eq("auth_id", authId)
    .single();
  if (data) {
    setProfile(data);
    const { data: rolesData } = await supabase
      .from("user_roles")
      .select("role, synagogue_id")
      .eq("user_id", data.id);
    setRoles(rolesData || []);
  }
  setLoading(false);  // <-- העברה לכאן
};
```

**שינוי ב-onAuthStateChange** - להסיר את `setLoading(false)` מהמקום הנוכחי (שורה 60), ולהשאיר אותו רק ב-else (כשאין session):

```text
async (_event, session) => {
  setSession(session);
  setUser(session?.user ?? null);
  if (session?.user) {
    await fetchProfile(session.user.id);  // בלי setTimeout, ו-loading ייסגר בתוך fetchProfile
  } else {
    setProfile(null);
    setRoles([]);
    setLoading(false);  // רק כשאין משתמש
  }
}
```

**שינוי ב-getSession** - אותו דבר:

```text
supabase.auth.getSession().then(async ({ data: { session } }) => {
  setSession(session);
  setUser(session?.user ?? null);
  if (session?.user) {
    await fetchProfile(session.user.id);  // loading ייסגר בפנים
  } else {
    setLoading(false);
  }
});
```

### `src/pages/Dashboard.tsx`

הוספת בדיקת profile בתנאי ההפניה:

```text
useEffect(() => {
  if (isLoading || !synagogues || !profile) return;
  if (isRegularMember && synagogues.length > 0) {
    navigate(`/synagogue/${synagogues[0].id}/seating`, { replace: true });
  }
}, [isLoading, synagogues, isRegularMember, navigate, profile]);
```

השינויים האלו מבטיחים שההפניה תתבצע **רק** אחרי שהתפקידים נטענו, כך שגבאים ומנהלים יישארו בדף הראשי.
