import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { demoClients } from "@/lib/demoClients";
import { toast } from "sonner";
import { Copy, ExternalLink } from "lucide-react";

export default function DemoIndex() {
  useEffect(() => {
    document.title = "Demo Index";
  }, []);

  const origin = typeof window !== "undefined" ? window.location.origin : "";

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch {
      toast.error("Copy failed");
    }
  };

  return (
    <main className="min-h-screen bg-muted/30 px-4 py-8">
      <div className="max-w-3xl mx-auto space-y-4">
        <div>
          <h1 className="text-2xl font-semibold">Demo Index</h1>
          <p className="text-sm text-muted-foreground">
            Internal list of active client demo links.
          </p>
        </div>
        {demoClients.length === 0 ? (
          <Card className="p-6 text-center text-muted-foreground text-sm">
            No demo clients configured yet. Add them in <code>src/lib/demoClients.ts</code>.
          </Card>
        ) : (
          <div className="space-y-2">
            {demoClients.map((c) => {
              const url = `${origin}/c/${c.slug}`;
              return (
                <Card key={c.slug} className="p-3 flex items-center gap-3 min-w-0">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{c.name}</div>
                    <div className="text-xs text-muted-foreground truncate">{url}</div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => copy(url)}>
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button size="sm" asChild>
                    <Link to={`/c/${c.slug}`}>
                      <ExternalLink className="h-4 w-4 mr-1" /> Open
                    </Link>
                  </Button>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
