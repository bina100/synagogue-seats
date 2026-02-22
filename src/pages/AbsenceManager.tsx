import { useState, useMemo } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Armchair,
  CalendarOff,
  UserMinus,
  Printer,
  CheckCircle2,
  XCircle,
  MinusCircle,
  Star,
} from "lucide-react";
import { HDate, HebrewCalendar, flags } from "@hebcal/core";

// Get next Shabbat date (upcoming Saturday)
function getNextShabbat(): string {
  const now = new Date();
  const day = now.getDay();
  const daysUntilShabbat = day === 6 ? 0 : (6 - day + 7) % 7 || 7;
  const shabbat = new Date(now);
  shabbat.setDate(now.getDate() + daysUntilShabbat);
  return shabbat.toISOString().split("T")[0];
}

// Get upcoming Jewish holidays (next 30 days)
function getUpcomingHolidays(): Array<{ date: string; name: string; hebrew: string }> {
  const now = new Date();
  const end = new Date(now);
  end.setDate(end.getDate() + 30);

  const events = HebrewCalendar.calendar({
    start: now,
    end,
    il: true,
    noMinorFast: true,
    noModern: true,
    noRoshChodesh: true,
    noSpecialShabbat: true,
  });

  return events
    .filter((ev) => ev.getFlags() & (flags.CHAG | flags.MAJOR_FAST | flags.YOM_TOV_ENDS))
    .map((ev) => ({
      date: ev.getDate().greg().toISOString().split("T")[0],
      name: ev.render("he"),
      hebrew: ev.renderBrief("he"),
    }));
}

function formatHebrewDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  const hdate = new HDate(date);
  const gregorian = date.toLocaleDateString("he-IL", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  return `${gregorian} • ${hdate.renderGematriya()}`;
}

