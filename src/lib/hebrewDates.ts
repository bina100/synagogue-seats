import { HDate, HebrewCalendar, flags } from "@hebcal/core";

/** Get next Shabbat date string (upcoming Saturday) in YYYY-MM-DD format */
export function getNextShabbat(): string {
  const now = new Date();
  const day = now.getDay();
  const daysUntilShabbat = day === 6 ? 0 : (6 - day + 7) % 7 || 7;
  const shabbat = new Date(now);
  shabbat.setDate(now.getDate() + daysUntilShabbat);
  return shabbat.toISOString().split("T")[0];
}

/** Get upcoming Shabbats for the next N weeks */
export function getUpcomingShabbats(weeks = 4): string[] {
  const result: string[] = [];
  const now = new Date();
  const day = now.getDay();
  const daysUntilFirst = day === 6 ? 0 : (6 - day + 7) % 7 || 7;
  for (let i = 0; i < weeks; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() + daysUntilFirst + i * 7);
    result.push(d.toISOString().split("T")[0]);
  }
  return result;
}

/** Get upcoming Jewish holidays including erev chag (next 30 days) */
export function getUpcomingHolidays(): Array<{ date: string; name: string; hebrew: string }> {
  const now = new Date();
  const end = new Date(now);
  end.setDate(end.getDate() + 30);

  const events = HebrewCalendar.calendar({
    start: now,
    end,
    il: true,
    noMinorFast: true,
    noModern: true,
    noRoshChodesh: true,
    noSpecialShabbat: true,
  });

  const holidayEvents = events
    .filter((ev) => ev.getFlags() & (flags.CHAG | flags.MAJOR_FAST | flags.YOM_TOV_ENDS | flags.EREV))
    .map((ev) => ({
      date: ev.getDate().greg().toISOString().split("T")[0],
      name: ev.render("he"),
      hebrew: ev.renderBrief("he"),
    }));

  // Add erev chag entries for major holidays that don't already have one
  const result = [...holidayEvents];
  const existingDates = new Set(result.map(r => r.date));
  
  for (const ev of holidayEvents) {
    if (ev.hebrew.includes("ערב")) continue;
    const evDate = new Date(ev.date + "T00:00:00");
    const erevDate = new Date(evDate);
    erevDate.setDate(erevDate.getDate() - 1);
    const erevStr = erevDate.toISOString().split("T")[0];
    if (!existingDates.has(erevStr) && erevDate >= now) {
      // Extract holiday name for erev label
      const holidayName = ev.hebrew.replace(/^(יום [א-ת]+ של |שמיני עצרת|שמחת תורה)/, '').trim();
      const baseName = ev.hebrew.includes("פסח") ? "פסח"
        : ev.hebrew.includes("סוכות") ? "סוכות"
        : ev.hebrew.includes("שבועות") ? "שבועות"
        : ev.hebrew.includes("ראש השנה") ? "ראש השנה"
        : ev.hebrew;
      result.push({
        date: erevStr,
        name: `ערב ${baseName}`,
        hebrew: `ערב ${baseName}`,
      });
      existingDates.add(erevStr);
    }
  }

  return result.sort((a, b) => a.date.localeCompare(b.date));
}

/** Format a date string to Hebrew + Gregorian display */
export function formatHebrewDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  const hdate = new HDate(date);
  const gregorian = date.toLocaleDateString("he-IL", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  return `${gregorian} • ${hdate.renderGematriya()}`;
}

/** Format a date string to Hebrew-only date (gematriya) */
export function formatHebrewDateOnly(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  const hdate = new HDate(date);
  return hdate.renderGematriya();
}

/** Get parasha name for a given Shabbat date string (YYYY-MM-DD), or null */
export function getParashaForDate(dateStr: string): string | null {
  const greg = new Date(dateStr + "T00:00:00");
  const events = HebrewCalendar.calendar({
    start: greg,
    end: greg,
    il: true,
    sedrot: true,
    noHolidays: true,
  });
  const parasha = events.find((ev) => ev.getFlags() & flags.PARSHA_HASHAVUA);
  return parasha ? parasha.render("he") : null;
}

/** Get a smart label for a Shabbat: handles chol hamoed, regular parasha, etc. */
export function getShabbatLabel(dateStr: string): string {
  const greg = new Date(dateStr + "T00:00:00");
  
  // Check if this Shabbat has a chol hamoed or special holiday reading
  const allEvents = HebrewCalendar.calendar({
    start: greg,
    end: greg,
    il: true,
    sedrot: true,
  });

  // Check for chol hamoed
  const cholHamoed = allEvents.find((ev) => {
    const desc = ev.render("he");
    return desc.includes("חול המועד") || (ev.getFlags() & flags.CHOL_HAMOED);
  });
  if (cholHamoed) {
    const desc = cholHamoed.render("he");
    if (desc.includes("פסח")) return "שבת חול המועד פסח";
    if (desc.includes("סוכות")) return "שבת חול המועד סוכות";
    return `שבת ${desc}`;
  }

  // Regular parasha
  const parasha = allEvents.find((ev) => ev.getFlags() & flags.PARSHA_HASHAVUA);
  if (parasha) {
    return `שבת ${parasha.render("he")}`;
  }

  return "שבת";
}


/**
 * Get a label for the next upcoming event (Shabbat or holiday).
 * Returns e.g. "שבת פרשת וירא (כ״ב חשוון תשפ״ו)" or "סוכות (ט״ו תשרי תשפ״ו)"
 */
export function getNextEventLabel(): string {
  const nextShabbatDate = getNextShabbat();
  const shabbatGreg = new Date(nextShabbatDate + "T00:00:00");
  const holidays = getUpcomingHolidays();

  // Check if there's a holiday before the next Shabbat
  const holidayBeforeShabbat = holidays.find((h) => h.date <= nextShabbatDate);
  if (holidayBeforeShabbat) {
    const holidayDate = new Date(holidayBeforeShabbat.date + "T00:00:00");
    const hdate = new HDate(holidayDate);
    return `${holidayBeforeShabbat.hebrew} (${hdate.renderGematriya()})`;
  }

  // Get the parasha for this Shabbat
  const hdate = new HDate(shabbatGreg);
  const events = HebrewCalendar.calendar({
    start: shabbatGreg,
    end: shabbatGreg,
    il: true,
    sedrot: true,
    noHolidays: true,
  });

  const parasha = events.find((ev) => ev.getFlags() & flags.PARSHA_HASHAVUA);
  if (parasha) {
    return `שבת ${parasha.render("he")} (${hdate.renderGematriya()})`;
  }

  // Fallback
  return `שבת (${hdate.renderGematriya()})`;
}
