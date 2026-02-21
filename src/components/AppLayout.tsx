import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Building2, LogOut, UserCircle, ArrowRight } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";

interface AppLayoutProps {
  children: React.ReactNode;
  title?: string;
  showBack?: boolean;
}

export default function AppLayout({ children, title, showBack }: AppLayoutProps) {
  const { profile, signOut, isSuperAdmin, roles } = useAuth();
  const navigate = useNavigate();

  const getRoleLabel = () => {
    if (isSuperAdmin) return "מנהל-על";
    if (roles.some((r) => r.role === "gabbai")) return "גבאי";
    return "מתפלל";
  };

  return (
    <div className="min-h-screen bg-background pb-safe">
      <header className="border-b bg-card shadow-sm sticky top-0 z-10 pt-safe">
        <div className="container mx-auto flex items-center justify-between px-3 py-2 sm:px-4 sm:py-3">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            {showBack && (
              <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="shrink-0">
                <ArrowRight className="h-5 w-5" />
              </Button>
            )}
            <div className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-xl bg-primary/10 shrink-0">
              <Building2 className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
            </div>
            <h1 className="text-base sm:text-lg font-bold text-foreground truncate">{title || "ניהול מקומות ישיבה"}</h1>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <div className="hidden sm:flex items-center gap-2 text-sm text-muted-foreground">
              <UserCircle className="h-4 w-4" />
              <span>{profile?.full_name}</span>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                {getRoleLabel()}
              </span>
            </div>
            <span className="sm:hidden rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              {getRoleLabel()}
            </span>
            <Button variant="ghost" size="icon" onClick={signOut} title="יציאה">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto p-3 sm:p-4 space-y-4 sm:space-y-6">
        {children}
      </main>
    </div>
  );
}
