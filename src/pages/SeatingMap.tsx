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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Plus, Trash2, Armchair, Upload, FileSpreadsheet, Download, Printer, LayoutGrid, Pencil, Search, ChevronDown, ChevronUp, X, Save, Settings2 } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, horizontalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import SeatCell from "@/components/seating/SeatCell";
import SeatEditDialog from "@/components/seating/SeatEditDialog";
import { DraggableSeat } from "@/components/seating/DraggableSeat";
import StructuralElement from "@/components/seating/StructuralElement";
import NewMapWizard from "@/components/seating/NewMapWizard";
import { parseSeatingExcel, type ParsedSection } from "@/lib/parseSeatingExcel";
import { getNextShabbat, getNextEventLabel } from "@/lib/hebrewDates";

// Deep clone helper
function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

export default function SeatingMap() {
  const { id: synagogueId } = useParams<{ id: string }>();
  const { isSuperAdmin, profile, roles } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const canManage = isSuperAdmin || roles.some((r) => r.role === "gabbai" && r.synagogue_id === synagogueId);
  const nextShabbat = getNextShabbat();
  const shabbatLabel = useMemo(() => getNextEventLabel(), []);

  // ========== Edit Mode State ==========
  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState<any[] | null>(null);
  const [originalData, setOriginalData] = useState<any[] | null>(null);
  const [deletedSeats, setDeletedSeats] = useState<string[]>([]);
  const [deletedRows, setDeletedRows] = useState<string[]>([]);
  const [deletedSections, setDeletedSections] = useState<string[]>([]);
  const [newRowCounter, setNewRowCounter] = useState(0);
  const [newSeatCounter, setNewSeatCounter] = useState(0);
  const [saving, setSaving] = useState(false);
  const [exitConfirm, setExitConfirm] = useState(false);
  const [editSeat, setEditSeat] = useState<any>(null);
  const [addRowDialog, setAddRowDialog] = useState<string | null>(null); // section id
  const [newRowSeats, setNewRowSeats] = useState(6);
  const [deleteRowConfirm, setDeleteRowConfirm] = useState<{ sectionIdx: number; rowIdx: number } | null>(null);
  const [deleteSectionConfirm, setDeleteSectionConfirm] = useState<number | null>(null);
  const [aronKodeshSettings, setAronKodeshSettings] = useState(false);
  const [aronWidth, setAronWidth] = useState(200);
  const [aronHeight, setAronHeight] = useState(48);
  const [aronPosition, setAronPosition] = useState<"top" | "bottom">("top");

  // DnD sensors
  const pointerSensor = useSensor(PointerSensor, { activationConstraint: { distance: 5 } });
  const touchSensor = useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } });
  const sensors = useSensors(pointerSensor, touchSensor);

  // ========== Queries ==========
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
            seats: (row.seats as any[])?.sort((a: any, b: any) => a.seat_number - b.seat_number),
          })),
      }));
    },
    enabled: !!synagogueId,
  });

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

  // Auto-scroll
  const hasScrolled = useRef(false);
  const userSeatCallbackRef = useCallback((node: HTMLButtonElement | null) => {
    if (node && !hasScrolled.current) {
      hasScrolled.current = true;
      setTimeout(() => {
        node.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
      }, 300);
    }
  }, []);

  // ========== Normal Mode Mutations ==========
  const assignMutation = useMutation({
    mutationFn: async ({ seatId, profileId }: { seatId: string; profileId: string | null }) => {
      const { error } = await supabase.from("seats").update({ assigned_to: profileId }).eq("id", seatId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["full_seating_map", synagogueId] }),
  });

  const insertAbsenceMutation = useMutation({
    mutationFn: async (seatId: string) => {
      const { error } = await supabase.from("absences").insert({
        profile_id: profile!.id, synagogue_id: synagogueId!, shabbat_date: nextShabbat, seat_id: seatId,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my_absences", synagogueId] });
      queryClient.invalidateQueries({ queryKey: ["absences"] });
      toast({ title: "היעדרות דווחה בהצלחה" });
    },
    onError: (e: Error) => toast({ title: "שגיאה", description: e.message, variant: "destructive" }),
  });

  const deleteAbsenceMutation = useMutation({
    mutationFn: async (seatId: string) => {
      const { error } = await supabase.from("absences").delete()
        .eq("profile_id", profile!.id).eq("synagogue_id", synagogueId!)
        .eq("shabbat_date", nextShabbat).eq("seat_id", seatId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my_absences", synagogueId] });
      queryClient.invalidateQueries({ queryKey: ["absences"] });
      toast({ title: "ההיעדרות בוטלה בהצלחה" });
    },
    onError: (e: Error) => toast({ title: "שגיאה", description: e.message, variant: "destructive" }),
  });

  const handleAssign = useCallback((seatId: string, profileId: string | null) => assignMutation.mutate({ seatId, profileId }), [assignMutation]);
  const handleToggleAbsence = useCallback((seatId: string) => {
    absentSeatIds.has(seatId) ? deleteAbsenceMutation.mutate(seatId) : insertAbsenceMutation.mutate(seatId);
  }, [absentSeatIds, deleteAbsenceMutation, insertAbsenceMutation]);

  const markGabbaiAbsenceMutation = useMutation({
    mutationFn: async ({ seatId, profileId }: { seatId: string; profileId: string }) => {
      const { error } = await supabase.from("absences").insert({
        profile_id: profileId, synagogue_id: synagogueId!, shabbat_date: nextShabbat, seat_id: seatId, marked_by: profile!.id,
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
        .eq("seat_id", seatId).eq("synagogue_id", synagogueId!).eq("shabbat_date", nextShabbat);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["absences"] });
      queryClient.invalidateQueries({ queryKey: ["my_absences", synagogueId] });
      toast({ title: "סטטוס המקום עודכן" });
    },
  });

  const handleToggleGabbaiAbsence = useCallback((seatId: string, profileId: string) => {
    allAbsentSeatIds.has(seatId)
      ? cancelGabbaiAbsenceMutation.mutate({ seatId, profileId })
      : markGabbaiAbsenceMutation.mutate({ seatId, profileId });
  }, [allAbsentSeatIds, cancelGabbaiAbsenceMutation, markGabbaiAbsenceMutation]);

  // ========== Edit Mode Logic ==========
  const hasChanges = useMemo(() => {
    if (!editMode || !editData || !originalData) return false;
    return JSON.stringify(editData) !== JSON.stringify(originalData) ||
      deletedSeats.length > 0 || deletedRows.length > 0 || deletedSections.length > 0;
  }, [editMode, editData, originalData, deletedSeats, deletedRows, deletedSections]);

  const enterEditMode = useCallback(() => {
    if (!sections) return;
    setEditData(deepClone(sections));
    setOriginalData(deepClone(sections));
    setDeletedSeats([]);
    setDeletedRows([]);
    setDeletedSections([]);
    setNewRowCounter(0);
    setNewSeatCounter(0);
    setEditMode(true);
  }, [sections]);

  const exitEditMode = useCallback(() => {
    if (hasChanges) {
      setExitConfirm(true);
    } else {
      setEditMode(false);
      setEditData(null);
      setOriginalData(null);
    }
  }, [hasChanges]);

  const confirmExit = useCallback(() => {
    setEditMode(false);
    setEditData(null);
    setOriginalData(null);
    setExitConfirm(false);
  }, []);

  // Edit operations on local state
  const editAssignSeat = useCallback((seatId: string, profileId: string | null) => {
    setEditData(prev => {
      if (!prev) return prev;
      const data = deepClone(prev);
      for (const sec of data) {
        for (const row of sec.seat_rows || []) {
          for (const seat of row.seats || []) {
            if (seat.id === seatId) {
              seat.assigned_to = profileId;
              if (profileId) {
                const member = members?.find(m => m.profiles?.id === profileId);
                seat.profiles = member?.profiles || null;
              } else {
                seat.profiles = null;
              }
            }
          }
        }
      }
      return data;
    });
  }, [members]);

  const editDeleteSeat = useCallback((seatId: string) => {
    setEditData(prev => {
      if (!prev) return prev;
      const data = deepClone(prev);
      for (const sec of data) {
        for (const row of sec.seat_rows || []) {
          row.seats = row.seats?.filter((s: any) => s.id !== seatId) || [];
          // Renumber remaining seats
          let num = 1;
          for (const s of row.seats) {
            if (!s.element_type) { s.seat_number = num++; }
          }
          row.seats_count = row.seats.filter((s: any) => !s.element_type).length;
        }
      }
      return data;
    });
    if (!seatId.startsWith("new_")) {
      setDeletedSeats(prev => [...prev, seatId]);
    }
  }, []);

  const editToggleBlocked = useCallback((seatId: string) => {
    setEditData(prev => {
      if (!prev) return prev;
      const data = deepClone(prev);
      for (const sec of data) {
        for (const row of sec.seat_rows || []) {
          for (const seat of row.seats || []) {
            if (seat.id === seatId) {
              seat.element_type = seat.element_type === "blocked" ? null : "blocked";
            }
          }
        }
      }
      return data;
    });
  }, []);

  const editAddSeat = useCallback((sectionIdx: number, rowIdx: number) => {
    setEditData(prev => {
      if (!prev) return prev;
      const data = deepClone(prev);
      const row = data[sectionIdx]?.seat_rows?.[rowIdx];
      if (!row) return data;
      const maxNum = Math.max(0, ...(row.seats || []).filter((s: any) => !s.element_type).map((s: any) => s.seat_number));
      row.seats = [...(row.seats || []), {
        id: `new_seat_${newSeatCounter}`,
        row_id: row.id,
        seat_number: maxNum + 1,
        assigned_to: null,
        profiles: null,
        element_type: null,
        created_at: new Date().toISOString(),
      }];
      row.seats_count = row.seats.filter((s: any) => !s.element_type).length;
      return data;
    });
    setNewSeatCounter(c => c + 1);
  }, [newSeatCounter]);

  const editAddRow = useCallback((sectionIdx: number, seatsCount: number) => {
    setEditData(prev => {
      if (!prev) return prev;
      const data = deepClone(prev);
      const section = data[sectionIdx];
      if (!section) return data;
      const maxRowNum = Math.max(0, ...(section.seat_rows || []).map((r: any) => r.row_number));
      const newRowId = `new_row_${newRowCounter}`;
      const seats = Array.from({ length: seatsCount }, (_, i) => ({
        id: `new_seat_${newSeatCounter + i}`,
        row_id: newRowId,
        seat_number: i + 1,
        assigned_to: null,
        profiles: null,
        element_type: null,
        created_at: new Date().toISOString(),
      }));
      section.seat_rows = [...(section.seat_rows || []), {
        id: newRowId,
        section_id: section.id,
        row_number: maxRowNum + 1,
        seats_count: seatsCount,
        seats,
        created_at: new Date().toISOString(),
      }];
      return data;
    });
    setNewRowCounter(c => c + 1);
    setNewSeatCounter(c => c + seatsCount);
    setAddRowDialog(null);
  }, [newRowCounter, newSeatCounter]);

  const editDeleteRow = useCallback((sectionIdx: number, rowIdx: number) => {
    setEditData(prev => {
      if (!prev) return prev;
      const data = deepClone(prev);
      const section = data[sectionIdx];
      const row = section?.seat_rows?.[rowIdx];
      if (!row) return data;
      // Track deletions
      if (!row.id.startsWith("new_")) {
        setDeletedRows(p => [...p, row.id]);
        for (const seat of row.seats || []) {
          if (!seat.id.startsWith("new_")) {
            setDeletedSeats(p => [...p, seat.id]);
          }
        }
      }
      section.seat_rows.splice(rowIdx, 1);
      return data;
    });
    setDeleteRowConfirm(null);
  }, []);

  const editDeleteSection = useCallback((sectionIdx: number) => {
    setEditData(prev => {
      if (!prev) return prev;
      const data = deepClone(prev);
      const section = data[sectionIdx];
      if (!section) return data;
      if (!section.id.startsWith("new_")) {
        setDeletedSections(p => [...p, section.id]);
        for (const row of section.seat_rows || []) {
          if (!row.id.startsWith("new_")) setDeletedRows(p => [...p, row.id]);
          for (const seat of row.seats || []) {
            if (!seat.id.startsWith("new_")) setDeletedSeats(p => [...p, seat.id]);
          }
        }
      }
      data.splice(sectionIdx, 1);
      return data;
    });
    setDeleteSectionConfirm(null);
  }, []);

  const editMoveSection = useCallback((sectionIdx: number, direction: "up" | "down") => {
    setEditData(prev => {
      if (!prev) return prev;
      const data = deepClone(prev);
      const targetIdx = direction === "up" ? sectionIdx - 1 : sectionIdx + 1;
      if (targetIdx < 0 || targetIdx >= data.length) return data;
      [data[sectionIdx], data[targetIdx]] = [data[targetIdx], data[sectionIdx]];
      data.forEach((s: any, i: number) => { s.sort_order = i; });
      return data;
    });
  }, []);

  // ========== Save Changes ==========
  const handleSave = useCallback(async () => {
    if (!editData || !synagogueId) return;
    setSaving(true);

    try {
      // Build changes payload
      const changes: any = {
        deleted_seats: deletedSeats.filter(id => !id.startsWith("new_")),
        deleted_rows: deletedRows.filter(id => !id.startsWith("new_")),
        deleted_sections: deletedSections.filter(id => !id.startsWith("new_")),
        updated_sections: [],
        updated_seats: [],
        new_rows: [],
        new_seats: [],
      };

      // Compare sections for sort order changes
      for (const sec of editData) {
        if (!sec.id.startsWith("new_")) {
          const orig = originalData?.find((o: any) => o.id === sec.id);
          if (orig && (orig.sort_order !== sec.sort_order || orig.name !== sec.name)) {
            changes.updated_sections.push({ id: sec.id, sort_order: sec.sort_order, name: sec.name });
          }
        }

        for (const row of sec.seat_rows || []) {
          if (row.id.startsWith("new_")) {
            // New row with its seats
            changes.new_rows.push({
              section_id: sec.id,
              row_number: row.row_number,
              seats_count: row.seats_count,
              seats: (row.seats || []).map((s: any) => ({
                seat_number: s.seat_number,
                element_type: s.element_type,
                assigned_to: s.assigned_to,
              })),
            });
          } else {
            // Check for new seats in existing rows
            for (const seat of row.seats || []) {
              if (seat.id.startsWith("new_")) {
                changes.new_seats.push({
                  row_id: row.id,
                  seat_number: seat.seat_number,
                  element_type: seat.element_type,
                  assigned_to: seat.assigned_to,
                });
              } else {
                // Check for updates
                const origSec = originalData?.find((o: any) => o.id === sec.id);
                const origRow = origSec?.seat_rows?.find((r: any) => r.id === row.id);
                const origSeat = origRow?.seats?.find((s: any) => s.id === seat.id);
                if (origSeat) {
                  const changed: any = {};
                  if (origSeat.assigned_to !== seat.assigned_to) changed.assigned_to = seat.assigned_to;
                  if (origSeat.element_type !== seat.element_type) changed.element_type = seat.element_type;
                  if (origSeat.seat_number !== seat.seat_number) changed.seat_number = seat.seat_number;
                  if (Object.keys(changed).length > 0) {
                    changes.updated_seats.push({ id: seat.id, ...changed });
                  }
                }
              }
            }
          }
        }
      }

      const { data, error } = await supabase.functions.invoke("update-seating-map", {
        body: { synagogue_id: synagogueId, changes },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast({ title: "המפה עודכנה בהצלחה!", description: `${data.stats.inserted} נוספו, ${data.stats.updated} עודכנו, ${data.stats.deleted} נמחקו` });
      queryClient.invalidateQueries({ queryKey: ["full_seating_map", synagogueId] });
      setEditMode(false);
      setEditData(null);
      setOriginalData(null);
    } catch (err: any) {
      toast({ title: "שגיאה בשמירה", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }, [editData, originalData, deletedSeats, deletedRows, deletedSections, synagogueId, queryClient, toast]);

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
      if (!parsed.length) { toast({ title: "לא נמצאו טורים בקובץ", variant: "destructive" }); return; }
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
      toast({ title: "הייבוא הצליח!", description: `${stats.sections} מחלקות, ${stats.rows} שורות, ${stats.seats} מקומות. ${stats.matched} שויכו אוטומטית.` });
      if (stats.createdUsers?.length) setCreatedUsers(stats.createdUsers);
      if (stats.failed?.length) setFailedUsers(stats.failed);
      if (stats.createdUsers?.length || stats.failed?.length) setShowImportResults(true);
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
    a.href = url; a.download = "משתמשים_חדשים.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  // The data to render — either editData or real sections
  const displaySections = editMode && editData ? editData : sections;

  const hasAronKodesh = displaySections?.some((s: any) =>
    s.seat_rows?.some((r: any) => r.seats?.some((seat: any) => seat.element_type === "aron_kodesh"))
  );

  // Check if a row has assigned seats
  const rowHasAssigned = (row: any) => row.seats?.some((s: any) => s.assigned_to);
  const sectionHasAssigned = (section: any) => section.seat_rows?.some((r: any) => rowHasAssigned(r));

  if (isLoading) {
    return (
      <AppLayout title={`מפת מקומות - ${synagogue?.name || ""}`} showBack={canManage}>
        <Card><CardContent className="py-12 text-center"><p className="text-muted-foreground">טוען...</p></CardContent></Card>
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
              {/* Edit mode toggle */}
              {sections?.length ? (
                <Button
                  variant={editMode ? "default" : "outline"}
                  size="sm"
                  className="gap-2"
                  onClick={() => editMode ? exitEditMode() : enterEditMode()}
                >
                  {editMode ? <X className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
                  {editMode ? "צא ממצב עריכה" : "מצב עריכה"}
                </Button>
              ) : null}

              {!editMode && (
                <>
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
                        const pageWidth = 277 * 3.78;
                        const optimalZoom = Math.min(pageWidth / contentWidth, 1);
                        floorPlan.style.zoom = String(optimalZoom);
                      }
                    }
                    window.print();
                    window.onafterprint = () => { if (floorPlan) floorPlan.style.zoom = ''; };
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
                      <DialogHeader><DialogTitle>ייבוא מפת מקומות מאקסל</DialogTitle></DialogHeader>
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label>בחר קובץ Excel</Label>
                          <Input type="file" accept=".xlsx,.xls" onChange={handleFileSelect} className="cursor-pointer" />
                        </div>
                        {parsedData && (
                          <div className="space-y-3">
                            <div className="rounded-lg border bg-muted/50 p-3 space-y-1">
                              <p className="text-sm font-medium">נמצאו בקובץ:</p>
                              <p className="text-sm text-muted-foreground">{parsedData.length} טורים</p>
                              {parsedData.map((s) => (
                                <p key={s.name} className="text-xs text-muted-foreground">
                                  {s.name}: {s.rows.length} שורות, {s.rows.reduce((sum, r) => sum + r.seats.filter(seat => seat.name || seat.element_type).length, 0)} מקומות
                                </p>
                              ))}
                            </div>
                            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                              <p className="text-xs text-destructive font-medium">⚠️ הייבוא ימחק את כל המפה הקיימת ויבנה אותה מחדש</p>
                            </div>
                            <Button onClick={handleImport} className="w-full gap-2" disabled={importing}>
                              <FileSpreadsheet className="h-4 w-4" />
                              {importing ? "מייבא..." : "ייבא מפה"}
                            </Button>
                          </div>
                        )}
                      </div>
                    </DialogContent>
                  </Dialog>
                </>
              )}
            </div>

            {/* Sections Manager - only when not in edit mode */}
            {!editMode && <SectionsManager synagogueId={synagogueId!} />}
          </div>
        )}

        {/* Edit mode banner */}
        {editMode && (
          <div className="rounded-lg border-2 border-orange-400 bg-orange-50 dark:bg-orange-950/20 p-3 flex items-center justify-between">
            <span className="text-sm font-medium text-orange-700 dark:text-orange-400">
              🔧 מצב עריכה — השינויים נשמרים רק בלחיצה על "שמור"
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={exitEditMode} disabled={saving}>ביטול</Button>
              <Button size="sm" className="gap-2" onClick={handleSave} disabled={!hasChanges || saving}>
                <Save className="h-4 w-4" />
                {saving ? "שומר..." : "שמור שינויים"}
              </Button>
            </div>
          </div>
        )}

        {/* Floor Plan */}
        {!displaySections?.length ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Armchair className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground text-lg">אין מפת מקומות עדיין</p>
              <p className="text-muted-foreground text-sm mt-2">ייבא קובץ אקסל או בנה מפה חדשה</p>
            </CardContent>
          </Card>
        ) : (
          <Card className={`print-floor-plan ${editMode ? "border-2 border-orange-300" : ""}`}>
            <CardContent className="p-3 sm:p-4">
              {/* Legend */}
              {!editMode && (
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
              )}

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
                  {displaySections.map((section: any, sIdx: number) => (
                    <div key={section.id} className="flex gap-1">
                      <div className="flex flex-col items-center gap-1">
                        {/* Section header */}
                        <div className="flex items-center gap-1 mb-1">
                          {editMode && (
                            <div className="flex flex-col gap-0.5">
                              <button
                                className="p-0.5 rounded hover:bg-muted disabled:opacity-30"
                                disabled={sIdx === 0}
                                onClick={() => editMoveSection(sIdx, "up")}
                                title="הזז למעלה"
                              >
                                <ChevronUp className="h-3 w-3" />
                              </button>
                              <button
                                className="p-0.5 rounded hover:bg-muted disabled:opacity-30"
                                disabled={sIdx === displaySections.length - 1}
                                onClick={() => editMoveSection(sIdx, "down")}
                                title="הזז למטה"
                              >
                                <ChevronDown className="h-3 w-3" />
                              </button>
                            </div>
                          )}
                          <span className="text-[10px] font-bold text-muted-foreground whitespace-nowrap">
                            {section.name}
                          </span>
                          {editMode && (
                            <button
                              className="p-0.5 rounded hover:bg-destructive/10 text-destructive"
                              onClick={() => {
                                if (sectionHasAssigned(section)) {
                                  setDeleteSectionConfirm(sIdx);
                                } else if (confirm("למחוק את המחלקה?")) {
                                  editDeleteSection(sIdx);
                                }
                              }}
                              title="מחק מחלקה"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          )}
                        </div>

                        {/* Rows */}
                        {section.seat_rows?.map((row: any, rowIdx: number) => {
                          const isBimaRow = row.seats?.every(
                            (s: any) => s.element_type === "bima" || (!s.assigned_to && !s.element_type && !s.name)
                          ) && row.seats?.some((s: any) => s.element_type === "bima");

                          if (isBimaRow && sIdx === Math.floor((displaySections?.length || 0) / 2)) {
                            return (
                              <div key={row.id} className="flex items-center justify-center py-2">
                                <div className="flex items-center justify-center rounded-xl border-2 border-accent-foreground/20 bg-accent px-6 py-2 text-xs font-bold text-accent-foreground shadow-sm">
                                  בימה
                                </div>
                              </div>
                            );
                          }
                          if (isBimaRow) return <div key={row.id} className="h-10" />;

                          const regularSeats = (row.seats || []).filter(
                            (s: any) => !s.element_type || s.element_type === "empty" || s.element_type === "blocked"
                          );

                          return (
                            <div key={row.id} className="flex gap-1 items-center">
                              {/* Delete row button */}
                              {editMode && (
                                <button
                                  className="p-0.5 rounded hover:bg-destructive/10 text-destructive shrink-0"
                                  onClick={() => {
                                    if (rowHasAssigned(row)) {
                                      setDeleteRowConfirm({ sectionIdx: sIdx, rowIdx });
                                    } else if (confirm("למחוק את השורה?")) {
                                      editDeleteRow(sIdx, rowIdx);
                                    }
                                  }}
                                  title="מחק שורה"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              )}

                              {regularSeats.map((seat: any) => (
                                editMode ? (
                                  <button
                                    key={seat.id}
                                    className={`
                                      relative flex flex-col items-center justify-center
                                      w-14 h-14 sm:w-16 sm:h-16 rounded-md border text-xs font-medium transition-all cursor-pointer
                                      ${seat.element_type === "blocked"
                                        ? "bg-orange-100 border-orange-400 text-orange-700 border-dashed"
                                        : seat.assigned_to
                                          ? "bg-primary/15 border-primary/40 text-primary hover:bg-primary/25"
                                          : "bg-muted/50 border-border text-muted-foreground hover:bg-muted"
                                      }
                                    `}
                                    onClick={() => setEditSeat(seat)}
                                    title={`ערוך מקום ${seat.seat_number}`}
                                  >
                                    {seat.element_type === "blocked" ? (
                                      <>
                                        <Armchair className="h-3.5 w-3.5 mb-0.5 opacity-40" />
                                        <span className="text-[7px]">חסום</span>
                                      </>
                                    ) : (
                                      <>
                                        <Armchair className="h-3.5 w-3.5 mb-0.5" />
                                        <span className="text-[8px] leading-tight text-center whitespace-normal break-words max-w-[44px]">
                                          {seat.assigned_to ? (seat.profiles?.full_name || "תפוס") : seat.seat_number}
                                        </span>
                                      </>
                                    )}
                                    <Pencil className="absolute top-0.5 left-0.5 h-2.5 w-2.5 text-muted-foreground/50" />
                                  </button>
                                ) : (
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
                                )
                              ))}

                              {/* Add seat button */}
                              {editMode && (
                                <button
                                  className="w-8 h-14 sm:h-16 rounded-md border border-dashed border-muted-foreground/30 flex items-center justify-center hover:bg-muted/50 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                                  onClick={() => editAddSeat(sIdx, rowIdx)}
                                  title="הוסף מקום"
                                >
                                  <Plus className="h-4 w-4" />
                                </button>
                              )}
                            </div>
                          );
                        })}

                        {/* Add row button */}
                        {editMode && (
                          <button
                            className="w-full h-8 rounded-md border border-dashed border-muted-foreground/30 flex items-center justify-center gap-1 hover:bg-muted/50 text-muted-foreground/50 hover:text-muted-foreground text-xs transition-colors mt-1"
                            onClick={() => setAddRowDialog(section.id)}
                          >
                            <Plus className="h-3 w-3" />
                            הוסף שורה
                          </button>
                        )}
                      </div>

                      {/* Section separator */}
                      {sIdx < (displaySections?.length || 0) - 1 && (
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
          <h1 style={{ fontSize: '20px', fontWeight: 'bold', margin: 0 }}>מפת מקומות - {synagogue?.name || ""}</h1>
        </div>

        {/* Sticky save bar */}
        {editMode && hasChanges && (
          <div className="fixed bottom-0 left-0 right-0 z-50 bg-background border-t shadow-lg p-3 flex items-center justify-center gap-3 no-print">
            <Button variant="outline" onClick={exitEditMode} disabled={saving}>בטל שינויים</Button>
            <Button className="gap-2" onClick={handleSave} disabled={saving}>
              <Save className="h-4 w-4" />
              {saving ? "שומר..." : "שמור שינויים"}
            </Button>
          </div>
        )}
      </div>

      {/* Edit Seat Dialog */}
      <SeatEditDialog
        open={!!editSeat}
        onOpenChange={(o) => { if (!o) setEditSeat(null); }}
        seat={editSeat}
        members={members || []}
        onAssign={editAssignSeat}
        onDelete={editDeleteSeat}
        onToggleBlocked={editToggleBlocked}
      />

      {/* Add Row Dialog */}
      <Dialog open={!!addRowDialog} onOpenChange={(o) => { if (!o) setAddRowDialog(null); }}>
        <DialogContent dir="rtl" className="text-right max-w-xs">
          <DialogHeader><DialogTitle>הוסף שורה חדשה</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>מספר מקומות בשורה</Label>
              <Input type="number" min={1} max={50} value={newRowSeats} onChange={e => setNewRowSeats(Number(e.target.value))} />
            </div>
            <Button className="w-full" onClick={() => {
              const sIdx = displaySections?.findIndex((s: any) => s.id === addRowDialog);
              if (sIdx !== undefined && sIdx >= 0) editAddRow(sIdx, newRowSeats);
            }}>
              הוסף שורה
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Row Confirm (double confirm for assigned) */}
      <AlertDialog open={!!deleteRowConfirm} onOpenChange={(o) => { if (!o) setDeleteRowConfirm(null); }}>
        <AlertDialogContent dir="rtl" className="text-right">
          <AlertDialogHeader>
            <AlertDialogTitle>מחיקת שורה עם מקומות משויכים</AlertDialogTitle>
            <AlertDialogDescription>
              השורה מכילה מקומות שמשויכים למתפללים. המחיקה תסיר את כל השיוכים. להמשיך?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteRowConfirm) editDeleteRow(deleteRowConfirm.sectionIdx, deleteRowConfirm.rowIdx);
              }}
            >
              מחק בכל זאת
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Section Confirm */}
      <AlertDialog open={deleteSectionConfirm !== null} onOpenChange={(o) => { if (!o) setDeleteSectionConfirm(null); }}>
        <AlertDialogContent dir="rtl" className="text-right">
          <AlertDialogHeader>
            <AlertDialogTitle>מחיקת מחלקה עם מקומות משויכים</AlertDialogTitle>
            <AlertDialogDescription>
              המחלקה מכילה מקומות שמשויכים למתפללים. המחיקה תסיר את כל השיוכים. להמשיך?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteSectionConfirm !== null) editDeleteSection(deleteSectionConfirm);
              }}
            >
              מחק בכל זאת
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Exit Confirm */}
      <AlertDialog open={exitConfirm} onOpenChange={setExitConfirm}>
        <AlertDialogContent dir="rtl" className="text-right">
          <AlertDialogHeader>
            <AlertDialogTitle>שינויים שלא נשמרו</AlertDialogTitle>
            <AlertDialogDescription>
              יש שינויים שלא נשמרו. האם לצאת ממצב עריכה בלי לשמור?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogCancel>חזור לעריכה</AlertDialogCancel>
            <AlertDialogAction onClick={confirmExit}>צא בלי לשמור</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Import Results Dialog */}
      <Dialog open={showImportResults} onOpenChange={setShowImportResults}>
        <DialogContent dir="rtl" className="max-w-lg max-h-[80vh] overflow-y-auto text-right">
          <DialogHeader><DialogTitle>תוצאות ייבוא משתמשים</DialogTitle></DialogHeader>
          {createdUsers.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-green-700 dark:text-green-400">✅ {createdUsers.length} משתמשים נוצרו בהצלחה</p>
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
              <p className="text-sm font-medium text-destructive">❌ {failedUsers.length} משתמשים נכשלו</p>
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

      {/* New Map Wizard */}
      <NewMapWizard open={wizardOpen} onOpenChange={setWizardOpen} synagogueId={synagogueId!} hasExistingMap={!!sections?.length} />
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
      const { data, error } = await supabase.from("sections").select("*").eq("synagogue_id", synagogueId).order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("sections").insert({ synagogue_id: synagogueId, name: sectionName, sort_order: (sections?.length || 0) + 1 });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sections", synagogueId] });
      queryClient.invalidateQueries({ queryKey: ["full_seating_map", synagogueId] });
      setDialogOpen(false); setSectionName("");
      toast({ title: "מחלקה נוצרה בהצלחה!" });
    },
    onError: (e: Error) => toast({ title: "שגיאה", description: e.message, variant: "destructive" }),
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
          <span className="flex items-center gap-2"><Pencil className="h-4 w-4" />עריכת מפה - ניהול מחלקות</span>
          <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <Card className="mt-2">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base">מחלקות</CardTitle>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-2"><Plus className="h-4 w-4" />הוסף מחלקה</Button>
              </DialogTrigger>
              <DialogContent dir="rtl" className="text-right">
                <DialogHeader><DialogTitle>מחלקה חדשה</DialogTitle></DialogHeader>
                <form onSubmit={(e) => { e.preventDefault(); createMutation.mutate(); }} className="space-y-4">
                  <div className="space-y-2">
                    <Label>שם המחלקה</Label>
                    <Input value={sectionName} onChange={(e) => setSectionName(e.target.value)} required placeholder='לדוגמה: אולם ראשי / עזרת נשים' />
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
                    <Input placeholder="חפש מחלקה..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pr-9 text-right" dir="rtl" />
                  </div>
                )}
                <div className="space-y-2">
                  {sections.filter((s) => !searchTerm || s.name.toLowerCase().includes(searchTerm.toLowerCase())).map((s) => (
                    <div key={s.id} className="flex items-center justify-between rounded-lg border p-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent">
                          <LayoutGrid className="h-4 w-4 text-accent-foreground" />
                        </div>
                        <p className="font-medium text-sm">{s.name}</p>
                      </div>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => { if (confirm("למחוק את המחלקה?")) deleteMutation.mutate(s.id); }}>
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
