import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing auth");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify user
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) throw new Error("Unauthorized");

    const { synagogue_id, changes } = await req.json();
    if (!synagogue_id || !changes) throw new Error("Missing data");

    // Admin client for writes
    const admin = createClient(supabaseUrl, serviceKey);

    // Verify permission
    const { data: canManage } = await admin.rpc("can_manage_synagogue", {
      _auth_id: user.id,
      _synagogue_id: synagogue_id,
    });
    if (!canManage) throw new Error("No permission");

    const stats = { inserted: 0, updated: 0, deleted: 0 };

    // Process deletions first (seats → rows → sections)
    if (changes.deleted_seats?.length) {
      // Clean absences for deleted seats
      const { error } = await admin
        .from("absences")
        .delete()
        .in("seat_id", changes.deleted_seats);
      if (error) console.error("Error deleting absences:", error);

      const { error: e } = await admin
        .from("seats")
        .delete()
        .in("id", changes.deleted_seats);
      if (e) throw new Error(`Delete seats: ${e.message}`);
      stats.deleted += changes.deleted_seats.length;
    }

    if (changes.deleted_rows?.length) {
      // Delete any remaining seats in these rows
      const { error: se } = await admin
        .from("seats")
        .delete()
        .in("row_id", changes.deleted_rows);
      if (se) console.error("Error cleaning seats:", se);

      const { error: e } = await admin
        .from("seat_rows")
        .delete()
        .in("id", changes.deleted_rows);
      if (e) throw new Error(`Delete rows: ${e.message}`);
      stats.deleted += changes.deleted_rows.length;
    }

    if (changes.deleted_sections?.length) {
      // Delete any remaining rows in these sections
      const { error: re } = await admin
        .from("seat_rows")
        .delete()
        .in("section_id", changes.deleted_sections);
      if (re) console.error("Error cleaning rows:", re);

      const { error: e } = await admin
        .from("sections")
        .delete()
        .in("id", changes.deleted_sections);
      if (e) throw new Error(`Delete sections: ${e.message}`);
      stats.deleted += changes.deleted_sections.length;
    }

    // Process section sort order updates
    if (changes.updated_sections?.length) {
      for (const sec of changes.updated_sections) {
        const { error } = await admin
          .from("sections")
          .update({ sort_order: sec.sort_order, name: sec.name })
          .eq("id", sec.id);
        if (error) throw new Error(`Update section: ${error.message}`);
        stats.updated++;
      }
    }

    // Process new rows
    if (changes.new_rows?.length) {
      for (const row of changes.new_rows) {
        const { data: newRow, error } = await admin
          .from("seat_rows")
          .insert({
            section_id: row.section_id,
            row_number: row.row_number,
            seats_count: row.seats_count,
          })
          .select()
          .single();
        if (error) throw new Error(`Insert row: ${error.message}`);

        // Insert seats for this new row
        if (row.seats?.length) {
          const seatsToInsert = row.seats.map((s: any) => ({
            row_id: newRow.id,
            seat_number: s.seat_number,
            element_type: s.element_type || null,
            assigned_to: s.assigned_to || null,
          }));
          const { error: se } = await admin.from("seats").insert(seatsToInsert);
          if (se) throw new Error(`Insert seats: ${se.message}`);
          stats.inserted += seatsToInsert.length;
        }
        stats.inserted++;
      }
    }

    // Process new seats (added to existing rows)
    if (changes.new_seats?.length) {
      const seatsToInsert = changes.new_seats.map((s: any) => ({
        row_id: s.row_id,
        seat_number: s.seat_number,
        element_type: s.element_type || null,
        assigned_to: s.assigned_to || null,
      }));
      const { error } = await admin.from("seats").insert(seatsToInsert);
      if (error) throw new Error(`Insert new seats: ${error.message}`);
      stats.inserted += seatsToInsert.length;
    }

    // Process seat updates (assignment changes, element_type changes)
    if (changes.updated_seats?.length) {
      for (const seat of changes.updated_seats) {
        const updateData: any = {};
        if (seat.assigned_to !== undefined) updateData.assigned_to = seat.assigned_to;
        if (seat.element_type !== undefined) updateData.element_type = seat.element_type;
        if (seat.seat_number !== undefined) updateData.seat_number = seat.seat_number;

        const { error } = await admin
          .from("seats")
          .update(updateData)
          .eq("id", seat.id);
        if (error) throw new Error(`Update seat: ${error.message}`);
        stats.updated++;
      }
    }

    return new Response(JSON.stringify({ success: true, stats }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
