import { useState, useMemo } from "react";
import { useParams } from "react-router-dom";
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
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Armchair,
  CalendarOff,
  UserMinus,
  Printer,
  CheckCircle2,
  XCircle,
  MinusCircle,
  Star,
  Search,
} from "lucide-react";
import { getNextShabbat, getUpcomingShabbats, getUpcomingHolidays, formatHebrewDate, getShabbatLabel, formatHebrewDateOnly } from "@/lib/hebrewDates";

export default function AbsenceManager() {
  const { id: synagogueId } = useParams<{ id: string }>();
  const { isSuperAdmin, profile, roles } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Build combined list of upcoming dates (Shabbats + holidays), sorted and deduplicated
  const upcomingDates = useMemo(() => {
    const shabbats = getUpcomingShabbats(4).map(d => {
      return { date: d, label: getShabbatLabel(d), type: "shabbat" as const };
    });
    const holidays = getUpcomingHolidays().map(h => ({ date: h.date, label: h.hebrew, type: "holiday" as const }));
    const all = [...shabbats, ...holidays];
    // Deduplicate by date (prefer holiday label if same date)
    const map = new Map<string, typeof all[0]>();
    for (const item of all) {
      const existing = map.get(item.date);
      if (!existing || item.type === "holiday") {
        map.set(item.date, item);
      }
    }
    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, []);

  const [selectedDate, setSelectedDate] = useState(() => upcomingDates[0]?.date || getNextShabbat());
  const shabbatDate = selectedDate;

  const [markForOtherOpen, setMarkForOtherOpen] = useState(false);
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(new Set());
  const [memberSearch, setMemberSearch] = useState("");
  const [selectedSeat, setSelectedSeat] = useState<any>(null);

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

  // Fetch ALL sections with rows and seats (like SeatingMap)
  const { data: sections, isLoading: sectionsLoading } = useQuery({
    queryKey: ["absence_full_map", synagogueId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sections")
        .select("*, seat_rows(*, seats(*, profiles:assigned_to(id, full_name, username)))")
        .eq("synagogue_id", synagogueId!)
        .order("sort_order");
      if (error) throw error;

      return data?.map((section) => ({
        ...section,
        seat_rows: (section.seat_rows as any[])
          ?.sort((a: any, b: any) => a.row_number - b.row_number)
          .map((row: any) => ({
            ...row,
            seats: (row.seats as any[])?.sort(
              (a: any, b: any) => a.seat_number - b.seat_number
            ),
          })),
      }));
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

  // Gabbai: mark specific seat absent
  const markSeatAbsentMutation = useMutation({
    mutationFn: async (seat: any) => {
      const { error } = await supabase.from("absences").insert({
        profile_id: seat.assigned_to,
        synagogue_id: synagogueId!,
        shabbat_date: shabbatDate,
        seat_id: seat.id,
        marked_by: myProfileId,
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

  // Gabbai: cancel specific seat absence
  const cancelSeatAbsenceMutation = useMutation({
    mutationFn: async (seat: any) => {
      const { error } = await supabase.from("absences").delete()
        .eq("profile_id", seat.assigned_to)
        .eq("synagogue_id", synagogueId!)
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

  // Check for structural elements
  const hasAronKodesh = sections?.some((s) =>
    s.seat_rows?.some((r: any) =>
      r.seats?.some((seat: any) => seat.element_type === "aron_kodesh")
    )
  );

  return (
    <AppLayout title={`היעדרויות - ${synagogue?.name || ""}`} showBack>
      {/* Print-only header */}
      <div className="print-header">
        <h1 style={{ fontSize: '18px', fontWeight: 'bold', margin: 0 }}>לוח היעדרויות ושיבוץ אורחים</h1>
        <p style={{ fontSize: '14px', margin: '4px 0 0' }}>{synagogue?.name} — {formatHebrewDate(shabbatDate)}</p>
      </div>

      <div className="space-y-4">
        {/* Row 1: Date selector */}
        <Card className="no-print">
          <CardContent className="py-4">
            <p className="text-xs text-muted-foreground mb-2">בחר מועד לסימון היעדרות:</p>
            <div className="flex flex-wrap gap-2">
              {upcomingDates.map((d) => {
                const isSelected = d.date === selectedDate;
                return (
                  <Button
                    key={d.date}
                    variant={isSelected ? "default" : "outline"}
                    size="sm"
                    className={`gap-1.5 ${d.type === "holiday" && !isSelected ? "border-warning/50 text-warning" : ""}`}
                    onClick={() => setSelectedDate(d.date)}
                  >
                    {d.type === "holiday" && <Star className="h-3 w-3" />}
                    <span className="text-xs">{d.label}</span>
                    <span className="text-[10px] opacity-70">{formatHebrewDateOnly(d.date)}</span>
                  </Button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Row 2: Gabbai actions */}
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
              <Button variant="outline" size="sm" className="gap-2" onClick={() => {
                const floorPlan = document.querySelector('.print-floor-plan') as HTMLElement;
                if (floorPlan) {
                  const scrollContainer = floorPlan.querySelector('.overflow-x-auto') as HTMLElement;
                  if (scrollContainer) {
                    const contentWidth = scrollContainer.scrollWidth;
                    const pageWidth = 277 * 3.78;
                    const zoomX = pageWidth / contentWidth;
                    const optimalZoom = Math.min(zoomX, 1);
                    floorPlan.style.zoom = String(optimalZoom);
                  }
                }
                window.print();
                window.onafterprint = () => {
                  if (floorPlan) floorPlan.style.zoom = '';
                };
              }}>
                <Printer className="h-4 w-4" />
                הדפס מקומות פנויים
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Mark for other dialog */}
        <Dialog open={markForOtherOpen} onOpenChange={setMarkForOtherOpen}>
          <DialogContent dir="rtl" className="text-right">
            <DialogHeader>
              <DialogTitle>סמן היעדרות למתפלל</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <Popover open={memberSearchOpen} onOpenChange={setMemberSearchOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={memberSearchOpen}
                    className="w-full justify-between"
                  >
                    {selectedMemberId
                      ? members?.find((m) => (m.profiles as any)?.id === selectedMemberId)?.profiles?.full_name || "בחר מתפלל..."
                      : "בחר מתפלל..."}
                    <ChevronsUpDown className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0" dir="rtl">
                  <Command>
                    <CommandInput placeholder="חפש מתפלל..." />
                    <CommandList>
                      <CommandEmpty>לא נמצאו תוצאות</CommandEmpty>
                      <CommandGroup>
                        {members
                          ?.filter((m) => !absentProfileIds.has((m.profiles as any)?.id))
                          .map((m) => (
                            <CommandItem
                              key={(m.profiles as any)?.id}
                              value={`${(m.profiles as any)?.full_name} ${(m.profiles as any)?.username}`}
                              onSelect={() => {
                                setSelectedMemberId((m.profiles as any)?.id || "");
                                setMemberSearchOpen(false);
                              }}
                            >
                              {(m.profiles as any)?.full_name} ({(m.profiles as any)?.username})
                            </CommandItem>
                          ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
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

        {/* Unified Floor Plan (like SeatingMap) */}
        {sectionsLoading ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">טוען...</p>
            </CardContent>
          </Card>
        ) : !sections?.length ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Armchair className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground text-lg">אין מפת מקומות עדיין</p>
            </CardContent>
          </Card>
        ) : (
          <Card className="print-floor-plan">
            <CardContent className="p-3 sm:p-4">
              {/* Legend */}
              <div className="flex gap-4 text-xs text-muted-foreground justify-center pb-3 mb-3 border-b flex-wrap no-print">
                <span className="flex items-center gap-1">
                  <span className="inline-block h-3 w-3 rounded bg-teal-100 border-2 border-teal-500" />
                  המקום שלי
                </span>
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

              {/* Aron Kodesh at top */}
              {hasAronKodesh && (
                <div className="flex justify-center mb-4">
                  <div className="flex items-center justify-center rounded-xl border-2 border-primary/30 bg-primary/10 px-8 py-3 text-sm font-bold text-primary shadow-sm">
                    ארון קודש
                  </div>
                </div>
              )}

              {/* Scrollable floor plan - all sections side by side */}
              <div className="overflow-x-auto pb-2">
                <div className="flex gap-1 min-w-max justify-center">
                  {sections.map((section, sIdx) => (
                    <div key={section.id} className="flex gap-1">
                      {/* Section column */}
                      <div className="flex flex-col items-center gap-1">
                        {/* Section header */}
                        <div className="text-[10px] font-bold text-muted-foreground mb-1 whitespace-nowrap">
                          {section.name}
                        </div>

                        {/* Rows */}
                        {section.seat_rows?.map((row: any) => {
                          const isBimaRow = row.seats?.every(
                            (s: any) => s.element_type === "bima" || (!s.assigned_to && !s.element_type && !s.name)
                          ) && row.seats?.some((s: any) => s.element_type === "bima");

                          if (isBimaRow && sIdx === Math.floor((sections?.length || 0) / 2)) {
                            return (
                              <div key={row.id} className="flex items-center justify-center py-2">
                                <div className="flex items-center justify-center rounded-xl border-2 border-accent-foreground/20 bg-accent px-6 py-2 text-xs font-bold text-accent-foreground shadow-sm">
                                  בימה
                                </div>
                              </div>
                            );
                          }

                          if (isBimaRow) {
                            return <div key={row.id} className="h-10" />;
                          }

                          const displaySeats = row.seats?.filter(
                            (s: any) => !s.element_type || s.element_type === "amud" || s.element_type === "empty"
                          ) || [];

                          const regularSeats = displaySeats.filter(
                            (s: any) => s.element_type !== "amud" && s.element_type !== "aron_kodesh" && s.element_type !== "bima"
                          );

                          return (
                            <div key={row.id} className="flex gap-1 items-center print-seat-row">
                              {regularSeats.map((seat: any) => {
                                if (seat.element_type === 'empty') {
                                  return <div key={seat.id} className="w-14 h-14 sm:w-16 sm:h-16 pointer-events-none" />;
                                }

                                const isAssigned = !!seat.assigned_to;
                                const isSeatAbsent = isAssigned && absentSeatIds.has(seat.id);
                                const isCurrentUser = isAssigned && seat.assigned_to === myProfileId;
                                const assignedName = seat.profiles?.full_name;

                                let bgClass: string;
                                let borderClass: string;
                                let textClass: string;

                                let printClass: string;

                                if (isCurrentUser) {
                                  bgClass = "bg-teal-100";
                                  borderClass = "border-teal-500";
                                  textClass = "text-teal-900 font-bold";
                                  printClass = "print-seat-occupied";
                                } else if (!isAssigned) {
                                  bgClass = "bg-muted/50";
                                  borderClass = "border-border";
                                  textClass = "text-muted-foreground";
                                  printClass = "print-seat-empty";
                                } else if (isSeatAbsent) {
                                  bgClass = "bg-success/15";
                                  borderClass = "border-success/40";
                                  textClass = "text-success";
                                  printClass = "print-seat-available";
                                } else {
                                  bgClass = "bg-destructive/15";
                                  borderClass = "border-destructive/40";
                                  textClass = "text-destructive";
                                  printClass = "print-seat-occupied";
                                }

                                return (
                                  <button
                                    key={seat.id}
                                    className={`print-seat ${printClass} relative flex flex-col items-center justify-center w-14 h-14 sm:w-16 sm:h-16 rounded-lg border-2 text-xs font-medium transition-all ${bgClass} ${borderClass} ${textClass} hover:opacity-80 cursor-pointer`}
                                    style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' } as React.CSSProperties}
                                    onClick={() => isAssigned && setSelectedSeat(seat)}
                                    disabled={!isAssigned}
                                  >
                                    <Armchair className="h-3.5 w-3.5 mb-0.5" />
                                    <span className="text-[8px] leading-tight text-center whitespace-normal break-words max-w-[44px]">
                                      {isAssigned ? assignedName || "תפוס" : seat.seat_number}
                                    </span>
                                    {isSeatAbsent && (
                                      <span className="absolute -top-1 -left-1 h-3 w-3 rounded-full bg-success flex items-center justify-center">
                                        <CheckCircle2 className="h-2.5 w-2.5 text-success-foreground" />
                                      </span>
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          );
                        })}
                      </div>

                      {/* Separator between sections */}
                      {sIdx < (sections?.length || 0) - 1 && (
                        <div className="flex flex-col items-center justify-center mx-0.5">
                          <div className="w-px h-full bg-border" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Seat detail dialog (gabbai) */}
        <Dialog open={!!selectedSeat} onOpenChange={() => setSelectedSeat(null)}>
          <DialogContent dir="rtl" className="text-right">
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
                    {isGabbai && (
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
                    )}
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
      </div>
    </AppLayout>
  );
}
