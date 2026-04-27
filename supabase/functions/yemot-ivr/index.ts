// Yemot HaMashiach IVR webhook for self-service absence reporting.
// Members call the Yemot system, which routes the call to this endpoint.
// We identify the caller by phone number, then mark/cancel an absence
// for the upcoming Shabbat in the existing `absences` table.
//
// Yemot sends GET requests with query params like:
//   ApiPhone     - caller phone number
//   ApiExtension - DTMF input collected (set by `read=...` directives)
//   ApiCallId    - unique call id
//   ApiDID       - the system number that was dialed
//
// We respond with Yemot script directives (text/plain). Common ones used:
//   id_list_message=t-<text>     — speak Hebrew text
//   read=t-<prompt>,1,extension,yes,,1  — prompt + read 1 digit into ApiExtension
//   hangup=yes                   — end the call

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ---------- Helpers ----------

/** Normalize an Israeli phone number to a canonical 10-digit form starting with 0. */
function normalizePhone(raw: string | null): string | null {
  if (!raw) return null;
  let p = raw.replace(/[^\d]/g, "");
  if (p.startsWith("972")) p = "0" + p.slice(3);
  // already 0XXXXXXXXX
  return p || null;
}

/** Build a list of plausible variants so we can match however the phone is stored. */
function phoneVariants(normalized: string): string[] {
  const variants = new Set<string>();
  variants.add(normalized);
  if (normalized.startsWith("0")) {
    const noZero = normalized.slice(1);
    variants.add(noZero);
    variants.add("972" + noZero);
    variants.add("+972" + noZero);
  }
  return Array.from(variants);
}

/** Compute the next Shabbat (upcoming Saturday) as YYYY-MM-DD. */
function getNextShabbat(): string {
  const now = new Date();
  const day = now.getDay();
  const daysUntilShabbat = day === 6 ? 0 : (6 - day + 7) % 7 || 7;
  const shabbat = new Date(now);
  shabbat.setDate(now.getDate() + daysUntilShabbat);
  return shabbat.toISOString().split("T")[0];
}

