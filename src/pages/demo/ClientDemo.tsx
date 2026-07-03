import { useEffect, useMemo } from "react";
import { useParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { findDemoClient, prettifySlug } from "@/lib/demoClients";

export default function ClientDemo() {
  const { customerSlug } = useParams<{ customerSlug: string }>();

  const client = useMemo(() => {
    const found = findDemoClient(customerSlug);
    if (found) return found;
    return { slug: customerSlug || "", name: prettifySlug(customerSlug || "Client") };
  }, [customerSlug]);

  useEffect(() => {
    document.title = `${client.name} — Demo`;
  }, [client.name]);

  return (
    <main className="min-h-screen bg-background text-foreground flex items-center justify-center px-4">
      <div className="max-w-2xl w-full text-center space-y-6">
        <Badge variant="outline" className="uppercase tracking-wider">
          Demo environment
        </Badge>
        <h1 className="text-4xl md:text-5xl font-bold text-primary">{client.name}</h1>
        {client.tagline && (
          <p className="text-lg text-muted-foreground">{client.tagline}</p>
        )}
        <p className="text-sm text-muted-foreground">
          A private demo prepared for {client.name}.
        </p>
        <div className="pt-4">
          <Button size="lg">Get started</Button>
        </div>
      </div>
    </main>
  );
}
