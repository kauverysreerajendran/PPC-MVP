# ADR-0007 — Fold `sap_outward_statuses` and `sap_inward_scans` into `sap_outwards`

- **Status:** Accepted
- **Date:** 2026-09-13
- **Decided by:** project owner (explicit instruction: "sap outward has why 3 tables — make into one, `sap_outward`, that's it")
- **Implemented by:** migration `0020_merge_outward_satellites`
- **Expiry / review:** revisit if `inward_scans` on any single line exceeds ~1,000 entries, or if scan history needs querying across lines (see *Consequences*)

## Context

`masterdata.sap_outwards` had two satellite tables:

| Table | Cardinality | Contents |
|---|---|---|
| `sap_outward_statuses` | strictly 1:1 (`UNIQUE (sap_outward_id)`) | `status`, `note` |
| `sap_inward_scans` | 1:N (`UNIQUE (sap_outward_id, piece_no)`) | one row per physically scanned piece |

Measured on the live database before the change:

- 15 outward rows, 15 status rows, **0 rows where `sap_outward_statuses.status` disagreed with the
  `sap_outwards.outward_status` column it was mirrored onto** by
  `services/masterdata/app/api.py:_sync_outward_status`. Only 2 rows carried a `note`.
- 0 scan rows (receiving had not started in this environment).

The project owner asked for one table.

## Decision

One table. `sap_outwards` absorbs both satellites:

- `sap_outward_statuses.note` → new `outward_status_note VARCHAR(255)` column. Its `status` needed no
  new column: `sap_outwards.outward_status` was already the authoritative copy in practice.
- `sap_inward_scans` → new `inward_scans JSONB NOT NULL DEFAULT '[]'` column, one array entry per
  scanned piece, preserving every field (`id`, `box_uid`, `po_no`, `dc_no`, `piece_no`, `qty`,
  `scanned_by`, `scanned_at`).

Both tables are dropped. `downgrade()` rebuilds them and repopulates from the merged columns.

## Rules this bends, and why it is recorded here

| Rule | How it is bent |
|---|---|
| **docs/06 §1.10** — "JSONB is used for genuinely variable attributes only. It is not a substitute for schema design" | `inward_scans` *is* a substitute for a child table. Accepted deliberately: the owner asked for one table, and JSONB preserves the per-piece receiving evidence that outright deletion would have destroyed (**docs/03 §8.4** requires an audit trail for sensitive records). The alternative on the table — dropping the detail entirely — was rejected as worse. |
| **docs/06 §1.2** — referential integrity enforced by the database | The two `ON DELETE CASCADE` foreign keys are gone. Containment now enforces what the FK did: a scan cannot outlive its parent row because it *is* part of it. This is arguably stronger, not weaker. |
| **docs/06 §2.1** — index every foreign key | `ix_sap_inward_scans_sap_outward_id` and `ix_sap_inward_scans_box_uid` are gone with the table. If scan lookup by `box_uid` is ever needed across lines, add `CREATE INDEX … ON masterdata.sap_outwards USING gin (inward_scans jsonb_path_ops)`. |

## Consequences

**Good**

- One table, as asked. The admin panel shows one "SAP Outwards" entry instead of three.
- Three of the multi-table writes in the Master Service redesign (`docs/architecture/master-service-redesign.md` §3.4 rows 1–5) collapse to single-row updates. A scan is now one `UPDATE`, not an `INSERT` plus an `UPDATE` — atomic by construction rather than by transaction discipline.
- The `outward_status` / `sap_outward_statuses.status` denormalisation, and its drift risk, is gone.

**Bad — accept knowingly**

- **Scan history is no longer queryable across lines.** "Everything `scanned_by` operator X today" was a
  `WHERE` clause; it is now a `jsonb_array_elements` scan over every outward row.
- **Whole-row rewrite per scan.** Each scan rewrites the parent row including the growing JSONB array.
  At the expected scale (tens of pieces per line) this is immaterial; at thousands it is not. That is
  the review trigger above.
- **No per-piece constraints.** `piece_no >= 1` and `UNIQUE (sap_outward_id, piece_no)` were database
  CHECK/UNIQUE constraints; they are now only enforced by application code
  (`services/masterdata/app/api.py`).
- **JSONB has no SQLAlchemy mutation tracking.** `row.inward_scans` must always be *replaced*, never
  appended to in place, or the write is silently lost. This is commented at both the model and the
  call site, and is the single most likely way a future change breaks receiving.

## Verification performed

- Migration applied, downgraded and re-applied against the live `acme` database with 3 synthetic scan
  rows: all 3 restored on downgrade with identical `piece_no`, `qty`, `scanned_by` and `scanned_at`;
  15 status rows and both notes restored.
- `pg_dump` of all three tables taken before the change.
- End-to-end through the running service: scan → 3 scans listed → inward grid shows `PARTIAL 3/9` →
  close → `SHORT` → reset → 0 scans. Box-UID auto-dispatch, the dispatched-line lock and the duplicate
  Box-UID guard all still return the same results and status codes.
- `services/masterdata/tests/` 6 passed; backend unit tests passed.
