import { useState } from "react";
import { Armchair, UserPlus, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
}

export default function SeatCell({ seat, members, canManage, onAssign, currentUserProfileId }: SeatCellProps) {
  const [open, setOpen] = useState(false);

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
            relative flex flex-col items-center justify-center
            w-14 h-14 sm:w-16 sm:h-16 rounded-md border text-xs font-medium transition-all
            ${
              isCurrentUser
                ? "bg-teal-100 border-teal-500 text-teal-900 border-2 font-bold hover:bg-teal-200"
                : isAssigned
                  ? "bg-primary/15 border-primary/40 text-primary hover:bg-primary/25"
                  : "bg-muted/50 border-border text-muted-foreground hover:bg-muted"
            }
            ${canManage ? "cursor-pointer" : "cursor-default"}
          `}
          disabled={!canManage}
          title={isAssigned ? assignedProfile?.full_name : `מקום ${seat.seat_number}`}
        >
          <Armchair className="h-3.5 w-3.5 mb-0.5" />
          <span className="text-[8px] leading-tight text-center whitespace-normal break-words max-w-[44px]">
            {isAssigned
              ? assignedProfile?.full_name || "תפוס"
              : seat.seat_number}
          </span>
        </button>
      </DialogTrigger>
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
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}
