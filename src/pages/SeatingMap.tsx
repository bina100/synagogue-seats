import { useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, UserPlus, X, Armchair } from "lucide-react";

export default function SeatingMap() {
  const { id: synagogueId } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedSectionId = searchParams.get("section");
  const { isSuperAdmin, profile } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch synagogue
  const { data: synagogue } = useQuery({
    queryKey: ["synagogue", synagogueId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("synagogues")
        .select("*")
        .eq("id", synagogueId!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!synagogueId,
  });

  // Fetch sections
  const { data: sections } = useQuery({
    queryKey: ["sections", synagogueId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sections")
        .select("*")
        .eq("synagogue_id", synagogueId!)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
    enabled: !!synagogueId,
  });

  // Auto-select first section
  const activeSectionId = selectedSectionId || sections?.[0]?.id;

  const canManage = isSuperAdmin || false; // Will also check gabbai role via RLS

  if (!sections?.length) {
    return (
      <AppLayout title={`מפת מקומות - ${synagogue?.name || ""}`} showBack>
        <Card>
          <CardContent className="py-12 text-center">
            <Armchair className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground text-lg">אין מחלקות עדיין</p>
            <p className="text-muted-foreground text-sm mt-2">
              צור מחלקות בדף ניהול בית הכנסת לפני בניית מפת המקומות
            </p>
          </CardContent>
        </Card>
      </AppLayout>
    );
  }

  return (
    <AppLayout title={`מפת מקומות - ${synagogue?.name || ""}`} showBack>
      <div className="space-y-4">
        {/* Section selector */}
        <div className="flex gap-2 overflow-x-auto pb-2">
          {sections?.map((s) => (
            <Button
              key={s.id}
              variant={activeSectionId === s.id ? "default" : "outline"}
              size="sm"
              onClick={() => setSearchParams({ section: s.id })}
            >
              {s.name}
            </Button>
          ))}
        </div>

        {/* Seating map for active section */}
        {activeSectionId && (
          <SectionSeatingMap
            sectionId={activeSectionId}
            synagogueId={synagogueId!}
            canManage={canManage}
          />
        )}
      </div>
    </AppLayout>
  );
}

// ============ Section Seating Map ============
function SectionSeatingMap({
  sectionId,
  synagogueId,
  canManage,
}: {
  sectionId: string;
  synagogueId: string;
  canManage: boolean;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [addRowOpen, setAddRowOpen] = useState(false);
  const [seatsCount, setSeatsCount] = useState("6");

  // Fetch rows with seats
  const { data: rows, isLoading } = useQuery({
    queryKey: ["seat_rows", sectionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("seat_rows")
        .select("*, seats(*, profiles:assigned_to(id, full_name, username))")
        .eq("section_id", sectionId)
        .order("row_number");
      if (error) throw error;
      // Sort seats within each row
      return data?.map((row) => ({
        ...row,
        seats: (row.seats as any[])?.sort(
          (a: any, b: any) => a.seat_number - b.seat_number
        ),
      }));
    },
  });

  // Fetch members for assignment
  const { data: members } = useQuery({
    queryKey: ["members", synagogueId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("synagogue_members")
        .select("*, profiles:profile_id(id, full_name, username)")
        .eq("synagogue_id", synagogueId);
      if (error) throw error;
      return data;
    },
  });

  // Add row mutation
  const addRowMutation = useMutation({
    mutationFn: async () => {
      const nextRowNum = (rows?.length || 0) + 1;
      const count = parseInt(seatsCount) || 6;

      // Create row
      const { data: newRow, error: rowError } = await supabase
        .from("seat_rows")
        .insert({ section_id: sectionId, row_number: nextRowNum, seats_count: count })
        .select()
        .single();
      if (rowError) throw rowError;

      // Create seats for the row
      const seatsToInsert = Array.from({ length: count }, (_, i) => ({
        row_id: newRow.id,
        seat_number: i + 1,
      }));
      const { error: seatsError } = await supabase.from("seats").insert(seatsToInsert);
      if (seatsError) throw seatsError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["seat_rows", sectionId] });
      setAddRowOpen(false);
      setSeatsCount("6");
      toast({ title: "שורה נוספה בהצלחה!" });
    },
    onError: (e: Error) => {
      toast({ title: "שגיאה", description: e.message, variant: "destructive" });
    },
  });

  // Delete row mutation
  const deleteRowMutation = useMutation({
    mutationFn: async (rowId: string) => {
      // Delete seats first, then row
      await supabase.from("seats").delete().eq("row_id", rowId);
      const { error } = await supabase.from("seat_rows").delete().eq("id", rowId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["seat_rows", sectionId] });
      toast({ title: "שורה נמחקה" });
    },
  });

  // Assign member to seat
  const assignMutation = useMutation({
    mutationFn: async ({ seatId, profileId }: { seatId: string; profileId: string | null }) => {
      const { error } = await supabase
        .from("seats")
        .update({ assigned_to: profileId })
        .eq("id", seatId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["seat_rows", sectionId] });
    },
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg">מפת מקומות</CardTitle>
        {canManage && (
          <Dialog open={addRowOpen} onOpenChange={setAddRowOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-2">
                <Plus className="h-4 w-4" />
                הוסף שורה
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>שורה חדשה</DialogTitle>
              </DialogHeader>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  addRowMutation.mutate();
                }}
                className="space-y-4"
              >
                <div className="space-y-2">
                  <Label>מספר מקומות בשורה</Label>
                  <Input
                    type="number"
                    min="1"
                    max="50"
                    value={seatsCount}
                    onChange={(e) => setSeatsCount(e.target.value)}
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={addRowMutation.isPending}>
                  {addRowMutation.isPending ? "מוסיף..." : "הוסף שורה"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-muted-foreground text-center py-4">טוען...</p>
        ) : !rows?.length ? (
          <div className="text-center py-12">
            <Armchair className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-muted-foreground">אין שורות עדיין. הוסף שורה ראשונה!</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Legend */}
            <div className="flex gap-4 text-xs text-muted-foreground justify-center pb-2">
              <span className="flex items-center gap-1">
                <span className="inline-block h-3 w-3 rounded bg-primary/20 border border-primary/40" />
                תפוס
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-3 w-3 rounded bg-muted border border-border" />
                פנוי
              </span>
            </div>

            {rows.map((row) => (
              <RowDisplay
                key={row.id}
                row={row}
                members={members || []}
                canManage={canManage}
                onDeleteRow={() => {
                  if (confirm("למחוק את השורה וכל המקומות בה?")) {
                    deleteRowMutation.mutate(row.id);
                  }
                }}
                onAssign={(seatId, profileId) => {
                  assignMutation.mutate({ seatId, profileId });
                }}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============ Row Display ============
function RowDisplay({
  row,
  members,
  canManage,
  onDeleteRow,
  onAssign,
}: {
  row: any;
  members: any[];
  canManage: boolean;
  onDeleteRow: () => void;
  onAssign: (seatId: string, profileId: string | null) => void;
}) {
  return (
    <div className="border rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">
          שורה {row.row_number}
        </span>
        {canManage && (
          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={onDeleteRow}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
      <div className="flex flex-wrap gap-2 justify-center">
        {row.seats?.map((seat: any) => (
          <SeatButton
            key={seat.id}
            seat={seat}
            members={members}
            canManage={canManage}
            onAssign={onAssign}
          />
        ))}
      </div>
    </div>
  );
}

// ============ Seat Button ============
function SeatButton({
  seat,
  members,
  canManage,
  onAssign,
}: {
  seat: any;
  members: any[];
  canManage: boolean;
  onAssign: (seatId: string, profileId: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const isAssigned = !!seat.assigned_to;
  const assignedProfile = seat.profiles;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          className={`
            relative flex flex-col items-center justify-center
            w-14 h-14 rounded-lg border-2 text-xs font-medium transition-all
            ${
              isAssigned
                ? "bg-primary/15 border-primary/40 text-primary hover:bg-primary/25"
                : "bg-muted/50 border-border text-muted-foreground hover:bg-muted"
            }
            ${canManage ? "cursor-pointer" : "cursor-default"}
          `}
          disabled={!canManage}
        >
          <Armchair className="h-4 w-4 mb-0.5" />
          <span className="text-[10px] leading-tight truncate max-w-[48px]">
            {isAssigned ? assignedProfile?.full_name?.split(" ")[0] || "תפוס" : seat.seat_number}
          </span>
        </button>
      </DialogTrigger>
      {canManage && (
        <DialogContent>
          <DialogHeader>
            <DialogTitle>מקום {seat.seat_number} - שורה {seat.row_number}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {isAssigned && (
              <div className="flex items-center justify-between rounded-lg border p-3 bg-primary/5">
                <div>
                  <p className="font-medium text-sm">{assignedProfile?.full_name}</p>
                  <p className="text-xs text-muted-foreground">{assignedProfile?.username}</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive"
                  onClick={() => {
                    onAssign(seat.id, null);
                    setOpen(false);
                  }}
                >
                  <X className="h-4 w-4 ml-1" />
                  הסר שיוך
                </Button>
              </div>
            )}
            <div className="space-y-2">
              <Label>שייך מתפלל</Label>
              <Select
                value=""
                onValueChange={(profileId) => {
                  onAssign(seat.id, profileId);
                  setOpen(false);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="בחר מתפלל..." />
                </SelectTrigger>
                <SelectContent>
                  {members?.map((m) => (
                    <SelectItem key={m.profiles?.id} value={m.profiles?.id || ""}>
                      {m.profiles?.full_name} ({m.profiles?.username})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}
