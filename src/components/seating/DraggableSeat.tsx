import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Armchair, Pencil, GripVertical, Columns } from "lucide-react";

interface DraggableSeatProps {
  seat: any;
  onClickSeat: (seat: any) => void;
  onInsertAmud: (seatId: string) => void;
  editMode: boolean;
}

export function DraggableSeat({ seat, onClickSeat, onInsertAmud, editMode }: DraggableSeatProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: seat.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
  };

  if (seat.element_type === "amud") {
    return (
      <div ref={setNodeRef} style={style} className="flex items-center justify-center">
        <div
          className="h-10 w-6 sm:h-12 sm:w-7 rounded-full border-2 border-muted-foreground/30 bg-muted flex items-center justify-center cursor-grab"
          title="עמוד"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-3 w-3 text-muted-foreground/50" />
        </div>
      </div>
    );
  }

  return (
    <div ref={setNodeRef} style={style} className="relative group">
      <button
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
        onClick={() => onClickSeat(seat)}
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
        {/* Drag handle */}
        <div
          className="absolute bottom-0.5 right-0.5 cursor-grab touch-none"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-3 w-3 text-muted-foreground/40" />
        </div>
      </button>
      {/* Insert amud button - appears on hover between seats */}
      <button
        className="absolute -left-2 top-1/2 -translate-y-1/2 z-20 w-4 h-8 rounded bg-muted-foreground/10 hover:bg-muted-foreground/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={(e) => { e.stopPropagation(); onInsertAmud(seat.id); }}
        title="הוסף עמוד כאן"
      >
        <Columns className="h-2.5 w-2.5 text-muted-foreground" />
      </button>
    </div>
  );
}
