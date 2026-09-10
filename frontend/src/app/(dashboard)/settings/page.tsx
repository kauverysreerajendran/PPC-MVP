import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/session";
import { PageHeader } from "@/components/ui/PageHeader";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { ThemeSetting } from "@/features/settings/ThemeSetting";

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
      </div>
    </>
  );
}
