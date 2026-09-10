"use client";

import { useState } from "react";
import { Database } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { cn } from "@/lib/cn";
import { RESOURCES, RESOURCE_ORDER } from "../config";
import type { MdResource } from "../api";
import { ResourcePanel } from "./ResourcePanel";

export function MasterDataView() {
  const [active, setActive] = useState<MdResource>("models");
  const config = RESOURCES[active];

  return (
    <>
      <PageHeader
        title="Master Data"
        description="Models, plating colours, vendors, location hierarchy and SAP inward records — owned by the Masterdata service."
        breadcrumbs={[{ label: "Master Data" }, { label: config.label }]}
      />

      <div className="mb-4 flex flex-wrap gap-1 border-b border-border">
        {RESOURCE_ORDER.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setActive(r)}
            className={cn(
              "ds-focus-ring -mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm",
              active === r
                ? "border-primary text-text"
                : "border-transparent text-text-muted hover:text-text-secondary",
            )}
          >
            <Database className="size-3.5" aria-hidden />
            {RESOURCES[r].label}
          </button>
        ))}
      </div>

      <ResourcePanel key={active} config={config} />
    </>
  );
}
