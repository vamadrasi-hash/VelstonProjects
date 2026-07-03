import { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PageHeader({
  title,
  subtitle,
  action,
  backTo,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  backTo?: string;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 flex-1">
        {backTo && (
          <Button variant="ghost" size="sm" asChild className="-ml-2 mb-1 h-9">
            <Link to={backTo}>
              <ArrowLeft className="h-4 w-4" /> Back
            </Link>
          </Button>
        )}
        <h2 className="text-xl sm:text-2xl font-semibold leading-tight break-words">{title}</h2>
        {subtitle && <div className="text-sm text-muted-foreground mt-0.5">{subtitle}</div>}
      </div>
      {action && <div className="flex shrink-0 gap-2 flex-wrap">{action}</div>}
    </div>
  );
}
