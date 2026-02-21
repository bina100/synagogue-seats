import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface SeatData {
  name: string | null;
  element_type: string | null; // 'aron_kodesh' | 'bima' | 'amud' | 'chatan' | null
}

interface RowData {
  seats: SeatData[];
}

interface SectionData {
  name: string;
  rows: RowData[];
}

interface ImportPayload {
  synagogue_id: string;
  sections: SectionData[];
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } =
      await supabaseUser.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authId = claimsData.claims.sub;

    // Check permission
    const { data: canManage } = await supabaseAdmin.rpc(
      "can_manage_synagogue",
      { _auth_id: authId, _synagogue_id: "" }
    );

    const payload: ImportPayload = await req.json();
    const { synagogue_id, sections } = payload;

    if (!synagogue_id || !sections?.length) {
      return new Response(
        JSON.stringify({ error: "Missing synagogue_id or sections" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Check management permission
    const { data: hasPermission } = await supabaseAdmin.rpc(
      "can_manage_synagogue",
      { _auth_id: authId, _synagogue_id: synagogue_id }
    );
    if (!hasPermission) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch all profiles for name matching
    const { data: allProfiles } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name");
    const profileMap = new Map<string, string>();
    allProfiles?.forEach((p: any) => {
      if (p.full_name) {
        profileMap.set(p.full_name.trim(), p.id);
      }
    });

    // Delete existing sections/rows/seats for this synagogue
    const { data: existingSections } = await supabaseAdmin
      .from("sections")
      .select("id")
      .eq("synagogue_id", synagogue_id);

    if (existingSections?.length) {
      const sectionIds = existingSections.map((s: any) => s.id);

      const { data: existingRows } = await supabaseAdmin
        .from("seat_rows")
        .select("id")
        .in("section_id", sectionIds);

      if (existingRows?.length) {
        const rowIds = existingRows.map((r: any) => r.id);
        await supabaseAdmin.from("seats").delete().in("row_id", rowIds);
        await supabaseAdmin
          .from("seat_rows")
          .delete()
          .in("section_id", sectionIds);
      }

      await supabaseAdmin
        .from("sections")
        .delete()
        .eq("synagogue_id", synagogue_id);
    }

    // Create sections, rows, seats
    let stats = { sections: 0, rows: 0, seats: 0, matched: 0, unmatched: [] as string[] };

    for (let si = 0; si < sections.length; si++) {
      const sec = sections[si];

      const { data: newSection, error: secErr } = await supabaseAdmin
        .from("sections")
        .insert({
          synagogue_id,
          name: sec.name,
          sort_order: si,
        })
        .select()
        .single();

      if (secErr) {
        console.error("Section insert error:", secErr);
        continue;
      }
      stats.sections++;

      for (let ri = 0; ri < sec.rows.length; ri++) {
        const row = sec.rows[ri];

        const { data: newRow, error: rowErr } = await supabaseAdmin
          .from("seat_rows")
          .insert({
            section_id: newSection.id,
            row_number: ri + 1,
            seats_count: row.seats.length,
          })
          .select()
          .single();

        if (rowErr) {
          console.error("Row insert error:", rowErr);
          continue;
        }
        stats.rows++;

        const seatsToInsert = row.seats.map((seat, idx) => {
          let assignedTo: string | null = null;
          if (seat.name && !seat.element_type) {
            const profileId = profileMap.get(seat.name.trim());
            if (profileId) {
              assignedTo = profileId;
              stats.matched++;
            } else {
              stats.unmatched.push(seat.name);
            }
          }

          return {
            row_id: newRow.id,
            seat_number: idx + 1,
            assigned_to: assignedTo,
            element_type: seat.element_type || null,
          };
        });

        const { error: seatsErr } = await supabaseAdmin
          .from("seats")
          .insert(seatsToInsert);
        if (seatsErr) {
          console.error("Seats insert error:", seatsErr);
        }
        stats.seats += seatsToInsert.length;
      }
    }

    return new Response(JSON.stringify({ success: true, stats }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Import error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
