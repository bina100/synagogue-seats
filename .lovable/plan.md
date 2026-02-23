
# הוספת שדה חיפוש לרשימות בדף ניהול בית כנסת

## מה ישתנה

בכל אחד משלושת הטאבים (מתפללים, גבאים, מחלקות) יתווסף שדה חיפוש מעל הרשימה שמאפשר סינון לפי שם. החיפוש יסנן את הרשימה בזמן אמת תוך כדי הקלדה.

## קובץ שישתנה

| קובץ | שינוי |
|---|---|
| `src/pages/SynagogueManage.tsx` | הוספת state `searchTerm` + שדה Input לחיפוש + סינון הרשימה בכל אחד מ-3 הטאבים |

## פירוט טכני

### MembersTab
- הוספת `const [searchTerm, setSearchTerm] = useState("")`
- הוספת שדה `Input` עם placeholder "חפש מתפלל..." ואייקון `Search` מעל רשימת המתפללים
- סינון `members` לפי `full_name` או `username` שמכילים את מילת החיפוש

### GabbaisTab
- אותו דבר - שדה חיפוש עם סינון לפי `full_name` או `username`

### SectionsTab
- שדה חיפוש עם סינון לפי `name` של המחלקה

### מבנה שדה החיפוש

```text
<div className="relative mb-3">
  <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
  <Input
    placeholder="חפש..."
    value={searchTerm}
    onChange={(e) => setSearchTerm(e.target.value)}
    className="pr-9 text-right"
    dir="rtl"
  />
</div>
```

שדה החיפוש יופיע רק כשיש פריטים ברשימה (אין טעם להציג חיפוש ברשימה ריקה). הסינון מתבצע בצד הלקוח על הנתונים שכבר נטענו.
