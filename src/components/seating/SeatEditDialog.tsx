import { useState } from "react";
import { Trash2, UserPlus, Ban, ChevronsUpDown } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
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

interface SeatEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  seat: any;
  members: any[];
  onAssign: (seatId: string, profileId: string | null) => void;
  onDelete: (seatId: string) => void;
  onToggleBlocked: (seatId: string) => void;
}

export default function SeatEditDialog({
  open,
  onOpenChange,
  seat,
  members,
  onAssign,
  onDelete,
  onToggleBlocked,
}: SeatEditDialogProps) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!seat) return null;

  const isAssigned = !!seat.assigned_to;
  const assignedProfile = seat.profiles;
  const isBlocked = seat.element_type === "blocked";

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent dir="rtl" className="text-right">
          <DialogHeader>
            <DialogTitle>עריכת מקום {seat.seat_number}</DialogTitle>
            <DialogDescription>שנה שיוך, חסום או מחק מקום זה</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Current assignment */}
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
                    onOpenChange(false);
                  }}
                >
                  הסר שיוך
                </Button>
              </div>
            )}

            {/* Assign member */}
            <div className="space-y-2">
              <Label>שייך מתפלל</Label>
              <Popover open={searchOpen} onOpenChange={setSearchOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className="w-full justify-between"
                  >
                    בחר מתפלל...
                    <ChevronsUpDown className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0" dir="rtl">
                  <Command>
                    <CommandInput placeholder="חפש מתפלל..." />
                    <CommandList>
                      <CommandEmpty>לא נמצאו תוצאות</CommandEmpty>
                      <CommandGroup>
                        {members?.map((m) => (
                          <CommandItem
                            key={m.profiles?.id}
                            value={`${m.profiles?.full_name} ${m.profiles?.username}`}
                            onSelect={() => {
                              onAssign(seat.id, m.profiles?.id);
                              setSearchOpen(false);
                              onOpenChange(false);
                            }}
                          >
                            {m.profiles?.full_name} ({m.profiles?.username})
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            {/* Block / Unblock */}
            <div className="border-t pt-3">
              <Button
                variant="outline"
                className={`w-full gap-2 ${isBlocked ? "border-green-500 text-green-600" : "border-orange-400 text-orange-600"}`}
                onClick={() => {
                  onToggleBlocked(seat.id);
                  onOpenChange(false);
                }}
              >
                <Ban className="h-4 w-4" />
                {isBlocked ? "בטל חסימה" : "סמן כחסום (לא פעיל)"}
              </Button>
            </div>

            {/* Delete */}
            <div className="border-t pt-3">
              <Button
                variant="destructive"
                className="w-full gap-2"
                onClick={() => {
                  if (isAssigned) {
                    setConfirmDelete(true);
                  } else {
                    onDelete(seat.id);
                    onOpenChange(false);
                  }
                }}
              >
                <Trash2 className="h-4 w-4" />
                מחק מקום
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Double confirm for assigned seats */}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent dir="rtl" className="text-right">
          <AlertDialogHeader>
            <AlertDialogTitle>מחיקת מקום משויך</AlertDialogTitle>
            <AlertDialogDescription>
              המקום משויך ל-{assignedProfile?.full_name}. האם אתה בטוח שברצונך למחוק אותו?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                onDelete(seat.id);
                setConfirmDelete(false);
                onOpenChange(false);
              }}
            >
              מחק בכל זאת
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
