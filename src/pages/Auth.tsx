import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Building2 } from "lucide-react";

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    if (isLogin) {
      const { error } = await signIn(username, password);
      if (error) {
        toast({ title: "שגיאה בכניסה", description: "שם משתמש או סיסמה שגויים", variant: "destructive" });
      } else {
        navigate("/");
      }
    } else {
      if (!fullName.trim()) {
        toast({ title: "שגיאה", description: "יש להזין שם מלא", variant: "destructive" });
        setIsLoading(false);
        return;
      }
      const { error } = await signUp(username, password, fullName);
      if (error) {
        toast({ title: "שגיאה בהרשמה", description: error, variant: "destructive" });
      } else {
        toast({ title: "נרשמת בהצלחה!", description: "ברוך הבא למערכת" });
        navigate("/");
      }
    }
    setIsLoading(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-3 sm:p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center space-y-3">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
            <Building2 className="h-8 w-8 text-primary" />
          </div>
          <CardTitle className="text-2xl font-bold">ניהול מקומות ישיבה</CardTitle>
          <CardDescription className="text-base">
            {isLogin ? "הכנס לחשבונך" : "צור חשבון חדש"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">שם משתמש</Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="הכנס שם משתמש"
                required
                autoComplete="username"
                className="text-right"
              />
            </div>

            {!isLogin && (
              <div className="space-y-2">
                <Label htmlFor="fullName">שם מלא</Label>
                <Input
                  id="fullName"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="הכנס שם מלא"
                  required
                  className="text-right"
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="password">סיסמה</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="הכנס סיסמה"
                required
                autoComplete={isLogin ? "current-password" : "new-password"}
                className="text-right"
              />
            </div>

            <Button type="submit" className="w-full text-base sm:text-lg h-12" disabled={isLoading}>
              {isLoading ? "מעבד..." : isLogin ? "כניסה" : "הרשמה"}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={() => setIsLogin(!isLogin)}
              className="text-sm text-primary hover:underline"
            >
              {isLogin ? "אין לך חשבון? הירשם כאן" : "יש לך חשבון? הכנס כאן"}
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
