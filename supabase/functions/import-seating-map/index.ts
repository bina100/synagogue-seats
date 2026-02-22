import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface SeatData {
  name: string | null;
  element_type: string | null;
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

    const payload: ImportPayload = await req.json();
    const { synagogue_id, sections } = payload;

    if (!synagogue_id || !sections?.length) {
      return new Response(
        JSON.stringify({ error: "Missing synagogue_id or sections" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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
        await supabaseAdmin.from("seat_rows").delete().in("section_id", sectionIds);
      }

      await supabaseAdmin.from("sections").delete().eq("synagogue_id", synagogue_id);
    }

    // Create sections, rows, seats
    const stats = {
      sections: 0,
      rows: 0,
      seats: 0,
      matched: 0,
      createdUsers: [] as { fullName: string; username: string; password: string }[],
      failed: [] as { name: string; error: string }[],
    };

    const defaultPassword = "123456";

    for (let si = 0; si < sections.length; si++) {
      const sec = sections[si];

      const { data: newSection, error: secErr } = await supabaseAdmin
        .from("sections")
        .insert({ synagogue_id, name: sec.name, sort_order: si })
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

        const seatsToInsert = [];

        for (let idx = 0; idx < row.seats.length; idx++) {
          const seat = row.seats[idx];
          let assignedTo: string | null = null;

          if (seat.name && !seat.element_type) {
            const cleanedName = seat.name.trim().replace(/\s+/g, " ");
            const existingProfileId = profileMap.get(cleanedName);

            if (existingProfileId) {
              assignedTo = existingProfileId;
              stats.matched++;
            } else {
              // Auto-create user - email matches frontend signIn logic exactly
              const email = `${cleanedName.replace(/\s/g, "_")}@synagogue.local`;

              console.log("Attempting to create user:", cleanedName, "with email:", email);

              try {
                const { data: authData, error: createErr } =
                  await supabaseAdmin.auth.admin.createUser({
                    email,
                    password: defaultPassword,
                    email_confirm: true,
                    user_metadata: {
                      username: cleanedName,
                      full_name: cleanedName,
                    },
                  });

                console.log("createUser result:", authData?.user?.id, "error:", createErr?.message);

                if (createErr || !authData?.user) {
                  stats.failed.push({
                    name: cleanedName,
                    error: createErr?.message || "Unknown error creating user",
                  });
                } else {
                  // Immediately insert profile (don't wait for trigger)
                  const { data: profileData, error: profileErr } = await supabaseAdmin
                    .from("profiles")
                    .upsert(
                      {
                        auth_id: authData.user.id,
                        username: cleanedName,
                        full_name: cleanedName,
                        requires_password_change: true,
                      },
                      { onConflict: "auth_id" }
                    )
                    .select("id")
                    .single();

                  console.log("profile upsert result:", profileData?.id, "error:", profileErr?.message);

                  if (profileErr || !profileData) {
                    stats.failed.push({
                      name: cleanedName,
                      error: profileErr?.message || "Failed to create profile",
                    });
                  } else {
                    assignedTo = profileData.id;
                    profileMap.set(cleanedName, profileData.id);

                    // Add to synagogue_members
                    await supabaseAdmin.from("synagogue_members").upsert(
                      { profile_id: profileData.id, synagogue_id },
                      { onConflict: "profile_id,synagogue_id" }
                    );

                    // Add member role
                    await supabaseAdmin.from("user_roles").upsert(
                      {
                        user_id: profileData.id,
                        role: "member",
                        synagogue_id,
                      },
                      { onConflict: "user_id,role" }
                    );

                    stats.createdUsers.push({
                      fullName: cleanedName,
                      username: cleanedName,
                      password: defaultPassword,
                    });
                  }
                }
              } catch (err: any) {
                stats.failed.push({
                  name: cleanedName,
                  error: err.message || "Exception creating user",
                });
              }
            }
          }

          seatsToInsert.push({
            row_id: newRow.id,
            seat_number: idx + 1,
            assigned_to: assignedTo,
            element_type: seat.element_type || null,
          });
        }

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
  } catch (err: any) {
    console.error("Import error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