/** Format YYYY-MM-DD → "DD/MM" for short Hebrew speech. */
function formatDateShort(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${parseInt(d, 10)}.${parseInt(m, 10)}`;
}

/** Build a Yemot response that speaks text and ends the call. */
function speakAndHangup(text: string): string {
  const safe = text.replace(/[.,]/g, " ").replace(/\s+/g, " ").trim();
  return `id_list_message=t-${safe}&hangup=yes`;
}

/** Build a Yemot response that speaks a prompt and reads a single digit into ApiExtension. */
function readDigit(prompt: string): string {
  const safe = prompt.replace(/[.,]/g, " ").replace(/\s+/g, " ").trim();
  // Yemot syntax: read=t-<text>,<var-name>,<play-beep>,<max-digits>,<min-digits>,<timeout-sec>
  // Var name MUST be ApiExtension so Yemot returns it under that name on the next hit.
  // CRITICAL: Yemot requires the response to start with `id_list_message=` (even if empty),
  // otherwise the system rejects it with "extension cannot be operated".
  // Beep is set to `no` for max compatibility across Yemot account types.
  return `id_list_message=&read=t-${safe},ApiExtension,no,1,1,7`;
}

function yemotResponse(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8" },
  });
}

// ---------- Main handler ----------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const params = url.searchParams;
    const apiPhone = params.get("ApiPhone");
    const apiExtension = params.get("ApiExtension"); // empty on first hit
    const apiDID = params.get("ApiDID");

    // Optional security: if YEMOT_DID is configured, require ApiDID to match.
    const expectedDID = Deno.env.get("YEMOT_DID");
    if (expectedDID && apiDID && apiDID !== expectedDID) {
      console.warn("Rejected call: ApiDID mismatch", { apiDID, expectedDID });
      return yemotResponse(speakAndHangup("שגיאת מערכת"));
    }

    const normalized = normalizePhone(apiPhone);
    if (!normalized) {
      return yemotResponse(speakAndHangup("לא התקבל מספר טלפון מזהה"));
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1) Find profile by phone (try multiple stored formats).
    const variants = phoneVariants(normalized);
    const { data: profiles, error: profileError } = await supabase
      .from("profiles")
      .select("id, full_name, phone")
      .in("phone", variants)
      .limit(2);

    if (profileError) {
      console.error("profile lookup failed", profileError);
      return yemotResponse(speakAndHangup("שגיאה זמנית במערכת נסה שוב מאוחר יותר"));
    }

    if (!profiles || profiles.length === 0) {
      return yemotResponse(
        speakAndHangup("מספר הטלפון לא נמצא במערכת אנא פנה לגבאי בית הכנסת"),
      );
    }

    // If multiple profiles share the phone, take the first — extremely rare.
    const profile = profiles[0];

    // 2) Find which synagogue(s) this member belongs to.
    const { data: memberships, error: memError } = await supabase
      .from("synagogue_members")
      .select("synagogue_id, synagogues:synagogue_id(name)")
      .eq("profile_id", profile.id);

    if (memError) {
      console.error("membership lookup failed", memError);
      return yemotResponse(speakAndHangup("שגיאה זמנית במערכת"));
    }

    if (!memberships || memberships.length === 0) {
      return yemotResponse(
        speakAndHangup(`שלום ${profile.full_name} אינך משויך לבית כנסת פנה לגבאי`),
      );
    }

    // For now: if multiple synagogues, take the first. (Future: add a selection menu.)
    const synagogueId = memberships[0].synagogue_id as string;

    // 3) Find the seat assigned to this profile in this synagogue (if any).
    //    seats.assigned_to → profiles.id, joined via seat_rows → sections → synagogue.
    const { data: seatRows, error: seatErr } = await supabase
      .from("seats")
      .select("id, seat_rows!inner(section_id, sections!inner(synagogue_id))")
      .eq("assigned_to", profile.id);

    if (seatErr) {
      console.error("seat lookup failed", seatErr);
    }

    const seatId =
      (seatRows || []).find(
        // deno-lint-ignore no-explicit-any
        (s: any) => s.seat_rows?.sections?.synagogue_id === synagogueId,
      )?.id ?? null;

    const shabbatDate = getNextShabbat();
    const dateLabel = formatDateShort(shabbatDate);

    // ---------- IVR flow ----------

    // First hit: greet and offer menu.
    if (!apiExtension) {
      const prompt =
        `שלום ${profile.full_name} ` +
        `לדיווח היעדרות לשבת הקרובה ${dateLabel} הקש 1 ` +
        `לביטול היעדרות הקש 2 ` +
        `לסיום הקש 9`;
      return yemotResponse(readDigit(prompt));
    }

    // Second hit: act on the digit.
    if (apiExtension === "1") {
      // Mark absence — mirror the frontend logic (with seat_id when assigned).
      const insertPayload: Record<string, unknown> = {
        profile_id: profile.id,
        synagogue_id: synagogueId,
        shabbat_date: shabbatDate,
        marked_by: profile.id,
      };
      if (seatId) insertPayload.seat_id = seatId;

      // Avoid duplicate absences for the same (profile, synagogue, date, seat).
      const dupQuery = supabase
        .from("absences")
        .select("id")
        .eq("profile_id", profile.id)
        .eq("synagogue_id", synagogueId)
        .eq("shabbat_date", shabbatDate);
      const { data: existing } = seatId
        ? await dupQuery.eq("seat_id", seatId)
        : await dupQuery.is("seat_id", null);

      if (!existing || existing.length === 0) {
        const { error: insErr } = await supabase.from("absences").insert(insertPayload);
        if (insErr) {
          console.error("absence insert failed", insErr);
          return yemotResponse(speakAndHangup("שגיאה ברישום ההיעדרות נסה שוב"));
        }
      }

      return yemotResponse(
        speakAndHangup(`היעדרותך נרשמה לשבת ${dateLabel} שבת שלום`),
      );
    }

    if (apiExtension === "2") {
      const delQuery = supabase
        .from("absences")
        .delete()
        .eq("profile_id", profile.id)
        .eq("synagogue_id", synagogueId)
        .eq("shabbat_date", shabbatDate);

      const { error: delErr } = seatId
        ? await delQuery.eq("seat_id", seatId)
        : await delQuery.is("seat_id", null);

      if (delErr) {
        console.error("absence delete failed", delErr);
        return yemotResponse(speakAndHangup("שגיאה בביטול ההיעדרות"));
      }

      return yemotResponse(speakAndHangup("ההיעדרות בוטלה שבת שלום"));
    }

    if (apiExtension === "9") {
      return yemotResponse(speakAndHangup("להתראות"));
    }

    // Unknown digit — re-prompt.
    return yemotResponse(
      readDigit("בחירה לא חוקית להיעדרות הקש 1 לביטול הקש 2 לסיום הקש 9"),
    );
  } catch (e) {
    console.error("yemot-ivr unexpected error", e);
    return yemotResponse(speakAndHangup("שגיאה במערכת"));
  }
});
