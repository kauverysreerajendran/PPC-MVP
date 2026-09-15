import type { Metadata } from "next";
import Link from "next/link";
import { Boxes, ChevronRight, Grid3x3 } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { PageHeader } from "@/components/ui/PageHeader";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { ThemeSetting } from "@/features/settings/ThemeSetting";

const MASTER_LINKS = [
  { label: "Master Data", description: "Vendors, models, materials and other master tables.", href: "/master-data", icon: Boxes },
  { label: "Racks", href: "/racks", description: "Rack topology and tray slot layout.", icon: Grid3x3 },
];

export const metadata: Metadata = { title: "Settings" };

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-4 border-b border-border py-6 first:pt-0 last:border-0 md:grid-cols-[240px_1fr]">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="mt-1 text-xs text-text-secondary">{description}</p>
      </div>
      <div className="max-w-lg space-y-4">{children}</div>
    </section>
  );
}

export default async function SettingsPage() {
  const user = await requireUser();

  return (
    <>
      <PageHeader
        title="Settings"
        description="Manage your profile and application preferences."
        breadcrumbs={[{ label: "Settings" }]}
      />

      <div className="rounded-[var(--radius-md)] border border-border bg-surface px-5">
        <Section title="Profile" description="Your account details as they appear across TITAN.">
          <Input label="Full name" defaultValue={user.full_name ?? ""} />
          <Input label="Email" type="email" defaultValue={user.email} disabled />
          <Input label="Role" defaultValue={user.role} disabled />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm">
              Cancel
            </Button>
            <Button size="sm">Save changes</Button>
          </div>
        </Section>

        <Section title="Appearance" description="Choose how the interface looks on this device.">
          <ThemeSetting />
        </Section>

        <Section
          title="Security"
          description="Password and session controls are managed by your administrator."
        >
          <Button variant="secondary" size="sm">
            Change password
          </Button>
        </Section>

        <Section title="Masters" description="Manage master data and rack topology.">
          <div className="space-y-2">
            {MASTER_LINKS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="ds-focus-ring flex items-center gap-3 rounded-[var(--radius-md)] border border-border px-3 py-2.5 text-sm hover:border-primary hover:bg-surface-2"
              >
                <item.icon className="size-4 shrink-0 text-primary" />
                <span className="flex-1">
                  <span className="block font-medium">{item.label}</span>
                  <span className="block text-xs text-text-secondary">{item.description}</span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-text-muted" />
              </Link>
            ))}
          </div>
        </Section>
      </div>
    </>
  );
}
