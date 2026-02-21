import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, UserPlus, Users, LayoutGrid, Trash2, Shield, User } from "lucide-react";

export default function SynagogueManage() {
  const { id } = useParams<{ id: string }>();
  const { profile, isSuperAdmin } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch synagogue
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

  // Check if user can manage
  const canManage = isSuperAdmin || false; // Will also check gabbai role

  return (
    <AppLayout title={synagogue?.name || "בית כנסת"} showBack>
      <Tabs defaultValue="members" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="members" className="gap-2">
            <Users className="h-4 w-4" />
            מתפללים
          </TabsTrigger>
          <TabsTrigger value="gabbais" className="gap-2">
            <Shield className="h-4 w-4" />
            גבאים
          </TabsTrigger>
          <TabsTrigger value="sections" className="gap-2">
            <LayoutGrid className="h-4 w-4" />
            מחלקות
          </TabsTrigger>
        </TabsList>

        <TabsContent value="members">
          <MembersTab synagogueId={id!} canManage={canManage} />
        </TabsContent>
        <TabsContent value="gabbais">
          <GabbaisTab synagogueId={id!} canManage={canManage} />
        </TabsContent>
        <TabsContent value="sections">
          <SectionsTab synagogueId={id!} canManage={canManage} />
        </TabsContent>
      </Tabs>
    </AppLayout>
  );
}

