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

    const { target_profile_id, new_password } = await req.json();
    if (!target_profile_id || !new_password) {
      return new Response(JSON.stringify({ error: "Missing fields" }), {
        status: 400,
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

    const { data: { user: callingUser } } = await supabaseUser.auth.getUser();
    if (!callingUser) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify caller is super_admin OR gabbai of a synagogue the target belongs to
    const { data: isSuperAdmin } = await supabaseAdmin.rpc("has_role", {
      _auth_id: callingUser.id,
      _role: "super_admin",
    });

    let allowed = !!isSuperAdmin;

    if (!allowed) {
      const { data: targetSynagogues } = await supabaseAdmin
        .from("synagogue_members")
        .select("synagogue_id")
        .eq("profile_id", target_profile_id);

      for (const row of targetSynagogues || []) {
        const { data: canManage } = await supabaseAdmin.rpc("can_manage_synagogue", {
          _auth_id: callingUser.id,
          _synagogue_id: row.synagogue_id,
        });
        if (canManage) {
          allowed = true;
          break;
        }
      }
    }

    if (!allowed) {
      return new Response(JSON.stringify({ error: "אין לך הרשאה לבצע פעולה זו" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get target auth_id
    const { data: targetProfile, error: profileErr } = await supabaseAdmin
      .from("profiles")
      .select("auth_id")
      .eq("id", target_profile_id)
      .single();

    if (profileErr || !targetProfile) {
      return new Response(JSON.stringify({ error: "Profile not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update password
    const { error: pwErr } = await supabaseAdmin.auth.admin.updateUserById(
      targetProfile.auth_id,
      { password: new_password }
    );
    if (pwErr) {
      return new Response(JSON.stringify({ error: pwErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Force password change on next login
    await supabaseAdmin
      .from("profiles")
      .update({ requires_password_change: true })
      .eq("id", target_profile_id);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
