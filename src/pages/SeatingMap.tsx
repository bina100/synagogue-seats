import { useState, useCallback } from "react";
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
import { Plus, Trash2, Armchair, Upload, FileSpreadsheet, Download } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import SeatCell from "@/components/seating/SeatCell";
import StructuralElement from "@/components/seating/StructuralElement";
import { parseSeatingExcel, type ParsedSection } from "@/lib/parseSeatingExcel";

export default function SeatingMap() {
  const { id: synagogueId } = useParams<{ id: string }>();
  const { isSuperAdmin, profile, roles } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const canManage = isSuperAdmin || roles.some((r) => r.role === "gabbai" && r.synagogue_id === synagogueId);

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

      // Sort rows and seats within each section
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

  const handleAssign = useCallback(
    (seatId: string, profileId: string | null) => {
      assignMutation.mutate({ seatId, profileId });
    },
    [assignMutation]
  );

  // ========== Excel Import ==========
  const [importOpen, setImportOpen] = useState(false);
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

  // Calculate max rows across all sections for grid alignment
  const maxRows = sections?.reduce(
    (max, s) => Math.max(max, s.seat_rows?.length || 0),
    0
  ) || 0;

  // Check for structural elements spanning across sections (aron_kodesh at top, bima in middle)
  // We detect aron_kodesh and bima from the first row of the first section that has them
  const hasAronKodesh = sections?.some((s) =>
    s.seat_rows?.some((r: any) =>
      r.seats?.some((seat: any) => seat.element_type === "aron_kodesh")
    )
  );
  const bimaRowIndex = (() => {
    for (const s of sections || []) {
      for (let i = 0; i < (s.seat_rows?.length || 0); i++) {
        if (s.seat_rows[i]?.seats?.some((seat: any) => seat.element_type === "bima")) {
          return i;
        }
      }
    }
    return -1;
  })();

  if (isLoading) {
    return (
      <AppLayout title={`מפת מקומות - ${synagogue?.name || ""}`} showBack>
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">טוען...</p>
          </CardContent>
        </Card>
      </AppLayout>
    );
  }

  return (
    <AppLayout title={`מפת מקומות - ${synagogue?.name || ""}`} showBack>
      <div className="space-y-4">
        {/* Actions bar */}
        {canManage && (
          <div className="flex gap-2 justify-end">
            <Dialog open={importOpen} onOpenChange={(o) => { setImportOpen(o); if (!o) setParsedData(null); }}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <Upload className="h-4 w-4" />
                  ייבוא מאקסל
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
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
        )}

        {/* Floor Plan */}
        {!sections?.length ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Armchair className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground text-lg">אין מפת מקומות עדיין</p>
              <p className="text-muted-foreground text-sm mt-2">
                ייבא קובץ אקסל כדי לבנות את מפת המקומות
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-3 sm:p-4">
              {/* Legend */}
              <div className="flex gap-4 text-xs text-muted-foreground justify-center pb-3 mb-3 border-b">
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
                  {sections.map((section, sIdx) => {
                    // Check if this section has pillar (amud) between it and the next
                    const hasAmudBefore = sIdx > 0 && sections.some((s) =>
                      s.seat_rows?.some((r: any) =>
                        r.seats?.some(
                          (seat: any) => seat.element_type === "amud"
                        )
                      )
                    );

                    return (
                      <div key={section.id} className="flex gap-1">
                        {/* Section column */}
                        <div className="flex flex-col items-center gap-1">
                          {/* Section header */}
                          <div className="text-[10px] font-bold text-muted-foreground mb-1 whitespace-nowrap">
                            {section.name}
                          </div>

                          {/* Rows */}
                          {section.seat_rows?.map((row: any, rowIdx: number) => {
                            // Check for bima row - render bima element spanning across
                            const isBimaRow = row.seats?.every(
                              (s: any) => s.element_type === "bima" || (!s.assigned_to && !s.element_type && !s.name)
                            ) && row.seats?.some((s: any) => s.element_type === "bima");

                            if (isBimaRow && sIdx === Math.floor((sections?.length || 0) / 2)) {
                              // Render bima only in the middle section
                              return (
                                <div key={row.id} className="flex items-center justify-center py-2">
                                  <div className="flex items-center justify-center rounded-xl border-2 border-accent-foreground/20 bg-accent px-6 py-2 text-xs font-bold text-accent-foreground shadow-sm">
                                    בימה
                                  </div>
                                </div>
                              );
                            }

                            if (isBimaRow) {
                              // Empty space for other sections at bima row
                              return <div key={row.id} className="h-10" />;
                            }

                            // Filter out structural elements from seat display
                            const displaySeats = row.seats?.filter(
                              (s: any) => !s.element_type || s.element_type === "amud"
                            ) || [];

                            // Check if row has amud
                            const amudSeats = displaySeats.filter(
                              (s: any) => s.element_type === "amud"
                            );
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
                                  />
                                ))}
                              </div>
                            );
                          })}
                        </div>

                        {/* Separator / amud between sections */}
                        {sIdx < (sections?.length || 0) - 1 && (
                          <div className="flex flex-col items-center justify-center mx-0.5">
                            <div className="w-px h-full bg-border" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Import Results Dialog */}
      <Dialog open={showImportResults} onOpenChange={setShowImportResults}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
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
