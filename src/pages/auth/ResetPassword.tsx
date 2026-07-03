import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { z } from "zod";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [pwd, setPwd] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    // If the URL hash carries a recovery token, allow the form immediately.
    if (typeof window !== "undefined" && window.location.hash.includes("type=recovery")) {
      setReady(true);
    }
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    supabase.auth.getSession().then(({ data: { session } }) => { if (session) setReady(true); });
    return () => sub.subscription.unsubscribe();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    const p = z.string().min(8, "Min 8 chars").max(72).safeParse(pwd);
    if (!p.success) return setErr(p.error.errors[0].message);
    if (pwd !== confirm) return setErr("Passwords do not match");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pwd });
    setBusy(false);
    if (error) return setErr(error.message);
    toast({ title: "Password updated", description: "Please sign in with your new password." });
    await supabase.auth.signOut();
    navigate("/auth", { replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md p-6 space-y-4">
        <h1 className="text-xl font-bold">Set new password</h1>
        {!ready ? (
          <p className="text-sm text-muted-foreground">Open the reset link from your email to continue.</p>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <div>
              <Label>New password</Label>
              <div className="relative">
                <Input type={show ? "text" : "password"} value={pwd} onChange={(e) => setPwd(e.target.value)} />
                <button type="button" onClick={() => setShow((s) => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground">
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div>
              <Label>Confirm password</Label>
              <Input type={show ? "text" : "password"} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </div>
            {err && <p className="text-sm text-destructive">{err}</p>}
            <Button type="submit" className="w-full" disabled={busy}>{busy ? "Saving…" : "Update password"}</Button>
          </form>
        )}
      </Card>
    </div>
  );
}
