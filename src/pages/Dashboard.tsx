import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, LogOut, UserCircle } from "lucide-react";

export default function Dashboard() {
  const { profile, signOut, isSuperAdmin, roles } = useAuth();

  const getRoleLabel = () => {
    if (isSuperAdmin) return "מנהל-על";
    if (roles.some((r) => r.role === "gabbai")) return "גבאי";
    return "מתפלל";
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card shadow-sm">
        <div className="container mx-auto flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <Building2 className="h-5 w-5 text-primary" />
            </div>
            <h1 className="text-xl font-bold text-foreground">ניהול מקומות ישיבה</h1>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <UserCircle className="h-4 w-4" />
              <span>{profile?.full_name}</span>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                {getRoleLabel()}
              </span>
            </div>
            <Button variant="ghost" size="icon" onClick={signOut} title="יציאה">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="container mx-auto p-4 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>ברוך הבא, {profile?.full_name}!</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              {isSuperAdmin
                ? "אתה מנהל-על. באפשרותך ליצור ולנהל בתי כנסת."
                : "בחר בית כנסת כדי להתחיל."}
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
