import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, ChevronLeft, ChevronRight, Armchair, LayoutGrid } from "lucide-react";

interface SectionConfig {
  name: string;
  rowCount: number;
  seatsPerRow: number;
  hasBima: boolean;
  bimaAfterRow: number;
}

interface NewMapWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  synagogueId: string;
  hasExistingMap: boolean;
}

export default function NewMapWizard({ open, onOpenChange, synagogueId, hasExistingMap }: NewMapWizardProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);

  // Step 1 state
  const [sections, setSections] = useState<SectionConfig[]>([
    { name: "אולם ראשי", rowCount: 5, seatsPerRow: 4, hasBima: false, bimaAfterRow: 2 },
  ]);
  const [aronPosition, setAronPosition] = useState<"top" | "bottom">("top");

  // Section management
  const addSection = () => {
    setSections((prev) => [
      ...prev,
      { name: `מחלקה ${prev.length + 1}`, rowCount: 5, seatsPerRow: 4, hasBima: false, bimaAfterRow: 2 },
    ]);
  };

  const removeSection = (idx: number) => {
    if (sections.length <= 1) return;
    setSections((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateSection = (idx: number, updates: Partial<SectionConfig>) => {
    setSections((prev) => prev.map((s, i) => (i === idx ? { ...s, ...updates } : s)));
  };

  // Calculate totals
  const totalSeats = sections.reduce((sum, s) => sum + s.rowCount * s.seatsPerRow, 0);
  const totalRows = sections.reduce((sum, s) => sum + s.rowCount, 0);

  // Build preview data
  const buildPreviewData = () => {
    return sections.map((sec) => {
      const rows: { type: "seats" | "bima" | "aron_kodesh"; seatCount?: number; rowNum: number }[] = [];
      let rowNum = 1;

      for (let r = 1; r <= sec.rowCount; r++) {
        rows.push({ type: "seats", seatCount: sec.seatsPerRow, rowNum: rowNum++ });
        if (sec.hasBima && r === sec.bimaAfterRow) {
          rows.push({ type: "bima", rowNum: rowNum++ });
        }
      }
      return { name: sec.name, rows };
    });
  };

  // Save to DB
  const handleCreate = async () => {
    setSaving(true);
    try {
      // Delete existing map if any
      const { data: oldSections } = await supabase
        .from("sections")
        .select("id")
        .eq("synagogue_id", synagogueId);

      if (oldSections && oldSections.length > 0) {
        const oldSectionIds = oldSections.map((s) => s.id);
        const { data: oldRows } = await supabase
          .from("seat_rows")
          .select("id")
          .in("section_id", oldSectionIds);

        if (oldRows && oldRows.length > 0) {
          const oldRowIds = oldRows.map((r) => r.id);
          await supabase.from("seats").delete().in("row_id", oldRowIds);
          await supabase.from("seat_rows").delete().in("section_id", oldSectionIds);
        }
        await supabase.from("sections").delete().eq("synagogue_id", synagogueId);
      }

      // Create sections
      for (let si = 0; si < sections.length; si++) {
        const sec = sections[si];

        const { data: newSection, error: secErr } = await supabase
          .from("sections")
          .insert({ synagogue_id: synagogueId, name: sec.name, sort_order: si })
          .select()
          .single();
        if (secErr) throw secErr;

        let rowNumber = 1;

        // Aron kodesh at top of first section
        if (aronPosition === "top" && si === 0) {
          const { data: aronRow, error: aronRowErr } = await supabase
            .from("seat_rows")
            .insert({ section_id: newSection.id, row_number: rowNumber, seats_count: 1 })
            .select()
            .single();
          if (aronRowErr) throw aronRowErr;
          await supabase.from("seats").insert({
            row_id: aronRow.id,
            seat_number: 1,
            element_type: "aron_kodesh",
          });
          rowNumber++;
        }

        // Create rows with bima
        for (let r = 1; r <= sec.rowCount; r++) {
          // Seat row
          const { data: newRow, error: rowErr } = await supabase
            .from("seat_rows")
            .insert({ section_id: newSection.id, row_number: rowNumber, seats_count: sec.seatsPerRow })
            .select()
            .single();
          if (rowErr) throw rowErr;

          const seatsToInsert = Array.from({ length: sec.seatsPerRow }, (_, i) => ({
            row_id: newRow.id,
            seat_number: i + 1,
          }));
          const { error: seatsErr } = await supabase.from("seats").insert(seatsToInsert);
          if (seatsErr) throw seatsErr;
          rowNumber++;

          // Bima row after specified row
          if (sec.hasBima && r === sec.bimaAfterRow) {
            const { data: bimaRow, error: bimaRowErr } = await supabase
              .from("seat_rows")
              .insert({ section_id: newSection.id, row_number: rowNumber, seats_count: 1 })
              .select()
              .single();
            if (bimaRowErr) throw bimaRowErr;
            await supabase.from("seats").insert({
              row_id: bimaRow.id,
              seat_number: 1,
              element_type: "bima",
            });
            rowNumber++;
          }
        }

        // Aron kodesh at bottom of last section
        if (aronPosition === "bottom" && si === sections.length - 1) {
          const { data: aronRow, error: aronRowErr } = await supabase
            .from("seat_rows")
            .insert({ section_id: newSection.id, row_number: rowNumber, seats_count: 1 })
            .select()
            .single();
          if (aronRowErr) throw aronRowErr;
          await supabase.from("seats").insert({
            row_id: aronRow.id,
            seat_number: 1,
            element_type: "aron_kodesh",
          });
        }
      }

      queryClient.invalidateQueries({ queryKey: ["full_seating_map", synagogueId] });
      queryClient.invalidateQueries({ queryKey: ["sections", synagogueId] });
      toast({ title: "המפה נוצרה בהצלחה!", description: `${sections.length} מחלקות, ${totalSeats} מקומות` });
      onOpenChange(false);
      resetState();
    } catch (err: any) {
      toast({ title: "שגיאה ביצירת המפה", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const resetState = () => {
    setStep(1);
    setSections([{ name: "אולם ראשי", rowCount: 5, seatsPerRow: 4, hasBima: false, bimaAfterRow: 2 }]);
    setAronPosition("top");
  };

  const previewData = buildPreviewData();

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) resetState(); }}>
      <DialogContent dir="rtl" className="text-right max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {step === 1 && "בניית מפה חדשה — מחלקות"}
            {step === 2 && "בניית מפה חדשה — שורות ומקומות"}
            {step === 3 && "בניית מפה חדשה — תצוגה מקדימה"}
          </DialogTitle>
        </DialogHeader>

        {/* Step indicators */}
        <div className="flex items-center justify-center gap-2 mb-4">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`h-2 w-8 rounded-full transition-colors ${
                s === step ? "bg-primary" : s < step ? "bg-primary/50" : "bg-muted"
              }`}
            />
          ))}
        </div>

        {/* ===== STEP 1: Sections ===== */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="space-y-3">
              {sections.map((sec, idx) => (
                <div key={idx} className="flex items-center gap-2 rounded-lg border p-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent shrink-0">
                    <LayoutGrid className="h-4 w-4 text-accent-foreground" />
                  </div>
                  <Input
                    value={sec.name}
                    onChange={(e) => updateSection(idx, { name: e.target.value })}
                    className="flex-1"
                    placeholder="שם המחלקה"
                  />
                  {sections.length > 1 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive shrink-0"
                      onClick={() => removeSection(idx)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>

            <Button variant="outline" onClick={addSection} className="w-full gap-2">
              <Plus className="h-4 w-4" />
              הוסף מחלקה
            </Button>

            <div className="space-y-2 border-t pt-4">
              <Label>מיקום ארון הקודש</Label>
              <Select value={aronPosition} onValueChange={(v: "top" | "bottom") => setAronPosition(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="top">למעלה (קדמת בית הכנסת)</SelectItem>
                  <SelectItem value="bottom">למטה (אחורי בית הכנסת)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex justify-start">
              <Button onClick={() => setStep(2)} className="gap-2">
                <ChevronLeft className="h-4 w-4" />
                הבא
              </Button>
            </div>
          </div>
        )}

        {/* ===== STEP 2: Rows & Seats ===== */}
        {step === 2 && (
          <div className="space-y-4">
            {sections.map((sec, idx) => (
              <div key={idx} className="rounded-lg border p-4 space-y-3">
                <h3 className="font-semibold text-sm">{sec.name}</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">מספר שורות</Label>
                    <Input
                      type="number"
                      min={1}
                      max={50}
                      value={sec.rowCount}
                      onChange={(e) => updateSection(idx, { rowCount: Math.max(1, parseInt(e.target.value) || 1) })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">מקומות בשורה</Label>
                    <Input
                      type="number"
                      min={1}
                      max={30}
                      value={sec.seatsPerRow}
                      onChange={(e) => updateSection(idx, { seatsPerRow: Math.max(1, parseInt(e.target.value) || 1) })}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-lg bg-muted/50 p-3">
                  <div className="space-y-0.5">
                    <Label className="text-sm">בימה באמצע</Label>
                    <p className="text-xs text-muted-foreground">המחלקה תתחלק לשניים עם בימה ביניהם</p>
                  </div>
                  <Switch
                    checked={sec.hasBima}
                    onCheckedChange={(checked) => updateSection(idx, { hasBima: checked, bimaAfterRow: Math.min(sec.bimaAfterRow, sec.rowCount) })}
                  />
                </div>

                {sec.hasBima && (
                  <div className="space-y-1 mr-4">
                    <Label className="text-xs">הבימה אחרי שורה מספר</Label>
                    <Select
                      value={String(sec.bimaAfterRow)}
                      onValueChange={(v) => updateSection(idx, { bimaAfterRow: parseInt(v) })}
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: sec.rowCount }, (_, i) => i + 1).map((r) => (
                          <SelectItem key={r} value={String(r)}>
                            {r}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <p className="text-xs text-muted-foreground">
                  סה"כ: {sec.rowCount * sec.seatsPerRow} מקומות
                </p>
              </div>
            ))}

            <div className="rounded-lg bg-muted/50 p-3 text-center">
              <p className="text-sm font-medium">
                סה"כ במפה: {totalSeats} מקומות ב-{totalRows} שורות
              </p>
            </div>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(1)} className="gap-2">
                <ChevronRight className="h-4 w-4" />
                חזרה
              </Button>
              <Button onClick={() => setStep(3)} className="gap-2">
                <ChevronLeft className="h-4 w-4" />
                תצוגה מקדימה
              </Button>
            </div>
          </div>
        )}

        {/* ===== STEP 3: Preview ===== */}
        {step === 3 && (
          <div className="space-y-4">
            {hasExistingMap && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                <p className="text-xs text-destructive font-medium">
                  ⚠️ יצירת מפה חדשה תמחק את כל המפה הקיימת כולל שיוכי מקומות
                </p>
              </div>
            )}

            {/* Mini floor plan preview */}
            <div className="rounded-lg border p-4 bg-card">
              {/* Aron at top */}
              {aronPosition === "top" && (
                <div className="flex justify-center mb-3">
                  <div className="flex items-center justify-center rounded-xl border-2 border-primary/30 bg-primary/10 px-6 py-2 text-xs font-bold text-primary">
                    ארון קודש
                  </div>
                </div>
              )}

              <div className="overflow-x-auto">
                <div className="flex gap-2 min-w-max justify-center">
                  {previewData.map((sec, sIdx) => (
                    <div key={sIdx} className="flex gap-1">
                      <div className="flex flex-col items-center gap-1">
                        <div className="text-[10px] font-bold text-muted-foreground mb-1">{sec.name}</div>
                        {sec.rows.map((row, rIdx) => {
                          if (row.type === "bima") {
                            if (sIdx === Math.floor(previewData.length / 2)) {
                              return (
                                <div key={rIdx} className="flex items-center justify-center py-1">
                                  <div className="rounded-lg border-2 border-accent-foreground/20 bg-accent px-4 py-1 text-[10px] font-bold text-accent-foreground">
                                    בימה
                                  </div>
                                </div>
                              );
                            }
                            return <div key={rIdx} className="h-8" />;
                          }
                          return (
                            <div key={rIdx} className="flex gap-0.5">
                              {Array.from({ length: row.seatCount || 0 }, (_, i) => (
                                <div
                                  key={i}
                                  className="w-8 h-8 rounded border bg-muted/50 border-border flex items-center justify-center"
                                >
                                  <Armchair className="h-3 w-3 text-muted-foreground" />
                                </div>
                              ))}
                            </div>
                          );
                        })}
                      </div>
                      {sIdx < previewData.length - 1 && (
                        <div className="flex flex-col items-center justify-center mx-0.5">
                          <div className="w-px h-full bg-border" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Aron at bottom */}
              {aronPosition === "bottom" && (
                <div className="flex justify-center mt-3">
                  <div className="flex items-center justify-center rounded-xl border-2 border-primary/30 bg-primary/10 px-6 py-2 text-xs font-bold text-primary">
                    ארון קודש
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-lg bg-muted/50 p-3 text-center">
              <p className="text-sm font-medium">
                {sections.length} מחלקות · {totalSeats} מקומות · {totalRows} שורות
              </p>
            </div>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(2)} className="gap-2">
                <ChevronRight className="h-4 w-4" />
                חזרה
              </Button>
              <Button onClick={handleCreate} disabled={saving} className="gap-2">
                {saving ? "יוצר מפה..." : "צור מפה"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
