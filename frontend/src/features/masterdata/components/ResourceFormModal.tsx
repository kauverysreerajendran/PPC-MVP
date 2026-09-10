"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { FormField, Select } from "@/components/ui/FormField";
import { useToast } from "@/components/ui/Toast";
import { ApiError } from "@/lib/api/errors";
import type { ResourceConfig } from "../config";
import { useMdCreate, useMdUpdate } from "../hooks";
import type { MdRecord } from "../types";

type Props = {
  config: ResourceConfig;
  open: boolean;
  onClose: () => void;
  record: MdRecord | null;
};

function toFormState(config: ResourceConfig, record: MdRecord | null): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of config.fields) {
    const raw = record ? (record as unknown as Record<string, unknown>)[f.name] : undefined;
    if (f.type === "datetime" && typeof raw === "string") {
      out[f.name] = raw.slice(0, 16); // yyyy-MM-ddTHH:mm
    } else {
      out[f.name] = raw == null ? (f.name === "status" ? "active" : "") : String(raw);
    }
  }
  return out;
}

export function ResourceFormModal({ config, open, onClose, record }: Props) {
  const editing = record != null;
  const [values, setValues] = useState<Record<string, string>>(() => toFormState(config, record));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const toast = useToast();
  const create = useMdCreate(config.resource);
  const update = useMdUpdate(config.resource);
  const pending = create.isPending || update.isPending;

  useEffect(() => {
    if (open) {
      setValues(toFormState(config, record));
      setFieldErrors({});
    }
  }, [open, record, config]);

  function set(name: string, value: string) {
    setValues((v) => ({ ...v, [name]: value }));
  }

  function buildPayload(): Record<string, unknown> {
    const payload: Record<string, unknown> = {};
    for (const f of config.fields) {
      if (editing && f.createOnly) continue;
      const raw = values[f.name]?.trim() ?? "";
      if (raw === "") {
        if (!editing && f.required) payload[f.name] = raw;
        continue;
      }
      if (f.type === "number") payload[f.name] = raw;
      else if (f.type === "datetime") payload[f.name] = new Date(raw).toISOString();
      else payload[f.name] = raw;
    }
    return payload;
  }

  async function submit() {
    const errs: Record<string, string> = {};
    for (const f of config.fields) {
      if (f.required && !editing && !values[f.name]?.trim()) errs[f.name] = "Required";
    }
    setFieldErrors(errs);
    if (Object.keys(errs).length) return;

    try {
      const payload = buildPayload();
      if (editing) {
        await update.mutateAsync({ id: (record as { id: string }).id, body: payload });
        toast("success", `${config.singular} updated`);
      } else {
        await create.mutateAsync(payload);
        toast("success", `${config.singular} created`);
      }
      onClose();
    } catch (err) {
      const message =
        err instanceof ApiError ? err.displayMessage : "Save failed — check the values";
      toast("error", message);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={editing ? `Edit ${config.singular}` : `New ${config.singular}`}
      description={editing ? (record as { id: string }).id : undefined}
      loading={pending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} loading={pending}>
            {editing ? "Save changes" : "Create"}
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {config.fields.map((f) => {
          const disabled = editing && f.createOnly;
          if (f.type === "select") {
            return (
              <Select
                key={f.name}
                label={f.label}
                required={f.required}
                value={values[f.name] ?? ""}
                error={fieldErrors[f.name]}
                disabled={disabled}
                onChange={(e) => set(f.name, e.target.value)}
              >
                {!f.required ? <option value="">—</option> : null}
                {f.options?.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </Select>
            );
          }
          if (f.type === "textarea") {
            return (
              <div key={f.name} className="sm:col-span-2">
                <FormField label={f.label} error={fieldErrors[f.name]}>
                  <textarea
                    rows={2}
                    value={values[f.name] ?? ""}
                    onChange={(e) => set(f.name, e.target.value)}
                    className="w-full rounded-[var(--radius-sm)] border border-border-strong bg-surface px-3 py-2 text-sm text-text outline-none focus:border-primary"
                  />
                </FormField>
              </div>
            );
          }
          return (
            <Input
              key={f.name}
              label={f.label}
              required={f.required}
              type={f.type === "number" ? "number" : f.type === "datetime" ? "datetime-local" : "text"}
              value={values[f.name] ?? ""}
              {...(fieldErrors[f.name] ? { error: fieldErrors[f.name] } : {})}
              disabled={disabled}
              onChange={(e) => set(f.name, e.target.value)}
            />
          );
        })}
      </div>
    </Modal>
  );
}
