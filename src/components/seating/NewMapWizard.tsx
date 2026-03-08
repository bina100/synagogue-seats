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

  const totalSeats = sections.reduce((sum, s) => sum + s.rowCount * s.seatsPerRow, 0);
  const totalRows = sections.reduce((sum, s) => sum + s.rowCount, 0);

  // Build the payload for edge function — structured as sections → rows → seats
  const buildPayload = () => {
    return sections.map((sec, si) => {
      const rows: { row_number: number; seats_count: number; seats: { seat_number: number; element_type?: string }[] }[] = [];
      let rowNumber = 1;

      // Aron kodesh at top of first section
      if (aronPosition === "top" && si === 0) {
        rows.push({
          row_number: rowNumber++,
          seats_count: 1,
          seats: [{ seat_number: 1, element_type: "aron_kodesh" }],
        });
      }

      for (let r = 1; r <= sec.rowCount; r++) {
        // Seat row
        rows.push({
          row_number: rowNumber++,
          seats_count: sec.seatsPerRow,
          seats: Array.from({ length: sec.seatsPerRow }, (_, i) => ({
            seat_number: i + 1,
          })),
        });

        // Bima row after specified row
        if (sec.hasBima && r === sec.bimaAfterRow) {
          rows.push({
            row_number: rowNumber++,
            seats_count: 1,
            seats: [{ seat_number: 1, element_type: "bima" }],
          });
        }
      }

      // Aron kodesh at bottom of last section
      if (aronPosition === "bottom" && si === sections.length - 1) {
        rows.push({
          row_number: rowNumber++,
          seats_count: 1,
          seats: [{ seat_number: 1, element_type: "aron_kodesh" }],
        });
      }

      return { name: sec.name, rows };
    });
  };

  // Build preview data (visual only)
  const buildPreviewData = () => {
    return sections.map((sec) => {
      const rows: { type: "seats" | "bima"; seatCount?: number }[] = [];
      for (let r = 1; r <= sec.rowCount; r++) {
        rows.push({ type: "seats", seatCount: sec.seatsPerRow });
        if (sec.hasBima && r === sec.bimaAfterRow) {
          rows.push({ type: "bima" });
        }
      }
      return { name: sec.name, rows, hasBima: sec.hasBima };
    });
  };

  // Save via edge function (atomic transaction)
  const handleCreate = async () => {
    setSaving(true);
    try {
      const payload = buildPayload();
      const { data, error } = await supabase.functions.invoke("create-seating-map", {
        body: { synagogue_id: synagogueId, sections: payload },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const stats = data.stats;
      queryClient.invalidateQueries({ queryKey: ["full_seating_map", synagogueId] });
      queryClient.invalidateQueries({ queryKey: ["sections", synagogueId] });
      toast({
        title: "המפה נוצרה בהצלחה!",
        description: `${stats.sections} מחלקות, ${stats.rows} שורות, ${stats.seats} מקומות`,
      });
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
                            return (
                              <div key={rIdx} className="flex items-center justify-center py-1">
                                <div className="rounded-lg border-2 border-accent-foreground/20 bg-accent px-4 py-1 text-[10px] font-bold text-accent-foreground">
                                  בימה
                                </div>
                              </div>
                            );
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
