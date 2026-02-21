import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { username, password, full_name, synagogue_id, role } = await req.json();

    if (!username || !password || !full_name || !synagogue_id) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify the calling user has permission (super_admin or gabbai of this synagogue)
    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user: callingUser } } = await supabaseUser.auth.getUser();
    if (!callingUser) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check caller permissions using service role
    const { data: canManage } = await supabaseAdmin.rpc("can_manage_synagogue", {
      _auth_id: callingUser.id,
      _synagogue_id: synagogue_id,
    });

    if (!canManage) {
      return new Response(JSON.stringify({ error: "אין לך הרשאה לבצע פעולה זו" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create a safe ASCII email - use only alphanumeric chars, fallback to random id
    const safeUsername = username.toLowerCase().replace(/[^a-z0-9]/g, "");
    const email = `${safeUsername || crypto.randomUUID().slice(0, 8)}@synagogue.local`;

    // Check if user already exists
    const { data: existingProfile } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("username", username.toLowerCase().replace(/\s/g, "_"))
      .maybeSingle();

    let profileId: string;

    if (existingProfile) {
      profileId = existingProfile.id;
    } else {
      // Create new auth user
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { username, full_name },
      });

      if (authError) {
        return new Response(JSON.stringify({ error: authError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Wait for trigger to create profile
      await new Promise((resolve) => setTimeout(resolve, 500));

      const { data: newProfile } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("auth_id", authData.user.id)
        .single();

      if (!newProfile) {
        return new Response(JSON.stringify({ error: "Failed to create profile" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      profileId = newProfile.id;
    }

    // Add as synagogue member
    await supabaseAdmin
      .from("synagogue_members")
      .upsert({ profile_id: profileId, synagogue_id }, { onConflict: "profile_id,synagogue_id" });

    // If role is gabbai, add role
    if (role === "gabbai") {
      await supabaseAdmin
        .from("user_roles")
        .upsert(
          { user_id: profileId, role: "gabbai", synagogue_id },
          { onConflict: "user_id,role,synagogue_id" }
        );
    } else {
      // Add member role
      await supabaseAdmin
        .from("user_roles")
        .upsert(
          { user_id: profileId, role: "member", synagogue_id },
          { onConflict: "user_id,role,synagogue_id" }
        );
    }

    return new Response(
      JSON.stringify({ success: true, profile_id: profileId }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
