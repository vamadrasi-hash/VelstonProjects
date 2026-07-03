import { createContext, useContext, useEffect, useState, ReactNode, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";

export type Role = "super_admin" | "admin" | "supervisor";

type Supervisor = { id: string; name: string; user_id?: string | null };
type Profile = {
  user_id: string;
  full_name: string;
  mobile: string;
  email: string;
  status: "pending" | "approved" | "rejected";
};

type RoleCtx = {
  // auth
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  realRole: Role | null;
  isApproved: boolean;
  loading: boolean;
  signOut: () => Promise<void>;
  // effective (after impersonation for super_admin)
  role: Role | "admin"; // legacy callers expect role
  supervisorId: string | null;
  supervisor: Supervisor | null;
  supervisors: Supervisor[];
  // legacy setters (no-ops except for super_admin impersonation)
  setRole: (r: Role) => void;
  setSupervisorId: (id: string) => void;
  refreshSupervisors: () => Promise<void>;
  // impersonation (super_admin only)
  impersonateKey: string; // 'self' | 'admin' | `sup:<id>`
  setImpersonateKey: (k: string) => void;
};

const Ctx = createContext<RoleCtx | null>(null);

export function RoleProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [realRole, setRealRole] = useState<Role | null>(null);
  const [mySupervisorId, setMySupervisorId] = useState<string | null>(null);
  const [supervisors, setSupervisors] = useState<Supervisor[]>([]);
  const [loading, setLoading] = useState(true);
  const [impersonateKey, setImpersonateKeyState] = useState<string>(
    localStorage.getItem("bf_impersonate") || "self",
  );

  const setImpersonateKey = (k: string) => {
    setImpersonateKeyState(k);
    localStorage.setItem("bf_impersonate", k);
  };

  const refreshSupervisors = async () => {
    const { data } = await supabase.from("supervisors").select("id,name,user_id").order("name");
    setSupervisors((data as any) || []);
  };

  const loadUserData = async (uid: string) => {
    const [{ data: prof }, { data: roles }, { data: sup }] = await Promise.all([
      supabase.from("profiles").select("*").eq("user_id", uid).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", uid),
      supabase.from("supervisors").select("id").eq("user_id", uid).maybeSingle(),
    ]);
    setProfile((prof as any) || null);
    const rs = (roles || []).map((r: any) => r.role as Role);
    const top: Role | null = rs.includes("super_admin")
      ? "super_admin"
      : rs.includes("admin")
        ? "admin"
        : rs.includes("supervisor")
          ? "supervisor"
          : null;
    setRealRole(top);
    setMySupervisorId((sup as any)?.id || null);
    // Fetch supervisors now that we're authenticated (RLS requires it)
    await refreshSupervisors();
  };

  useEffect(() => {
    // Set listener BEFORE getSession (Lovable rule)
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      if (sess?.user) {
        // defer DB calls
        setTimeout(() => loadUserData(sess.user.id), 0);
      } else {
        setProfile(null);
        setRealRole(null);
        setMySupervisorId(null);
      }
    });

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) loadUserData(s.user.id).finally(() => setLoading(false));
      else setLoading(false);
    });




    return () => sub.subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem("bf_impersonate");
    setImpersonateKeyState("self");
  };

  // Compute EFFECTIVE role/supervisor (impersonation only for super_admin)
  const { effRole, effSupervisorId } = useMemo(() => {
    if (realRole === "super_admin" || realRole === "admin") {
      if (impersonateKey === "self" || impersonateKey === "admin") {
        return { effRole: "admin" as Role, effSupervisorId: null as string | null };
      }
      if (impersonateKey.startsWith("sup:")) {
        return { effRole: "supervisor" as Role, effSupervisorId: impersonateKey.slice(4) };
      }
      return { effRole: "admin" as Role, effSupervisorId: null };
    }
    if (realRole === "supervisor") return { effRole: "supervisor" as Role, effSupervisorId: mySupervisorId };
    return { effRole: "admin" as Role, effSupervisorId: null };
  }, [realRole, impersonateKey, mySupervisorId]);

  const supervisor = supervisors.find((s) => s.id === effSupervisorId) || null;
  const isApproved = profile?.status === "approved";

  const setRole = (_r: Role) => {};
  const setSupervisorId = (id: string) => {
    if (realRole === "super_admin" || realRole === "admin") setImpersonateKey(`sup:${id}`);
  };

  return (
    <Ctx.Provider
      value={{
        user, session, profile, realRole, isApproved, loading, signOut,
        role: effRole, supervisorId: effSupervisorId, supervisor, supervisors,
        setRole, setSupervisorId, refreshSupervisors,
        impersonateKey, setImpersonateKey,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useRole() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useRole must be used within RoleProvider");
  return ctx;
}
