import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useRole } from "@/lib/role";
import { useNavigate } from "react-router-dom";
import { useEffect } from "react";

export default function PendingApproval() {
  const { profile, signOut, isApproved, user, loading } = useRole();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) navigate("/auth", { replace: true });
    if (!loading && isApproved) navigate("/", { replace: true });
  }, [loading, user, isApproved, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md p-6 space-y-4 text-center">
        <h1 className="text-xl font-bold">Account pending approval</h1>
        <p className="text-sm text-muted-foreground">
          Hi {profile?.full_name || profile?.email}, your account is awaiting admin approval.
          You'll be able to use the app once an admin assigns you a role.
        </p>
        <Button variant="outline" onClick={async () => { await signOut(); navigate("/auth"); }}>
          Logout
        </Button>
      </Card>
    </div>
  );
}
