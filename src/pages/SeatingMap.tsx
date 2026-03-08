import { useState, useCallback, useMemo, useRef } from "react";
import { useParams } from "react-router-dom";
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Plus, Trash2, Armchair, Upload, FileSpreadsheet, Download, Printer, LayoutGrid, Pencil, Search, ChevronDown } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import SeatCell from "@/components/seating/SeatCell";
import StructuralElement from "@/components/seating/StructuralElement";
import NewMapWizard from "@/components/seating/NewMapWizard";
import { parseSeatingExcel, type ParsedSection } from "@/lib/parseSeatingExcel";
import { getNextShabbat, getNextEventLabel } from "@/lib/hebrewDates";

export default function SeatingMap() {
  const { id: synagogueId } = useParams<{ id: string }>();
  const { isSuperAdmin, profile, roles } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const canManage = isSuperAdmin || roles.some((r) => r.role === "gabbai" && r.synagogue_id === synagogueId);
  const nextShabbat = getNextShabbat();
  const shabbatLabel = useMemo(() => getNextEventLabel(), []);

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

  // Fetch ALL sections with their rows and seats
  const { data: sections, isLoading } = useQuery({
    queryKey: ["full_seating_map", synagogueId],
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

  // Fetch members for assignment
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

  // Fetch current user's absences for upcoming Shabbat (per-seat)
  const { data: myAbsences } = useQuery({
    queryKey: ["my_absences", synagogueId, profile?.id, nextShabbat],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("absences")
        .select("id, seat_id")
        .eq("profile_id", profile!.id)
        .eq("synagogue_id", synagogueId!)
        .eq("shabbat_date", nextShabbat);
      if (error) throw error;
      return data;
    },
    enabled: !!synagogueId && !!profile?.id,
  });

  const absentSeatIds = new Set((myAbsences ?? []).map(a => a.seat_id).filter(Boolean));

  // Fetch ALL absences for this synagogue (gabbai view)
  const { data: allAbsences } = useQuery({
    queryKey: ["absences", synagogueId, nextShabbat],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("absences")
        .select("id, seat_id, profile_id")
        .eq("synagogue_id", synagogueId!)
        .eq("shabbat_date", nextShabbat);
      if (error) throw error;
      return data;
    },
    enabled: !!synagogueId && canManage,
  });
  const allAbsentSeatIds = useMemo(() => new Set((allAbsences ?? []).map(a => a.seat_id).filter(Boolean)), [allAbsences]);

  // Auto-scroll to user's seat using callback ref
  const hasScrolled = useRef(false);
  const userSeatCallbackRef = useCallback((node: HTMLButtonElement | null) => {
    if (node && !hasScrolled.current) {
      hasScrolled.current = true;
      setTimeout(() => {
        node.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
      }, 300);
    }
  }, []);
  // Assign mutation
  const assignMutation = useMutation({
    mutationFn: async ({ seatId, profileId }: { seatId: string; profileId: string | null }) => {
      const { error } = await supabase
        .from("seats")
        .update({ assigned_to: profileId })
        .eq("id", seatId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["full_seating_map", synagogueId] });
    },
  });

  // Insert absence mutation (per-seat)
  const insertAbsenceMutation = useMutation({
    mutationFn: async (seatId: string) => {
      const { error } = await supabase.from("absences").insert({
        profile_id: profile!.id,
        synagogue_id: synagogueId!,
        shabbat_date: nextShabbat,
        seat_id: seatId,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my_absences", synagogueId] });
      queryClient.invalidateQueries({ queryKey: ["absences"] });
      toast({ title: "היעדרות דווחה בהצלחה" });
    },
    onError: (e: Error) => {
      toast({ title: "שגיאה", description: e.message, variant: "destructive" });
    },
  });

  // Delete absence mutation (per-seat)
  const deleteAbsenceMutation = useMutation({
    mutationFn: async (seatId: string) => {
      const { error } = await supabase
        .from("absences")
        .delete()
        .eq("profile_id", profile!.id)
        .eq("synagogue_id", synagogueId!)
        .eq("shabbat_date", nextShabbat)
        .eq("seat_id", seatId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my_absences", synagogueId] });
      queryClient.invalidateQueries({ queryKey: ["absences"] });
      toast({ title: "ההיעדרות בוטלה בהצלחה" });
    },
    onError: (e: Error) => {
      toast({ title: "שגיאה", description: e.message, variant: "destructive" });
    },
  });

  const handleAssign = useCallback(
    (seatId: string, profileId: string | null) => {
      assignMutation.mutate({ seatId, profileId });
    },
    [assignMutation]
  );

  const handleToggleAbsence = useCallback((seatId: string) => {
    if (absentSeatIds.has(seatId)) {
      deleteAbsenceMutation.mutate(seatId);
    } else {
      insertAbsenceMutation.mutate(seatId);
    }
  }, [absentSeatIds, deleteAbsenceMutation, insertAbsenceMutation]);

  // Gabbai absence mutations
  const markGabbaiAbsenceMutation = useMutation({
    mutationFn: async ({ seatId, profileId }: { seatId: string; profileId: string }) => {
      const { error } = await supabase.from("absences").insert({
        profile_id: profileId,
        synagogue_id: synagogueId!,
        shabbat_date: nextShabbat,
        seat_id: seatId,
        marked_by: profile!.id,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["absences"] });
      queryClient.invalidateQueries({ queryKey: ["my_absences", synagogueId] });
      toast({ title: "סטטוס המקום עודכן" });
    },
  });

  const cancelGabbaiAbsenceMutation = useMutation({
    mutationFn: async ({ seatId }: { seatId: string; profileId: string }) => {
      const { error } = await supabase.from("absences").delete()
        .eq("seat_id", seatId)
        .eq("synagogue_id", synagogueId!)
        .eq("shabbat_date", nextShabbat);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["absences"] });
      queryClient.invalidateQueries({ queryKey: ["my_absences", synagogueId] });
      toast({ title: "סטטוס המקום עודכן" });
    },
  });

  const handleToggleGabbaiAbsence = useCallback((seatId: string, profileId: string) => {
    if (allAbsentSeatIds.has(seatId)) {
      cancelGabbaiAbsenceMutation.mutate({ seatId, profileId });
    } else {
      markGabbaiAbsenceMutation.mutate({ seatId, profileId });
    }
  }, [allAbsentSeatIds, cancelGabbaiAbsenceMutation, markGabbaiAbsenceMutation]);
  // ========== Excel Import ==========
  const [importOpen, setImportOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [parsedData, setParsedData] = useState<ParsedSection[] | null>(null);
  const [importing, setImporting] = useState(false);
  const [createdUsers, setCreatedUsers] = useState<{ fullName: string; username: string; password: string }[]>([]);
  const [failedUsers, setFailedUsers] = useState<{ name: string; error: string }[]>([]);
  const [showImportResults, setShowImportResults] = useState(false);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const buffer = await file.arrayBuffer();
      const parsed = parseSeatingExcel(buffer);
      if (!parsed.length) {
        toast({ title: "לא נמצאו טורים בקובץ", variant: "destructive" });
        return;
      }
      setParsedData(parsed);
    } catch (err: any) {
      toast({ title: "שגיאה בקריאת הקובץ", description: err.message, variant: "destructive" });
    }
  };

  const handleImport = async () => {
    if (!parsedData || !synagogueId) return;
    setImporting(true);

    try {
      const { data, error } = await supabase.functions.invoke("import-seating-map", {
        body: { synagogue_id: synagogueId, sections: parsedData },
      });

      if (error) throw error;

      const stats = data.stats;
      toast({
        title: "הייבוא הצליח!",
        description: `${stats.sections} מחלקות, ${stats.rows} שורות, ${stats.seats} מקומות. ${stats.matched} שויכו אוטומטית.`,
      });

      if (stats.createdUsers?.length) {
        setCreatedUsers(stats.createdUsers);
      }
      if (stats.failed?.length) {
        setFailedUsers(stats.failed);
      }
      if (stats.createdUsers?.length || stats.failed?.length) {
        setShowImportResults(true);
      }

      queryClient.invalidateQueries({ queryKey: ["full_seating_map", synagogueId] });
      setImportOpen(false);
      setParsedData(null);
    } catch (err: any) {
      toast({ title: "שגיאה בייבוא", description: err.message, variant: "destructive" });
    } finally {
      setImporting(false);
    }
  };

  const downloadCreatedUsersCsv = () => {
    const bom = "\uFEFF";
    const header = "שם מלא,שם משתמש,סיסמה\n";
    const rows = createdUsers.map((u) => `${u.fullName},${u.username},${u.password}`).join("\n");
    const blob = new Blob([bom + header + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "משתמשים_חדשים.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  // Check for structural elements
  const hasAronKodesh = sections?.some((s) =>
    s.seat_rows?.some((r: any) =>
      r.seats?.some((seat: any) => seat.element_type === "aron_kodesh")
    )
  );

  if (isLoading) {
    return (
      <AppLayout title={`מפת מקומות - ${synagogue?.name || ""}`} showBack={canManage}>
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">טוען...</p>
          </CardContent>
        </Card>
      </AppLayout>
    );
  }

  return (
    <AppLayout title={`מפת מקומות - ${synagogue?.name || ""}`} showBack={canManage}>
      <div className="space-y-4">
        {/* Actions bar */}
        {canManage && (
          <div className="space-y-2 no-print">
            <div className="flex gap-2 justify-end flex-wrap">
              <Button variant="outline" size="sm" className="gap-2" onClick={() => setWizardOpen(true)}>
                <LayoutGrid className="h-4 w-4" />
                בנה מפה חדשה
              </Button>
              <Button variant="outline" size="sm" className="gap-2" onClick={() => {
                const floorPlan = document.querySelector('.print-floor-plan') as HTMLElement;
                if (floorPlan) {
                  const scrollContainer = floorPlan.querySelector('.overflow-x-auto') as HTMLElement;
                  if (scrollContainer) {
                    const contentWidth = scrollContainer.scrollWidth;
                    const contentHeight = scrollContainer.scrollHeight;
                    const pageWidth = 277 * 3.78;
                    const pageHeight = 190 * 3.78;
                    const zoomX = pageWidth / contentWidth;
                    const zoomY = pageHeight / contentHeight;
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
                הדפסה
              </Button>
              <Dialog open={importOpen} onOpenChange={(o) => { setImportOpen(o); if (!o) setParsedData(null); }}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2">
                    <Upload className="h-4 w-4" />
                    ייבוא מאקסל
                  </Button>
                </DialogTrigger>
                <DialogContent dir="rtl" className="max-w-md text-right">
                  <DialogHeader>
                    <DialogTitle>ייבוא מפת מקומות מאקסל</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>בחר קובץ Excel</Label>
                      <Input
                        type="file"
                        accept=".xlsx,.xls"
                        onChange={handleFileSelect}
                        className="cursor-pointer"
                      />
                    </div>

                    {parsedData && (
                      <div className="space-y-3">
                        <div className="rounded-lg border bg-muted/50 p-3 space-y-1">
                          <p className="text-sm font-medium">נמצאו בקובץ:</p>
                          <p className="text-sm text-muted-foreground">
                            {parsedData.length} טורים
                          </p>
                          {parsedData.map((s) => (
                            <p key={s.name} className="text-xs text-muted-foreground">
                              {s.name}: {s.rows.length} שורות,{" "}
                              {s.rows.reduce((sum, r) => sum + r.seats.filter(
                                (seat) => seat.name || seat.element_type
                              ).length, 0)}{" "}
                              מקומות
                            </p>
                          ))}
                        </div>

                        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                          <p className="text-xs text-destructive font-medium">
                            ⚠️ הייבוא ימחק את כל המפה הקיימת ויבנה אותה מחדש
                          </p>
                        </div>

                        <Button
                          onClick={handleImport}
                          className="w-full gap-2"
                          disabled={importing}
                        >
                          <FileSpreadsheet className="h-4 w-4" />
                          {importing ? "מייבא..." : "ייבא מפה"}
                        </Button>
                      </div>
                    )}
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            {/* Edit Map - Sections Management */}
            <SectionsManager synagogueId={synagogueId!} />
          </div>
        )}

        {/* Floor Plan */}
        {!sections?.length ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Armchair className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground text-lg">אין מפת מקומות עדיין</p>
              <p className="text-muted-foreground text-sm mt-2">
                ייבא קובץ אקסל או בנה מפה חדשה
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card className="print-floor-plan">
            <CardContent className="p-3 sm:p-4">
              {/* Legend */}
              <div className="flex gap-4 text-xs text-muted-foreground justify-center pb-3 mb-3 border-b flex-wrap">
                <span className="flex items-center gap-1">
                  <span className="inline-block h-3 w-3 rounded bg-teal-100 border-2 border-teal-500" />
                  המקום שלי
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-3 w-3 rounded bg-primary/20 border border-primary/40" />
                  תפוס
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-3 w-3 rounded bg-muted border border-border" />
                  פנוי
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

              {/* Scrollable floor plan */}
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
                        {section.seat_rows?.map((row: any, rowIdx: number) => {
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
                            <div key={row.id} className="flex gap-1 items-center">
                              {regularSeats.map((seat: any) => (
                              <SeatCell
                                  key={seat.id}
                                  seat={seat}
                                  members={members || []}
                                  canManage={canManage}
                                  onAssign={handleAssign}
                                  currentUserProfileId={profile?.id}
                                  isAbsent={seat.assigned_to === profile?.id ? absentSeatIds.has(seat.id) : undefined}
                                  onToggleAbsence={seat.assigned_to === profile?.id ? () => handleToggleAbsence(seat.id) : undefined}
                                  isAbsentForGabbai={canManage && seat.assigned_to ? allAbsentSeatIds.has(seat.id) : undefined}
                                  onToggleGabbaiAbsence={canManage && seat.assigned_to ? () => handleToggleGabbaiAbsence(seat.id, seat.assigned_to) : undefined}
                                  myRef={seat.assigned_to === profile?.id ? userSeatCallbackRef : undefined}
                                  shabbatLabel={shabbatLabel}
                                />
                              ))}
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

        {/* Print-only title banner */}
        <div className="print-header">
          <h1 style={{ fontSize: '20px', fontWeight: 'bold', margin: 0 }}>
            מפת מקומות - {synagogue?.name || ""}
          </h1>
        </div>
      </div>

      {/* Import Results Dialog */}
      <Dialog open={showImportResults} onOpenChange={setShowImportResults}>
        <DialogContent dir="rtl" className="max-w-lg max-h-[80vh] overflow-y-auto text-right">
          <DialogHeader>
            <DialogTitle>תוצאות ייבוא משתמשים</DialogTitle>
          </DialogHeader>

          {createdUsers.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-green-700 dark:text-green-400">
                ✅ {createdUsers.length} משתמשים נוצרו בהצלחה
              </p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">שם מלא</TableHead>
                    <TableHead className="text-right">שם משתמש</TableHead>
                    <TableHead className="text-right">סיסמה</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {createdUsers.map((u, i) => (
                    <TableRow key={i}>
                      <TableCell>{u.fullName}</TableCell>
                      <TableCell className="font-mono text-xs">{u.username}</TableCell>
                      <TableCell className="font-mono text-xs">{u.password}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Button onClick={downloadCreatedUsersCsv} variant="outline" className="w-full gap-2">
                <Download className="h-4 w-4" />
                הורד CSV
              </Button>
            </div>
          )}

          {failedUsers.length > 0 && (
            <div className="space-y-2 mt-4">
              <p className="text-sm font-medium text-destructive">
                ❌ {failedUsers.length} משתמשים נכשלו
              </p>
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-1 max-h-60 overflow-y-auto">
                {failedUsers.map((f, i) => (
                  <div key={i} className="text-xs space-y-0.5">
                    <span className="font-medium">{f.name}</span>
                    <span className="text-destructive block font-mono">{f.error}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

// ============ Sections Manager (Edit Map) ============
function SectionsManager({ synagogueId }: { synagogueId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [sectionName, setSectionName] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  const { data: sections } = useQuery({
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
      queryClient.invalidateQueries({ queryKey: ["full_seating_map", synagogueId] });
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
      queryClient.invalidateQueries({ queryKey: ["full_seating_map", synagogueId] });
      toast({ title: "מחלקה נמחקה" });
    },
  });

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="outline" className="w-full gap-2 justify-between">
          <span className="flex items-center gap-2">
            <Pencil className="h-4 w-4" />
            עריכת מפה - ניהול מחלקות
          </span>
          <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <Card className="mt-2">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base">מחלקות</CardTitle>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-2">
                  <Plus className="h-4 w-4" />
                  הוסף מחלקה
                </Button>
              </DialogTrigger>
              <DialogContent dir="rtl" className="text-right">
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
                      placeholder='לדוגמה: אולם ראשי / עזרת נשים'
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={createMutation.isPending}>
                    {createMutation.isPending ? "יוצר..." : "צור מחלקה"}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent className="pt-0">
            {!sections?.length ? (
              <p className="text-muted-foreground text-center py-4 text-sm">אין מחלקות עדיין</p>
            ) : (
              <>
                {sections.length > 5 && (
                  <div className="relative mb-3">
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="חפש מחלקה..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pr-9 text-right"
                      dir="rtl"
                    />
                  </div>
                )}
                <div className="space-y-2">
                  {sections
                    .filter((s) => !searchTerm || s.name.toLowerCase().includes(searchTerm.toLowerCase()))
                    .map((s) => (
                      <div key={s.id} className="flex items-center justify-between rounded-lg border p-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent">
                            <LayoutGrid className="h-4 w-4 text-accent-foreground" />
                          </div>
                          <p className="font-medium text-sm">{s.name}</p>
                        </div>
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
                      </div>
                    ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </CollapsibleContent>
    </Collapsible>
  );
}
