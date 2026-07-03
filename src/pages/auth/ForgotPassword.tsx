import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Link } from "react-router-dom";
import { toast } from "@/hooks/use-toast";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: "https://velston-projects.vercel.app/reset-password",
    });
    setBusy(false);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else setSent(true);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md p-6 space-y-4">
        <h1 className="text-xl font-bold">Reset your password</h1>
        {sent ? (
          <p className="text-sm">If an account exists for <b>{email}</b>, a reset link has been sent.</p>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <div>
              <Label>Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Sending…" : "Send reset link"}
            </Button>
          </form>
        )}
        <Link to="/auth" className="block text-center text-sm text-primary hover:underline">Back to login</Link>
      </Card>
    </div>
  );
}
