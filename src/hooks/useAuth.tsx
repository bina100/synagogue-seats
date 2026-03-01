import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

interface Profile {
  id: string;
  username: string;
  full_name: string;
  requires_password_change: boolean;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  roles: Array<{ role: string; synagogue_id: string | null }>;
  loading: boolean;
  signUp: (username: string, password: string, fullName: string) => Promise<{ error: string | null }>;
  signIn: (username: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  isSuperAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<Array<{ role: string; synagogue_id: string | null }>>([]);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (authId: string) => {
    try {
      const { data } = await supabase
        .from("profiles")
        .select("id, username, full_name, requires_password_change")
        .eq("auth_id", authId)
        .single();
      if (data) {
        setProfile(data);
        const { data: rolesData } = await supabase
          .from("user_roles")
          .select("role, synagogue_id")
          .eq("user_id", data.id);
        setRoles(rolesData || []);
      }
    } catch (e) {
      console.warn("fetchProfile error:", e);
    }
    setLoading(false);
  };

  useEffect(() => {
    // Global safety timeout – always fires to prevent infinite loading
    const timeout = setTimeout(() => {
      setLoading((prev) => {
        if (prev) console.warn("Auth loading timeout – releasing loading state");
        return false;
      });
    }, 5000);

    let lastAuthId: string | null = null;

    const handleSession = (session: Session | null) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        // Only skip if we already fetched for this exact user
        if (lastAuthId !== session.user.id) {
          lastAuthId = session.user.id;
          fetchProfile(session.user.id);
        }
      } else {
        lastAuthId = null;
        setProfile(null);
        setRoles([]);
        setLoading(false);
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        handleSession(session);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      handleSession(session);
    });

    return () => {
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, []);

  const toAsciiEmail = (name: string): string => {
    return Array.from(name.toLowerCase().trim()).map(c => {
      const code = c.charCodeAt(0);
      if ((code >= 48 && code <= 57) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || c === '_' || c === '.' || c === '-') {
        return c;
      }
      if (c === ' ') return '_';
      return code.toString(16);
    }).join('');
  };

  const signUp = async (username: string, password: string, fullName: string) => {
    const email = `${toAsciiEmail(username)}@synagogue.local`;
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { username, full_name: fullName } },
    });
    if (error) return { error: error.message };
    return { error: null };
  };

  const signIn = async (username: string, password: string) => {
    const email = `${toAsciiEmail(username)}@synagogue.local`;
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    return { error: null };
  };

  const signOut = async () => {
    // Clear state immediately to avoid hanging on LockManager in iframe
    setUser(null);
    setSession(null);
    setProfile(null);
    setRoles([]);
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.warn("signOut error (ignored):", e);
    }
  };

  const isSuperAdmin = roles.some((r) => r.role === "super_admin" && !r.synagogue_id);

  return (
    <AuthContext.Provider
      value={{ user, session, profile, roles, loading, signUp, signIn, signOut, isSuperAdmin }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
