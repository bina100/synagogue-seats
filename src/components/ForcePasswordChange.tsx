import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Lock } from "lucide-react";

interface ForcePasswordChangeProps {
  profileId: string;
  onDone: () => void;
}

export default function ForcePasswordChange({ profileId, onDone }: ForcePasswordChangeProps) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password.length < 6) {
      toast({ title: "הסיסמה חייבת להכיל לפחות 6 תווים", variant: "destructive" });
      return;
    }

    if (password !== confirm) {
      toast({ title: "הסיסמאות אינן תואמות", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const { error: updateErr } = await supabase.auth.updateUser({ password });
      if (updateErr) throw updateErr;

      const { error: profileErr } = await supabase
        .from("profiles")
        .update({ requires_password_change: false } as any)
        .eq("id", profileId);
      if (profileErr) throw profileErr;

      toast({ title: "הסיסמה עודכנה בהצלחה!" });
      onDone();
    } catch (err: any) {
      toast({ title: "שגיאה בעדכון הסיסמה", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open modal>
      <DialogContent
        className="max-w-sm [&>button]:hidden"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 justify-center">
            <Lock className="h-5 w-5 text-primary" />
            שינוי סיסמה נדרש
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground text-center">
          זוהי כניסתך הראשונה. אנא בחר סיסמה חדשה.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new-password">סיסמה חדשה</Label>
            <Input
              id="new-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="לפחות 6 תווים"
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password">אישור סיסמה</Label>
            <Input
              id="confirm-password"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="הזן שוב את הסיסמה"
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "מעדכן..." : "שמור סיסמה"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
