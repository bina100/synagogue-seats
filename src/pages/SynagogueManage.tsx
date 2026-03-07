import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import AppLayout from "@/components/AppLayout";
import { CalendarOff, Armchair, Settings } from "lucide-react";

export default function SynagogueManage() {
  const { id } = useParams<{ id: string }>();
  const { isSuperAdmin, roles } = useAuth();

  const { data: synagogue } = useQuery({
    queryKey: ["synagogue", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("synagogues")
        .select("*")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const canManage = isSuperAdmin || roles.some((r) => r.role === "gabbai" && r.synagogue_id === id);

  const buttons = [
    {
      to: `/synagogue/${id}/absences`,
      icon: CalendarOff,
      label: "היעדרויות ולוח בקרה",
      description: "ניהול היעדרויות וצפייה בלוח הבקרה",
      show: canManage,
    },
    {
      to: `/synagogue/${id}/seating`,
      icon: Armchair,
      label: "מפת מקומות ישיבה",
      description: "צפייה ועריכת מפת המקומות",
      show: true,
    },
    {
      to: `/synagogue/${id}/settings`,
      icon: Settings,
      label: "הגדרות",
      description: "ניהול מתפללים וגבאים",
      show: canManage,
    },
  ];

  return (
    <AppLayout title={synagogue?.name || "בית כנסת"} showBack>
      <div className="flex flex-col gap-3">
        {buttons
          .filter((b) => b.show)
          .map((b) => (
            <Link key={b.to} to={b.to}>
              <div className="flex items-center gap-4 rounded-xl border bg-card p-5 shadow-sm transition-colors hover:bg-accent/50 cursor-pointer">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <b.icon className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="font-semibold text-base">{b.label}</p>
                  <p className="text-sm text-muted-foreground">{b.description}</p>
                </div>
              </div>
            </Link>
          ))}
      </div>
    </AppLayout>
  );
}
