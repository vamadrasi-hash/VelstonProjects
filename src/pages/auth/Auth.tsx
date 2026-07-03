import { useState, useEffect } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import logo from "@/assets/velston-logo.png";

const emailSchema = z.string().trim().email("Invalid email").max(255);
const passwordSchema = z.string().min(8, "Min 8 chars").max(72);
const nameSchema = z.string().trim().min(1, "Name required").max(100);
const mobileSchema = z.string().trim().regex(/^\+?[0-9]{10,15}$/, "Enter 10–15 digits");

export default function Auth() {
  const navigate = useNavigate();
  const loc = useLocation();
  const [tab, setTab] = useState<"login" | "signup">("login");
  const [showPwd, setShowPwd] = useState(false);

  // login
  const [li, setLi] = useState({ email: "", password: "" });
  const [liErr, setLiErr] = useState<string | null>(null);
  const [liBusy, setLiBusy] = useState(false);
  const [notFoundOpen, setNotFoundOpen] = useState(false);

  // signup
  const [su, setSu] = useState({ name: "", mobile: "", email: "", password: "", confirm: "" });
  const [suErr, setSuErr] = useState<string | null>(null);
  const [suBusy, setSuBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) navigate("/", { replace: true });
    });
  }, [navigate]);

  const onLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLiErr(null);
    const emailP = emailSchema.safeParse(li.email);
    if (!emailP.success) return setLiErr(emailP.error.errors[0].message);
    if (!li.password) return setLiErr("Password required");
    setLiBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: li.email.trim(), password: li.password });
    setLiBusy(false);
    if (error) {
      // Probe whether the user exists
      const { error: probeErr } = await supabase.auth.signInWithOtp({
        email: li.email.trim(),
        options: { shouldCreateUser: false },
      });
      const msg = (probeErr?.message || "").toLowerCase();
      if (msg.includes("not found") || msg.includes("signups not allowed") === false && msg.includes("user")) {
        setNotFoundOpen(true);
      } else if (msg.includes("signups not allowed")) {
        setLiErr("Invalid email or password.");
      } else {
        setLiErr("Invalid email or password. New here? Sign up below.");
      }
      return;
    }
    toast({ title: "Welcome back" });
    const from = (loc.state as any)?.from || "/";
    navigate(from, { replace: true });
  };

  const onSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuErr(null);
    const checks = [
      nameSchema.safeParse(su.name),
      mobileSchema.safeParse(su.mobile),
      emailSchema.safeParse(su.email),
      passwordSchema.safeParse(su.password),
    ];
    const bad = checks.find((c) => !c.success);
    if (bad && !bad.success) return setSuErr(bad.error.errors[0].message);
    if (su.password !== su.confirm) return setSuErr("Passwords do not match");

    setSuBusy(true);
    const { error } = await supabase.auth.signUp({
      email: su.email.trim(),
      password: su.password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { full_name: su.name.trim(), mobile: su.mobile.trim() },
      },
    });
    setSuBusy(false);
    if (error) {
      setSuErr(error.message);
      return;
    }
    toast({
      title: "Account created",
      description: "An admin will review and activate your account shortly.",
    });
    setTab("login");
    setLi({ email: su.email.trim(), password: "" });
  };

  const switchToSignup = () => {
    setSu((s) => ({ ...s, email: li.email }));
    setNotFoundOpen(false);
    setTab("signup");
    setTimeout(() => document.getElementById("su-name")?.focus(), 50);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md p-6 space-y-4">
        <div className="flex items-center gap-2 justify-center">
          <img src={logo} alt="Velston" className="h-10 w-10" />
          <h1 className="text-xl font-bold">Velston Projects</h1>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="login">Login</TabsTrigger>
            <TabsTrigger value="signup">Sign up</TabsTrigger>
          </TabsList>

          <TabsContent value="login">
            <form onSubmit={onLogin} className="space-y-3 pt-2">
              <div>
                <Label>Email</Label>
                <Input type="email" autoComplete="email" value={li.email}
                  onChange={(e) => setLi({ ...li, email: e.target.value })} />
              </div>
              <div>
                <Label>Password</Label>
                <div className="relative">
                  <Input type={showPwd ? "text" : "password"} autoComplete="current-password"
                    value={li.password} onChange={(e) => setLi({ ...li, password: e.target.value })} />
                  <button type="button" onClick={() => setShowPwd((s) => !s)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground">
                    {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              {liErr && <p className="text-sm text-destructive">{liErr}</p>}
              <Button type="submit" className="w-full" disabled={liBusy}>
                {liBusy ? "Signing in…" : "Sign in"}
              </Button>
              <div className="text-center">
                <Link to="/forgot-password" className="text-sm text-primary hover:underline">Forgot password?</Link>
              </div>
            </form>
          </TabsContent>

          <TabsContent value="signup">
            <form onSubmit={onSignup} className="space-y-3 pt-2">
              <div>
                <Label htmlFor="su-name">Full name</Label>
                <Input id="su-name" value={su.name} onChange={(e) => setSu({ ...su, name: e.target.value })} />
              </div>
              <div>
                <Label>Mobile number</Label>
                <Input type="tel" value={su.mobile} onChange={(e) => setSu({ ...su, mobile: e.target.value })}
                  placeholder="9876543210" />
              </div>
              <div>
                <Label>Email</Label>
                <Input type="email" value={su.email} onChange={(e) => setSu({ ...su, email: e.target.value })} />
              </div>
              <div>
                <Label>Password</Label>
                <div className="relative">
                  <Input type={showPwd ? "text" : "password"} value={su.password}
                    onChange={(e) => setSu({ ...su, password: e.target.value })} />
                  <button type="button" onClick={() => setShowPwd((s) => !s)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground">
                    {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div>
                <Label>Confirm password</Label>
                <Input type={showPwd ? "text" : "password"} value={su.confirm}
                  onChange={(e) => setSu({ ...su, confirm: e.target.value })} />
              </div>
              {suErr && <p className="text-sm text-destructive">{suErr}</p>}
              <Button type="submit" className="w-full" disabled={suBusy}>
                {suBusy ? "Creating…" : "Create account"}
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                After verifying your email, an admin will approve your account.
              </p>
            </form>
          </TabsContent>
        </Tabs>
      </Card>

      <AlertDialog open={notFoundOpen} onOpenChange={setNotFoundOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>No account found</AlertDialogTitle>
            <AlertDialogDescription>
              We couldn't find an account for <b>{li.email}</b>. Would you like to sign up?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={switchToSignup}>Sign up</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
