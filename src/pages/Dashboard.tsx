import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Building2, Plus, MapPin, Users, Trash2 } from "lucide-react";

export default function Dashboard() {
  const { profile, isSuperAdmin } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newAddress, setNewAddress] = useState("");

  // Fetch synagogues
  const { data: synagogues, isLoading } = useQuery({
    queryKey: ["synagogues"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("synagogues")
        .select("*, synagogue_members(count)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Create synagogue
  const createMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from("synagogues")
        .insert({ name: newName, address: newAddress || null, created_by: profile?.id })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["synagogues"] });
      setDialogOpen(false);
      setNewName("");
      setNewAddress("");
      toast({ title: "בית כנסת נוצר בהצלחה!" });
    },
    onError: (e: Error) => {
      toast({ title: "שגיאה", description: e.message, variant: "destructive" });
    },
  });

  // Delete synagogue
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("synagogues").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["synagogues"] });
      toast({ title: "בית כנסת נמחק" });
    },
  });

  return (
    <AppLayout>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">שלום, {profile?.full_name}</h2>
          <p className="text-muted-foreground">
            {isSuperAdmin ? "ניהול בתי כנסת" : "בתי הכנסת שלך"}
          </p>
        </div>
        {isSuperAdmin && (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                בית כנסת חדש
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>יצירת בית כנסת חדש</DialogTitle>
              </DialogHeader>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  createMutation.mutate();
                }}
                className="space-y-4"
              >
                <div className="space-y-2">
                  <Label>שם בית הכנסת</Label>
                  <Input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder='לדוגמה: ביהכ"נ הגדול'
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>כתובת (אופציונלי)</Label>
                  <Input
                    value={newAddress}
                    onChange={(e) => setNewAddress(e.target.value)}
                    placeholder="לדוגמה: רחוב הרב קוק 5, ירושלים"
                  />
                </div>
                <Button type="submit" className="w-full" disabled={createMutation.isPending}>
                  {createMutation.isPending ? "יוצר..." : "צור בית כנסת"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">טוען...</div>
      ) : !synagogues?.length ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Building2 className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">
              {isSuperAdmin
                ? "עדיין לא נוצרו בתי כנסת. לחץ על הכפתור למעלה ליצירת בית כנסת ראשון."
                : "אתה עדיין לא משויך לבית כנסת."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {synagogues.map((syn) => (
            <Card
              key={syn.id}
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => navigate(`/synagogue/${syn.id}`)}
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-lg">{syn.name}</CardTitle>
                  {isSuperAdmin && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm("למחוק את בית הכנסת?")) {
                          deleteMutation.mutate(syn.id);
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {syn.address && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5" />
                    <span>{syn.address}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Users className="h-3.5 w-3.5" />
                  <span>{(syn.synagogue_members as any)?.[0]?.count || 0} מתפללים</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </AppLayout>
  );
}
