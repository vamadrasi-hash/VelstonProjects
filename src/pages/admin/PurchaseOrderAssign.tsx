// Legacy stage-2 route. Supervisor lifecycle now lives on the PO Sites page + Assignments Register.
import { Link, useParams } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ExternalLink } from "lucide-react";

export default function PurchaseOrderAssign() {
  const { id } = useParams();
  return (
    <div className="space-y-4 max-w-2xl">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link to={`/admin/purchase-orders/${id}/sites`}><ArrowLeft className="h-4 w-4" /> Back to Site assignments</Link>
      </Button>
      <Card className="p-6 space-y-3 text-center">
        <h3 className="font-semibold text-lg">Supervisor assignment has moved</h3>
        <p className="text-sm text-muted-foreground">
          Assign the <b>first</b> supervisor to a site from the PO's <b>Site Assignments</b> page.<br />
          Any further change — add another supervisor, hand-over, or release — happens in the <b>Assignments Register</b>.
        </p>
        <div className="flex gap-2 justify-center flex-wrap pt-2">
          <Button asChild variant="outline">
            <Link to={`/admin/purchase-orders/${id}/sites`}>Site Assignments</Link>
          </Button>
          <Button asChild>
            <Link to="/admin/assignments"><ExternalLink className="h-4 w-4 mr-1" /> Assignments Register</Link>
          </Button>
        </div>
      </Card>
    </div>
  );
}