export default function AbsenceManager() {
  const { id: synagogueId } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedSectionId = searchParams.get("section");
  const { isSuperAdmin, profile, roles } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [shabbatDate] = useState(getNextShabbat);
  const [markForOtherOpen, setMarkForOtherOpen] = useState(false);
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const holidays = useMemo(() => getUpcomingHolidays(), []);

  const isGabbai = isSuperAdmin || roles.some((r) => r.role === "gabbai" && r.synagogue_id === synagogueId);

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

  // Fetch absences for this shabbat
  const { data: absences } = useQuery({
    queryKey: ["absences", synagogueId, shabbatDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("absences")
        .select("*, profiles:profile_id(id, full_name, username), seat_id")
        .eq("synagogue_id", synagogueId!)
        .eq("shabbat_date", shabbatDate);
      if (error) throw error;
      return data;
    },
    enabled: !!synagogueId,
  });

  // Fetch members
  const { data: members } = useQuery({
    queryKey: ["members", synagogueId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("synagogue_members")
        .select("*, profiles:profile_id(id, full_name, username)")
        .eq("synagogue_id", synagogueId!);
      if (error) throw error;
      return data;
    },
    enabled: !!synagogueId,
  });

  const absentProfileIds = useMemo(
    () => new Set(absences?.map((a) => a.profile_id) || []),
    [absences]
  );

  const absentSeatIds = useMemo(
    () => new Set(absences?.map((a) => (a as any).seat_id).filter(Boolean) || []),
    [absences]
  );

  const myProfileId = profile?.id;
  const iAmAbsent = absences?.some(a => a.profile_id === myProfileId) || false;

  // Mark self absent
  const markAbsentMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("absences").insert({
        profile_id: myProfileId!,
        synagogue_id: synagogueId!,
        shabbat_date: shabbatDate,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["absences", synagogueId, shabbatDate] });
      toast({ title: "סומנת כלא מגיע לשבת הקרובה" });
    },
    onError: (e: Error) => {
      toast({ title: "שגיאה", description: e.message, variant: "destructive" });
    },
  });

  // Cancel absence
  const cancelAbsenceMutation = useMutation({
    mutationFn: async (profileId: string) => {
      const { error } = await supabase
        .from("absences")
        .delete()
        .eq("profile_id", profileId)
        .eq("synagogue_id", synagogueId!)
        .eq("shabbat_date", shabbatDate);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["absences", synagogueId, shabbatDate] });
      toast({ title: "ההיעדרות בוטלה" });
    },
  });

  // Mark absence for another member (gabbai)
  const markOtherAbsentMutation = useMutation({
    mutationFn: async (profileId: string) => {
      // Find all seats assigned to this profile in this synagogue
      const { data: seatRows } = await supabase
        .from("seat_rows")
        .select("id, sections!inner(synagogue_id)")
        .eq("sections.synagogue_id", synagogueId!);

      const rowIds = seatRows?.map((r: any) => r.id) || [];

      const { data: seats } = await supabase
        .from("seats")
        .select("id")
        .in("row_id", rowIds)
        .eq("assigned_to", profileId);

      if (!seats || seats.length === 0) {
        const { error } = await supabase.from("absences").insert({
          profile_id: profileId,
          synagogue_id: synagogueId!,
          shabbat_date: shabbatDate,
          marked_by: myProfileId,
        });
        if (error) throw error;
        return;
      }

      const rows = seats.map((s: any) => ({
        profile_id: profileId,
        synagogue_id: synagogueId!,
        shabbat_date: shabbatDate,
        marked_by: myProfileId,
        seat_id: s.id,
      }));
      const { error } = await supabase.from("absences").insert(rows);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["absences", synagogueId, shabbatDate] });
      setMarkForOtherOpen(false);
      setSelectedMemberId("");
      toast({ title: "היעדרות סומנה בהצלחה" });
    },
    onError: (e: Error) => {
      toast({ title: "שגיאה", description: e.message, variant: "destructive" });
    },
  });

  const activeSectionId = selectedSectionId || sections?.[0]?.id;

  // Print handler
  const handlePrint = () => {
    window.print();
  };

  return (
    <AppLayout title={`היעדרויות - ${synagogue?.name || ""}`} showBack>
      {/* Print-only header */}
      <div className="print-header">
        <h1 style={{ fontSize: '18px', fontWeight: 'bold', margin: 0 }}>לוח היעדרויות ושיבוץ אורחים</h1>
        <p style={{ fontSize: '14px', margin: '4px 0 0' }}>{synagogue?.name} — {formatHebrewDate(shabbatDate)}</p>
      </div>

      <div className="space-y-4">
        {/* Shabbat info + personal action */}
        <Card className="no-print">
          <CardContent className="py-4 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-center sm:text-right">
              <p className="text-sm text-muted-foreground">שבת קרובה</p>
              <p className="font-semibold text-lg">{formatHebrewDate(shabbatDate)}</p>
            </div>
            <div className="flex gap-2">
              {iAmAbsent ? (
                <Button
                  variant="outline"
                  className="gap-2 border-success text-success"
                  onClick={() => cancelAbsenceMutation.mutate(myProfileId!)}
                  disabled={cancelAbsenceMutation.isPending}
                >
                  <CheckCircle2 className="h-4 w-4" />
                  אני מגיע (בטל היעדרות)
                </Button>
              ) : (
                <Button
                  variant="outline"
                  className="gap-2 border-destructive text-destructive"
                  onClick={() => markAbsentMutation.mutate()}
                  disabled={markAbsentMutation.isPending}
                >
                  <CalendarOff className="h-4 w-4" />
                  לא מגיע לשבת
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Upcoming holidays */}
        {holidays.length > 0 && (
          <Card className="no-print">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Star className="h-4 w-4 text-warning" />
                חגים קרובים
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {holidays.map((h, i) => (
                  <Badge key={i} variant="outline" className="gap-1 bg-warning/10 text-warning border-warning/30">
                    {h.hebrew} - {formatHebrewDate(h.date)}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Gabbai controls */}
        {isGabbai && (
          <Card className="no-print">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">פעולות גבאי</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => setMarkForOtherOpen(true)}
              >
                <UserMinus className="h-4 w-4" />
                סמן היעדרות למתפלל
              </Button>
              <Button variant="outline" size="sm" className="gap-2" onClick={handlePrint}>
                <Printer className="h-4 w-4" />
                הדפס מקומות פנויים
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Mark for other dialog */}
        <Dialog open={markForOtherOpen} onOpenChange={setMarkForOtherOpen} >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>סמן היעדרות למתפלל</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <Select value={selectedMemberId} onValueChange={setSelectedMemberId}>
                <SelectTrigger>
                  <SelectValue placeholder="בחר מתפלל..." />
                </SelectTrigger>
                <SelectContent>
                  {members
                    ?.filter((m) => !absentProfileIds.has((m.profiles as any)?.id))
                    .map((m) => (
                      <SelectItem key={(m.profiles as any)?.id} value={(m.profiles as any)?.id || ""}>
                        {(m.profiles as any)?.full_name} ({(m.profiles as any)?.username})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <Button
                className="w-full"
                disabled={!selectedMemberId || markOtherAbsentMutation.isPending}
                onClick={() => markOtherAbsentMutation.mutate(selectedMemberId)}
              >
                {markOtherAbsentMutation.isPending ? "מסמן..." : "סמן כלא מגיע"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Absence list */}
        {isGabbai && absences && absences.length > 0 && (
          <Card className="no-print">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <XCircle className="h-4 w-4 text-destructive" />
                נעדרים ({absences.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {absences.map((a) => (
                  <Badge
                    key={a.id}
                    variant="secondary"
                    className="gap-1 cursor-pointer hover:bg-destructive/10"
                    onClick={() => {
                      if (confirm(`לבטל היעדרות של ${(a.profiles as any)?.full_name}?`)) {
                        cancelAbsenceMutation.mutate(a.profile_id);
                      }
                    }}
                  >
                    {(a.profiles as any)?.full_name}
                    <XCircle className="h-3 w-3" />
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Section tabs */}
        {sections && sections.length > 0 && (
          <>
            <div className="flex gap-2 overflow-x-auto pb-2 no-print">
              {sections.map((s) => (
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

            {/* Screen: show active section only */}
            <div className="no-print">
              {activeSectionId && (
                <AbsenceSeatingMap
                  sectionId={activeSectionId}
                  synagogueId={synagogueId!}
                  absentSeatIds={absentSeatIds}
                  currentUserProfileId={myProfileId}
                  shabbatDate={shabbatDate}
                />
              )}
            </div>

            {/* Print: show ALL sections */}
            <div className="print-only">
              {sections.map((s) => (
                <div key={s.id} className="print-map-container">
                  <div className="print-section-title">{s.name}</div>
                  <AbsenceSeatingMap
                    sectionId={s.id}
                    synagogueId={synagogueId!}
                    absentSeatIds={absentSeatIds}
                    currentUserProfileId={myProfileId}
                    shabbatDate={shabbatDate}
                  />
                </div>
              ))}
            </div>
          </>
        )}

        {/* Legend */}
        <div className="flex gap-4 text-xs text-muted-foreground justify-center no-print">
          <span className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded bg-destructive/20 border border-destructive/40" />
            תפוס
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded bg-success/20 border border-success/40" />
            פנוי (נעדר)
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded bg-muted border border-border" />
            לא שויך
          </span>
        </div>
      </div>
    </AppLayout>
  );
}

// ============ Absence Seating Map (read-only colorful view) ============
function AbsenceSeatingMap({
  sectionId,
  synagogueId,
  absentSeatIds,
  currentUserProfileId,
  shabbatDate,
}: {
  sectionId: string;
  synagogueId: string;
  absentSeatIds: Set<string>;
  currentUserProfileId?: string;
  shabbatDate: string;
}) {
  const [selectedSeat, setSelectedSeat] = useState<any>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Mark seat absent (Gabbai)
  const markSeatAbsentMutation = useMutation({
    mutationFn: async (seat: any) => {
      const { error } = await supabase.from("absences").insert({
        profile_id: seat.assigned_to,
        synagogue_id: synagogueId,
        shabbat_date: shabbatDate,
        seat_id: seat.id,
        marked_by: currentUserProfileId,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["absences", synagogueId, shabbatDate] });
      setSelectedSeat(null);
      toast({ title: "סטטוס המקום עודכן" });
    },
    onError: (e: Error) => {
      toast({ title: "שגיאה", description: e.message, variant: "destructive" });
    },
  });

  // Cancel seat absence (Gabbai)
  const cancelSeatAbsenceMutation = useMutation({
    mutationFn: async (seat: any) => {
      const { error } = await supabase.from("absences").delete()
        .eq("profile_id", seat.assigned_to)
        .eq("synagogue_id", synagogueId)
        .eq("shabbat_date", shabbatDate)
        .eq("seat_id", seat.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["absences", synagogueId, shabbatDate] });
      setSelectedSeat(null);
      toast({ title: "סטטוס המקום עודכן" });
    },
  });

  const { data: rows, isLoading } = useQuery({
    queryKey: ["seat_rows", sectionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("seat_rows")
        .select("*, seats(*, profiles:assigned_to(id, full_name, username))")
        .eq("section_id", sectionId)
        .order("row_number");
      if (error) throw error;
      return data?.map((row) => ({
        ...row,
        seats: (row.seats as any[])?.sort(
          (a: any, b: any) => a.seat_number - b.seat_number
        ),
      }));
    },
  });

  // Stats
  const stats = useMemo(() => {
    if (!rows) return { total: 0, occupied: 0, available: 0, unassigned: 0 };
    let total = 0, occupied = 0, available = 0, unassigned = 0;
    rows.forEach((row) => {
      row.seats?.forEach((seat: any) => {
        if (seat.element_type) return; // skip structural/empty
        total++;
        if (!seat.assigned_to) {
          unassigned++;
        } else if (absentSeatIds.has(seat.id)) {
          available++;
        } else {
          occupied++;
        }
      });
    });
    return { total, occupied, available, unassigned };
  }, [rows, absentSeatIds]);

  if (isLoading) {
    return <p className="text-muted-foreground text-center py-4">טוען...</p>;
  }

  if (!rows?.length) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <Armchair className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
          <p className="text-muted-foreground">אין שורות במחלקה זו</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2 no-print">
        <CardTitle className="text-base">מפת מקומות</CardTitle>
        <div className="flex gap-3 text-sm">
          <span className="text-destructive font-medium">{stats.occupied} תפוסים</span>
          <span className="text-success font-medium">{stats.available} פנויים</span>
          <span className="text-muted-foreground">{stats.unassigned} לא שויכו</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.map((row) => (
          <div key={row.id} className="space-y-1">
            <span className="text-xs text-muted-foreground no-print">שורה {row.row_number}</span>
            <div className="flex flex-wrap gap-1.5 justify-center">
              {row.seats?.map((seat: any) => {
                if (seat.element_type === 'empty') {
                  return <div key={seat.id} className="w-14 h-14 pointer-events-none" />;
                }
                if (seat.element_type) return null;

                const isAssigned = !!seat.assigned_to;
                const isAbsent = isAssigned && absentSeatIds.has(seat.id);
                const isCurrentUser = isAssigned && seat.assigned_to === currentUserProfileId;
                const assignedName = seat.profiles?.full_name;

                let bgClass: string;
                let borderClass: string;
                let textClass: string;

                if (isCurrentUser) {
                  bgClass = "bg-teal-100";
                  borderClass = "border-teal-500";
                  textClass = "text-teal-900 font-bold";
                } else if (!isAssigned) {
                  bgClass = "bg-muted/50";
                  borderClass = "border-border";
                  textClass = "text-muted-foreground";
                } else if (isAbsent) {
                  bgClass = "bg-success/15";
                  borderClass = "border-success/40";
                  textClass = "text-success";
                } else {
                  bgClass = "bg-destructive/15";
                  borderClass = "border-destructive/40";
                  textClass = "text-destructive";
                }

                return (
                  <button
                    key={seat.id}
                    className={`print-seat relative flex flex-col items-center justify-center w-14 h-14 rounded-lg border-2 text-xs font-medium transition-all ${bgClass} ${borderClass} ${textClass} hover:opacity-80`}
                    style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' } as React.CSSProperties}
                    onClick={() => setSelectedSeat(seat)}
                  >
                    <Armchair className="h-4 w-4 mb-0.5" />
                    <span className="text-[8px] leading-tight text-center whitespace-normal break-words max-w-[48px]">
                      {isAssigned
                        ? assignedName || "תפוס"
                        : seat.seat_number}
                    </span>
                    {isAbsent && (
                      <span className="absolute -top-1 -left-1 h-3 w-3 rounded-full bg-success flex items-center justify-center">
                        <CheckCircle2 className="h-2.5 w-2.5 text-success-foreground" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        {/* Seat detail dialog */}
        <Dialog open={!!selectedSeat} onOpenChange={() => setSelectedSeat(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>פרטי מקום</DialogTitle>
            </DialogHeader>
            {selectedSeat && (
              <div className="space-y-2 text-sm">
                <p>
                  <strong>מקום:</strong> {selectedSeat.seat_number}
                </p>
                {selectedSeat.profiles ? (
                  <>
                    <p>
                      <strong>משויך ל:</strong> {selectedSeat.profiles.full_name}
                    </p>
                    <p>
                      <strong>סטטוס:</strong>{" "}
                      {absentSeatIds.has(selectedSeat.id) ? (
                        <Badge variant="outline" className="bg-success/10 text-success border-success/30">
                          <CheckCircle2 className="h-3 w-3 ml-1" />
                          פנוי (נעדר)
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30">
                          <XCircle className="h-3 w-3 ml-1" />
                          תפוס
                        </Badge>
                      )}
                    </p>
                    <div className="pt-2">
                      {absentSeatIds.has(selectedSeat.id) ? (
                        <Button
                          variant="outline"
                          className="w-full gap-2 border-success text-success"
                          onClick={() => cancelSeatAbsenceMutation.mutate(selectedSeat)}
                          disabled={cancelSeatAbsenceMutation.isPending}
                        >
                          <CheckCircle2 className="h-4 w-4" />
                          בטל היעדרות למקום זה
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          className="w-full gap-2 border-destructive text-destructive"
                          onClick={() => markSeatAbsentMutation.mutate(selectedSeat)}
                          disabled={markSeatAbsentMutation.isPending}
                        >
                          <CalendarOff className="h-4 w-4" />
                          סמן מקום זה כפנוי (נעדר)
                        </Button>
                      )}
                    </div>
                  </>
                ) : (
                  <p className="text-muted-foreground">
                    <MinusCircle className="h-3 w-3 inline ml-1" />
                    לא שויך למתפלל
                  </p>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
