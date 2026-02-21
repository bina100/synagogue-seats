import { Armchair } from "lucide-react";

interface StructuralElementProps {
  type: "aron_kodesh" | "bima" | "amud" | "chatan";
}

export default function StructuralElement({ type }: StructuralElementProps) {
  switch (type) {
    case "aron_kodesh":
      return (
        <div className="flex items-center justify-center rounded-lg border-2 border-primary/30 bg-primary/10 px-4 py-2 text-xs font-bold text-primary">
          ארון קודש
        </div>
      );
    case "bima":
      return (
        <div className="flex items-center justify-center rounded-lg border-2 border-accent-foreground/20 bg-accent px-4 py-2 text-xs font-bold text-accent-foreground">
          בימה
        </div>
      );
    case "amud":
      return (
        <div className="flex items-center justify-center">
          <div className="h-6 w-6 rounded-full border-2 border-muted-foreground/30 bg-muted" title="עמוד" />
        </div>
      );
    case "chatan":
      return (
        <div className="flex items-center justify-center rounded border border-border bg-muted/50 px-2 py-1 text-[10px] text-muted-foreground">
          חתן
        </div>
      );
    default:
      return null;
  }
}
