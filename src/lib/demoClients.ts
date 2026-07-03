export type DemoClient = {
  slug: string;
  name: string;
  tagline?: string;
};

export const demoClients: DemoClient[] = [
  { slug: "acme", name: "Acme Corp", tagline: "Construction services" },
];

export function findDemoClient(slug: string | undefined): DemoClient | undefined {
  if (!slug) return undefined;
  return demoClients.find((c) => c.slug.toLowerCase() === slug.toLowerCase());
}

export function prettifySlug(slug: string): string {
  return slug
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
