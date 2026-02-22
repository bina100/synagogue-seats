import { useState } from "react";
import { Armchair, UserPlus, X, CalendarOff, CheckCircle2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import StructuralElement from "./StructuralElement";

interface SeatCellProps {
  seat: any;
  members: any[];
  canManage: boolean;
  onAssign: (seatId: string, profileId: string | null) => void;
  currentUserProfileId?: string;
  isAbsent?: boolean;
  onToggleAbsence?: () => void;
  isAbsentForGabbai?: boolean;
  onToggleGabbaiAbsence?: () => void;
}

export default function SeatCell({ seat, members, canManage, onAssign, currentUserProfileId, isAbsent, onToggleAbsence, isAbsentForGabbai, onToggleGabbaiAbsence }: SeatCellProps) {
  const [open, setOpen] = useState(false);

  // Empty cell = invisible spacer for grid alignment
  if (seat.element_type === 'empty') {
    return <div className="w-14 h-14 sm:w-16 sm:h-16 pointer-events-none" />;
  }

  // Structural element
  if (seat.element_type) {
    return <StructuralElement type={seat.element_type} />;
  }

  const isAssigned = !!seat.assigned_to;
  const assignedProfile = seat.profiles;
  const isCurrentUser = isAssigned && seat.assigned_to === currentUserProfileId;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          className={`
            print-seat relative flex flex-col items-center justify-center
            w-14 h-14 sm:w-16 sm:h-16 rounded-md border text-xs font-medium transition-all
            ${
              isCurrentUser
                ? "bg-teal-100 border-teal-500 text-teal-900 border-2 font-bold hover:bg-teal-200"
                : isAssigned
                  ? "bg-primary/15 border-primary/40 text-primary hover:bg-primary/25"
                  : "bg-muted/50 border-border text-muted-foreground hover:bg-muted"
            }
            ${canManage || isCurrentUser ? "cursor-pointer" : "cursor-default"}
          `}
          disabled={!canManage && !isCurrentUser}
          title={isAssigned ? assignedProfile?.full_name : `מקום ${seat.seat_number}`}
        >
          {/* Red dot for absent seat */}
          {((isCurrentUser && isAbsent) || isAbsentForGabbai) && (
            <div className="absolute -top-1 -right-1 w-4 h-4 bg-red-600 rounded-full border-2 border-white z-10" />
          )}
          <Armchair className="h-3.5 w-3.5 mb-0.5" />
          <span className="text-[8px] leading-tight text-center whitespace-normal break-words max-w-[44px]">
            {isAssigned
              ? assignedProfile?.full_name || "תפוס"
              : seat.seat_number}
          </span>
        </button>
      </DialogTrigger>

      {/* Admin assign dialog */}
      {canManage && (
        <DialogContent>
          <DialogHeader>
            <DialogTitle>מקום {seat.seat_number}</DialogTitle>
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
            {/* Shabbat Absence section (only for assigned seats) */}
            {isAssigned && (
              <div className="space-y-2 border-t pt-3">
                <Label>היעדרות לשבת</Label>
                {isAbsentForGabbai ? (
                  <Button variant="outline" className="w-full gap-2 border-green-500 text-green-600"
                    onClick={() => { onToggleGabbaiAbsence?.(); setOpen(false); }}>
                    <CheckCircle2 className="h-4 w-4" /> בטל היעדרות למקום זה
                  </Button>
                ) : (
                  <Button variant="outline" className="w-full gap-2 border-destructive text-destructive"
                    onClick={() => { onToggleGabbaiAbsence?.(); setOpen(false); }}>
                    <CalendarOff className="h-4 w-4" /> סמן כפנוי לשבת
                  </Button>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      )}

      {/* Regular member absence dialog */}
      {!canManage && isCurrentUser && (
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isAbsent ? "ביטול היעדרות" : "דיווח היעדרות"}</DialogTitle>
            <DialogDescription>
              {isAbsent
                ? "סימנת שאינך מגיע השבת. האם ברצונך לבטל את ההיעדרות?"
                : "האם ברצונך לעדכן את הגבאי שאינך מגיע השבת / בחג הקרוב? המקום שלך יסומן כפנוי לאורחים."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 justify-end mt-4">
            <Button variant="outline" onClick={() => setOpen(false)}>
              ביטול
            </Button>
            <Button
              variant={isAbsent ? "default" : "destructive"}
              onClick={() => {
                onToggleAbsence?.();
                setOpen(false);
              }}
            >
              {isAbsent ? "אני מגיע (בטל היעדרות)" : "כן, איני מגיע"}
            </Button>
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}