// ============ Members Tab ============
function MembersTab({ synagogueId, canManage }: { synagogueId: string; canManage: boolean }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");

  const { data: members, isLoading } = useQuery({
    queryKey: ["members", synagogueId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("synagogue_members")
        .select("*, profiles(id, username, full_name)")
        .eq("synagogue_id", synagogueId);
      if (error) throw error;
      return data;
    },
  });

  const addMemberMutation = useMutation({
    mutationFn: async () => {
      // Use edge function to create user + add as member
      const { data, error } = await supabase.functions.invoke("add-member", {
        body: { username, password, full_name: fullName, synagogue_id: synagogueId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["members", synagogueId] });
      setDialogOpen(false);
      setUsername("");
      setPassword("");
      setFullName("");
      toast({ title: "מתפלל נוסף בהצלחה!" });
    },
    onError: (e: Error) => {
      toast({ title: "שגיאה", description: e.message, variant: "destructive" });
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (memberId: string) => {
      const { error } = await supabase.from("synagogue_members").delete().eq("id", memberId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["members", synagogueId] });
      toast({ title: "מתפלל הוסר" });
    },
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg">רשימת מתפללים</CardTitle>
        {canManage && (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-2">
                <UserPlus className="h-4 w-4" />
                הוסף מתפלל
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>הוספת מתפלל חדש</DialogTitle>
              </DialogHeader>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  addMemberMutation.mutate();
                }}
                className="space-y-4"
              >
                <div className="space-y-2">
                  <Label>שם מלא</Label>
                  <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required placeholder="ישראל ישראלי" />
                </div>
                <div className="space-y-2">
                  <Label>שם משתמש</Label>
                  <Input value={username} onChange={(e) => setUsername(e.target.value)} required placeholder="israel" />
                </div>
                <div className="space-y-2">
                  <Label>סיסמה</Label>
                  <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="לפחות 6 תווים" />
                </div>
                <Button type="submit" className="w-full" disabled={addMemberMutation.isPending}>
                  {addMemberMutation.isPending ? "מוסיף..." : "הוסף מתפלל"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-muted-foreground text-center py-4">טוען...</p>
        ) : !members?.length ? (
          <p className="text-muted-foreground text-center py-8">אין מתפללים רשומים עדיין</p>
        ) : (
          <div className="space-y-2">
            {members.map((m) => (
              <div key={m.id} className="flex items-center justify-between rounded-lg border p-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted">
                    <User className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">{(m.profiles as any)?.full_name}</p>
                    <p className="text-xs text-muted-foreground">{(m.profiles as any)?.username}</p>
                  </div>
                </div>
                {canManage && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                    onClick={() => {
                      if (confirm("להסיר את המתפלל?")) removeMutation.mutate(m.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============ Gabbais Tab ============
function GabbaisTab({ synagogueId, canManage }: { synagogueId: string; canManage: boolean }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");

  const { data: gabbais, isLoading } = useQuery({
    queryKey: ["gabbais", synagogueId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("*, profiles:user_id(id, username, full_name)")
        .eq("synagogue_id", synagogueId)
        .eq("role", "gabbai");
      if (error) throw error;
      return data;
    },
  });

  const addGabbaiMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("add-member", {
        body: { username, password, full_name: fullName, synagogue_id: synagogueId, role: "gabbai" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gabbais", synagogueId] });
      queryClient.invalidateQueries({ queryKey: ["members", synagogueId] });
      setDialogOpen(false);
      setUsername("");
      setPassword("");
      setFullName("");
      toast({ title: "גבאי נוסף בהצלחה!" });
    },
    onError: (e: Error) => {
      toast({ title: "שגיאה", description: e.message, variant: "destructive" });
    },
  });

  const removeGabbaiMutation = useMutation({
    mutationFn: async (roleId: string) => {
      const { error } = await supabase.from("user_roles").delete().eq("id", roleId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gabbais", synagogueId] });
      toast({ title: "גבאי הוסר" });
    },
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg">גבאים</CardTitle>
        {canManage && (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-2">
                <UserPlus className="h-4 w-4" />
                הוסף גבאי
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>הוספת גבאי חדש</DialogTitle>
              </DialogHeader>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  addGabbaiMutation.mutate();
                }}
                className="space-y-4"
              >
                <div className="space-y-2">
                  <Label>שם מלא</Label>
                  <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required placeholder="ישראל ישראלי" />
                </div>
                <div className="space-y-2">
                  <Label>שם משתמש</Label>
                  <Input value={username} onChange={(e) => setUsername(e.target.value)} required placeholder="israel" />
                </div>
                <div className="space-y-2">
                  <Label>סיסמה</Label>
                  <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="לפחות 6 תווים" />
                </div>
                <Button type="submit" className="w-full" disabled={addGabbaiMutation.isPending}>
                  {addGabbaiMutation.isPending ? "מוסיף..." : "הוסף גבאי"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-muted-foreground text-center py-4">טוען...</p>
        ) : !gabbais?.length ? (
          <p className="text-muted-foreground text-center py-8">אין גבאים רשומים עדיין</p>
        ) : (
          <div className="space-y-2">
            {gabbais.map((g) => (
              <div key={g.id} className="flex items-center justify-between rounded-lg border p-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10">
                    <Shield className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">{(g.profiles as any)?.full_name}</p>
                    <p className="text-xs text-muted-foreground">{(g.profiles as any)?.username}</p>
                  </div>
                </div>
                {canManage && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                    onClick={() => {
                      if (confirm("להסיר את הגבאי?")) removeGabbaiMutation.mutate(g.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============ Sections Tab ============
function SectionsTab({ synagogueId, canManage }: { synagogueId: string; canManage: boolean }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [sectionName, setSectionName] = useState("");

  const { data: sections, isLoading } = useQuery({
    queryKey: ["sections", synagogueId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sections")
        .select("*")
        .eq("synagogue_id", synagogueId)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("sections").insert({
        synagogue_id: synagogueId,
        name: sectionName,
        sort_order: (sections?.length || 0) + 1,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sections", synagogueId] });
      setDialogOpen(false);
      setSectionName("");
      toast({ title: "מחלקה נוצרה בהצלחה!" });
    },
    onError: (e: Error) => {
      toast({ title: "שגיאה", description: e.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (sectionId: string) => {
      const { error } = await supabase.from("sections").delete().eq("id", sectionId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sections", synagogueId] });
      toast({ title: "מחלקה נמחקה" });
    },
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg">מחלקות</CardTitle>
        {canManage && (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-2">
                <Plus className="h-4 w-4" />
                הוסף מחלקה
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>מחלקה חדשה</DialogTitle>
              </DialogHeader>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  createMutation.mutate();
                }}
                className="space-y-4"
              >
                <div className="space-y-2">
                  <Label>שם המחלקה</Label>
                  <Input
                    value={sectionName}
                    onChange={(e) => setSectionName(e.target.value)}
                    required
                    placeholder="לדוגמה: אולם ראשי / עזרת נשים"
                  />
                </div>
                <Button type="submit" className="w-full" disabled={createMutation.isPending}>
                  {createMutation.isPending ? "יוצר..." : "צור מחלקה"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-muted-foreground text-center py-4">טוען...</p>
        ) : !sections?.length ? (
          <p className="text-muted-foreground text-center py-8">אין מחלקות עדיין. הוסף מחלקה כמו "אולם ראשי" או "עזרת נשים".</p>
        ) : (
          <div className="space-y-2">
            {sections.map((s) => (
              <div key={s.id} className="flex items-center justify-between rounded-lg border p-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent">
                    <LayoutGrid className="h-4 w-4 text-accent-foreground" />
                  </div>
                  <p className="font-medium text-sm">{s.name}</p>
                </div>
                {canManage && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                    onClick={() => {
                      if (confirm("למחוק את המחלקה?")) deleteMutation.mutate(s.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
