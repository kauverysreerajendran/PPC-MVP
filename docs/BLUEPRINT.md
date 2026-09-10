# TITAN PPC-WIM — MVP Implementation Blueprint

> **Project:** 26012 — CBE PPC Inventory Traceability System (PPC-WIM)
> **Scope of this document:** ONE implementation blueprint for the development team covering the MVP (DFD Process 6, 17, 18) built on a reusable, fully dynamic workflow foundation.
> **Primary source of truth:** `requirements.md` in the repo root. The DFD, proposal, PPT, architecture image and sample documents are supporting references. Where sources conflict or are silent, this document marks an **[OPEN-Qnn]** item and does **not** invent a rule.
> **Repo baseline:** existing Next.js 15 + FastAPI scaffold (`frontend/`, `backend/`) with auth/users/projects only. Everything in this blueprint is additive.

---

## 0. Architecture Mandate — Database-per-Service Microservices (MANDATORY, SUPERSEDING)

> **Status:** This section is a later directive from the project owner and **overrides every conflicting statement elsewhere in this blueprint.** Where §1 (¶ "Architecture: a modular monolith…"), §6, §7, §8, §26, §27, §28 and §29 describe a modular monolith / single Postgres instance / schema-per-module / in-process service registry, **those passages are superseded** and are retained only for historical context and migration guidance. Each is flagged inline.

### 0.1 Rule

The backend architecture **MUST** be a true, service-wise microservice architecture:

- **Each backend business capability is a SEPARATE, independently deployable service** (its own process, image, repo folder `services/<name>/`, Dockerfile, lifecycle, CI job, and release cadence).
- **Each service OWNS its own database.** A physically separate database (own instance or at minimum an isolated database with its own credentials, its own connection pool, and no shared roles) per service.
- **There is NO shared application database.** Creating one database that holds tables for multiple services is prohibited. Schema-per-module inside one Postgres instance does **not** satisfy this rule.
- **No service reads or writes another service's database directly.** Cross-service data access is only through that service's published API (synchronous) or via events (asynchronous). No cross-schema views, no shared SQLAlchemy metadata, no direct connection strings to another service's DB.
- **The API Gateway is the single external entry point.** Clients and field devices never call a service directly.
- Data that must be consistent across services is handled by **API composition** or **eventual consistency (events / outbox pattern)** — not by a shared transaction across databases.

### 0.2 Target logical architecture

```
                    API GATEWAY
                         │
       ┌─────────────────┼──────────────────┐
       │                 │                  │
       ▼                 ▼                  ▼
 SAP Integration    Workflow Service   Document Service
     Service              │                  │
       │                  │                  │
       ▼                  ▼                  ▼
   SAP DB             Workflow DB       Document DB
       │
       │
       └─────────────────────────────────────────────

                         │
                         ▼
                 Warehouse Service
                         │
                         ▼
                    Warehouse DB


                 Authentication Service
                         │
                         ▼
                       Auth DB


                    Audit Service
                         │
                         ▼
                      Audit DB
```

### 0.3 Services and their databases

| Service | Own database | Business capability (from §7) |
|---|---|---|
| **Authentication Service** | Auth DB | authn (JWT issue/refresh/rotation), configurable roles, permission matrix, user CRUD |
| **SAP Integration Service** | SAP DB | SAP data pull/sync via provider interface, field-mapping config, immutable SAP snapshots, sync-run status, SAP write orchestration |
| **Workflow Service** | Workflow DB | dynamic workflow engine (process/field/rule/status/transition definitions, executions, deviation sub-flow); also absorbs the former `catalog` reconciliation + Box UID lifecycle unless split out later |
| **Document Service** | Document DB | document metadata + versioning + entity/process linkage; blob storage via MinIO/S3 |
| **Warehouse Service** | Warehouse DB | location hierarchy master + QR, movement transactions (P17), RRB mapping (P18), occupancy, current-location projection |
| **Audit Service** | Audit DB | append-only audit sink, per-box trace timeline, traceability query API |

`notification` and `scheduler` remain supporting services (own DB only if they hold state — notification templates/history do, so **Notification DB** applies).

### 0.4 What this changes vs. the rest of the blueprint

- **§6 / §8 / §29:** replace "one Postgres instance, schema-per-module, `CREATE SCHEMA …`" with **one database per service**. Each service runs its own Alembic history against its own database. No `xr_` cross-schema views.
- **§7:** the "Module / Schema" table becomes a "Service / Database" table; the "Must NOT" column still applies.
- **§27:** the in-process **service registry / `registry.get(WorkflowService)`** is replaced by **HTTP (or gRPC) clients + typed contracts**. `contracts.py` stays as the interface definition but is consumed over the network. Hooks that currently call another module in-process (e.g. `P17 → WarehouseService.create_movement`, `P18 → WarehouseService.map_rrb`, `P6 → DeviationService.open`) become **cross-service API calls** or **published events**.
- **§28 / §34:** `backend/app/modules/<name>/` becomes `services/<name>/` — each with its own Dockerfile, `docker-compose` entry, DB service, migrations job, and health endpoints. `docker-compose.prod.yml` gains one DB container (or schemaless isolated DB) per service plus the gateway.
- **Cross-service transactions:** the §8/§16 "one DB transaction per use-case covering status transition + trace event + audit write" is **no longer atomic across services**. Use the **transactional outbox + event consumer** pattern: each service commits its own state + an outbox row atomically; audit/trace events propagate asynchronously and are idempotent.
- **Rollout is incremental.** The **SAP Integration Service is now built** (§0.5); the remaining services stay in the monolith until each is extracted in its own phase.

### 0.5 Implementation status

| Service | Status |
|---|---|
| **SAP Integration Service** | **Built** — `services/sap-integration/` (standalone FastAPI, port 8001), owns **`sap_db`** (`sap_inward_record`, `sap_sync_run`, `sap_outward_status`), own Alembic history, mock SAP provider, gateway route `/api/v1/sap/*` (nginx + Next rewrite). Powers the **SAP Upload** page. |
| Authentication / Workflow / Document / Warehouse / Audit | Not yet extracted — still the monolith scaffold. |

The SAP Integration Service verifies the gateway-forwarded HS256 JWT (shared
`SECRET_KEY`); fine-grained permissions and the outbox/event pipeline (OPEN-Q51)
are still pending.

### 0.6 Open items created by this mandate

- **[OPEN-Q50]** DB topology: one Postgres *instance* per service, or one instance hosting N isolated databases with per-service roles? (cost vs. isolation)
- **[OPEN-Q51]** Inter-service transport: REST over the gateway vs. internal service mesh; event bus choice (Redis Streams / RabbitMQ / Kafka / Postgres LISTEN-NOTIFY) for the outbox.
- **[OPEN-Q52]** Distributed traceability: how per-box trace timeline is assembled when its source rows live in 5 databases (API composition at the Audit/Trace service vs. a read-model projection).
- **[OPEN-Q53]** Reconciliation: does `catalog` (Box UID lifecycle / SAP-snapshot ↔ document reconciliation) stay inside Workflow Service or become its own Catalog Service + Catalog DB?
- **[OPEN-Q54]** Migration sequencing: which service is extracted first and how the existing single-DB scaffold is split without data loss.

---

## 1. Executive Summary

PPC-WIM is a single on-premise digital traceability layer sitting between Titan SAP, subcontract vendors, QA, Stores and shop-floor operators. The operator experience is: **scan the White Box UID → system auto-fetches every linked record (SAP PO/DC/material/vendor, Delivery Challan, QED Audit, dispatch mail) → system auto-validates → operator resolves any deviation → operator completes the process step → material is physically moved and its exact Rack/Row/Bin is recorded → the box is searchable and fully traceable forever.**

The MVP delivers three DFD process steps end-to-end — **Process 6 (Refer DC Doc & Mail Reference Verification)**, **Process 17 (Move to CBFC Rack)** and **Process 18 (Rack Row Bin Mapping)** — plus the deviation sub-loop attached to Process 6.

Critically, these three steps are **not** coded as bespoke screens. They are **configuration rows** consumed by a generic **Dynamic Workflow Engine**: process definitions, field definitions, validation rules, document requirements, role bindings, statuses and status transitions all live in the database. The Next.js frontend renders every process screen from metadata returned by the API. Adding Process 8, 10, 12 or a future Process 19 later is a data exercise (define fields + rules + documents + roles + statuses + transitions), not a frontend release.

The `Production` menu is renamed **SAP Upload**. It is not a manual Excel upload screen: it triggers and displays a **SAP data pull / synchronisation** through a dedicated SAP Integration module. Because Titan has not yet supplied SAP API specifics, the integration is built against a provider interface with a **mock/simulator provider** for the MVP and a config-driven real provider to be wired when Titan confirms the interface.

Architecture: a **modular monolith** (FastAPI) with hard module boundaries and a schema-per-module Postgres layout, fronted by an API Gateway concern, deployable today as one service and separable into the proposal's microservices later without rewriting business logic. Deployment target is on-premise Docker Compose behind Nginx, PostgreSQL 16, and MinIO (S3-compatible) for document blobs.

> **[SUPERSEDED by §0 — Architecture Mandate]** The modular-monolith / schema-per-module decision in the paragraph above is overridden. The mandated target is a true microservice architecture with **one database per service** (no shared application database). See §0.

## 2. Confirmed Business Understanding

Derived only from `requirements.md` and supplied references.

| # | Confirmed fact | Source |
|---|---|---|
| B1 | Titan CBE follows a subcontracting model: semi-finished watch components go to approved vendors (polishing/plating), return to Titan warehouse, are QC'd, inward-posted to SAP, stored, later issued to assembly. | req §2, §6 |
| B2 | The current process is manual: paper DC, Excel QED audit sheets, physical counting, manual SAP entry, manual rack search, email verification. | req §2, §14 |
| B3 | The **Box UID** (e.g. `BX-260615-01`) is the single common key linking White Box ↔ QED Audit Sheet ↔ Delivery Challan ↔ SAP PO ↔ inventory/storage record. | req §5, §7, §9 |
| B4 | The White Box barcode encodes **only the Box UID**. All business data is retrieved from the DB after scan. A quantity/verdict/location change must never require label reprint. | req §7.1, §7.2, §70 |
| B5 | The only vendor-side change is two new columns on the existing QED Audit Sheet: **White Box QR / Box UID** and **Number of Trays**. No new vendor software. | req §5, §33 |
| B6 | The inward DFD has **19 numbered processes** (D1–D14 data stores) plus two conditional sub-loops: **Deviation Handling** (around P6) and **Plating** (SAP 541). | req §10, §11, §12 |
| B7 | **Process 6** = Refer DC Doc and Mail Reference Verification (data store D3). One of three MVP processes. | req §10 P6, §13 |
| B8 | Deviation loop after P6: **Mark in DC → Mail to Vendor → Vendor Response / Accept the Deviation → Revised DC Validation** (D12). Deviation types: **shortage, excess, wrong model**. | req §11 |
| B9 | **Process 17** = Move to CBFC Rack (external entity: Store Team). MVP process. Must create a movement transaction, not overwrite location. | req §10 P17, §13, custom brief |
| B10 | **Process 18** = Rack Row Bin Mapping (Store Team, data store D10). MVP process. Rack/Row/Bin is master data, configurable, QR-coded. | req §10 P18, §13, §15, §56 |
| B11 | SAP is the source system for PO, Material, Batch, Model, Quantity, Vendor, Titan DC No, stock movement info. SAP movements referenced: **101** (GR), **321** (QD), **313** (bin transfer CBSC→CBFC), 261 (assembly issue, later), 541 (plating, later). | req §18, §41, §62 |
| B12 | SAP technical field names, API type (OData/BAPI/RFC/REST), auth, endpoints, and whether the app may *post* to SAP or only *assist* are **NOT provided** and must come from Titan. A configurable SAP field-mapping layer is mandatory. | req §18, §63, §67 |
| B13 | Roles implied: Vendor, Titan Gate Security, PPC, QA/QED, Store Team, CBFC Team, Admin. Exact role names + permissions to be confirmed. | req §27, §67-15/16 |
| B14 | API Gateway is the **single entry point for all field scans**; field devices do not call internal services directly. | req §19 L3, §40 |
| B15 | Scanners: wireless (TVSE BS512), scanner-with-display (TVSE K8), label printer (TVSE DT48). App must not couple to one model; scanner acts as keyboard-wedge/HID or network/API device. | req §24, §51 |
| B16 | FIFO is maintained on **Titan DC No**. Exact FIFO rule to be confirmed. | req §30 |
| B17 | Every significant workflow event must be auditable and never silently overwritten; full historical retention (not latest-state-only). | req §29, §38, §54, §70 |
| B18 | Idempotency required for repeated scans and SAP posts. | req §42 |
| B19 | On-premise only. Next.js + FastAPI + PostgreSQL, JWT role-based auth, firewall, Titan network. | req §19, §20, §37, §61 |
| B20 | Quantity mismatch in tray (PS-03), component mix-up (PS-04), Vision System, material issue/261, plating/541 are **later phase** — not MVP. | req §3, §4, §31, §58, §59 |
| B21 | A DC can carry multiple line rows / multiple stock & challan references; the dispatch email confirms this. | req §34 |
| B22 | Plated material returns with an `/R` stock-number suffix (e.g. `10017WCB02/R`). | req §12, §32, §59 |

## 3. MVP Scope

**In scope — build now:**

1. **Foundation** — repo module layout, DB foundation, migrations, config, logging, correlation IDs, health checks.
2. **Auth / RBAC** — JWT (already present), extended to configurable roles + action-based permissions + server-side enforcement in every module.
3. **Master data** — Vendor, Material, Purchase Order (SAP-sourced snapshot), Delivery Challan, Box, QED Audit, Location hierarchy (CBFC → Rack → Row → Bin), Users/Roles, Process/Workflow configuration.
4. **SAP Integration module** — provider interface, mock provider, sync orchestration, SAP snapshot tables, field-mapping config, sync run log, idempotency, response audit. Real Titan provider deferred behind config.
5. **SAP Upload screen** (renamed from Production) — trigger sync, view sync runs, browse pulled PO/DC/material/vendor/batch/quantity data.
6. **Document / File module** — MinIO blob store + Postgres metadata, versioning, entity linkage, upload/download with RBAC, virus-scan hook.
7. **Dynamic Workflow Engine** — process definitions, field definitions, validation rules, document requirements, statuses, transitions, role bindings, process executions + execution data + execution history. Generic execute/transition/validate APIs.
8. **Dynamic Form Engine** (frontend) — `DynamicForm` renders any process from `/workflow/processes/{code}/definition`.
9. **Dynamic Validation Engine** — config-driven rule evaluation (equality, comparison, existence, prerequisite, location-availability) with error/warning/info severities and blocking/non-blocking behaviour.
10. **Process 6** configured on the engine: identify box → auto-fetch SAP/DC/QED/mail → display consolidated panel → run rules → show match/mismatch → complete verification OR raise deviation.
11. **Deviation sub-flow** — deviation record, mark-in-DC, mail-to-vendor (via Notification), vendor response capture, revised DC validation, resolution, audit.
12. **Warehouse / Location module** — location master CRUD, location QR resolution, occupancy, current-location projection.
13. **Process 17** configured on the engine: eligibility check (P6 complete) → scan box → scan/select destination CBFC rack → validate → confirm → **movement transaction** → traceability update.
14. **Process 18** configured on the engine: scan box → select Rack → Row → Bin → validate availability → confirm → persist `box_location` + history → audit.
15. **Audit / Traceability module** — central `audit_log`, per-box event timeline, traceability panel/API answering the §29 questions.
16. **Scanner integration** — `ScannerInput` component (HID/keyboard-wedge default) + `/scan/resolve` gateway endpoint resolving Box UID or Location QR.
17. **Dashboard (MVP slice)** — pending verification, deviations, storage status, search by Box UID / material / model / vendor / DC / PO / Rack-Row-Bin / status.
18. **Testing** — unit, integration, API, workflow, SAP-mock, document, RBAC, scanner, E2E, UAT scenarios, failure scenarios, security.
19. **On-premise deployment** — Compose prod stack, Nginx, Postgres, MinIO, backup/restore, health/monitoring.

## 4. Explicitly Out of Scope (MVP)

| Item | Reason | Source |
|---|---|---|
| DFD Processes 1–5, 7–16, 19 as functional screens | Only P6/P17/P18 selected for MVP; engine must *support* adding them by config | brief, req §13 |
| Real Titan SAP API calls / actual 101 / 321 / 313 posting | SAP interface not supplied; mock provider only | req §67, B12 |
| SAP 261 assembly issue / material issue flow | Later phase | req §58, B20 |
| Plating / SAP 541 loop | Later phase (engine leaves room) | req §12, §59, B20 |
| PS-03 quantity mismatch in tray, PS-04 component mix-up controls | Explicitly next phase | req §4, B20 |
| Vision System (component counting, document OCR) | Future/possible only | req §31, B20 |
| Automated mail *ingestion* of vendor dispatch emails | Mechanism unconfirmed; MVP captures mail reference manually + attaches the .eml/PDF as a document | req §67-13/14 |
| Smart auto put-away suggestion engine | Proposal feature, not in the 3 MVP processes; hooks left in Location module | req §15, §46 |
| Multi-plant rollout, MES/IoT postings | Future scalability only | req §38 |
| Vendor outward / vendor-side portal | Vendor keeps manual process | req §5, §6 |
| FIFO enforcement logic | Rule unconfirmed — capture the data (DC date/seq, receipt/storage timestamps), defer enforcement | req §30, §67-20 |

## 5. End-to-End MVP Workflow

```
                    ┌─────────────────────────────────────────────┐
                    │  SAP UPLOAD (sync)                           │
  Titan SAP  ──►  SAP Integration module  ──►  validate/transform  ──►  sap_* snapshot tables
                    │  PO / DC / Material / Vendor / Batch / Qty   │
                    └─────────────────────────────────────────────┘
                                     │
        Vendor (manual, existing) ───┤  QED Audit Sheet (Box UID + Trays) + Delivery Challan + Dispatch Mail
                                     ▼
                    ┌─────────────────────────────────────────────┐
                    │  Box registered / imported  (box_uid)       │  ← box↔DC↔material↔batch↔QED linkage
                    └─────────────────────────────────────────────┘
                                     │  scan Box UID
                                     ▼
   ┌──────────────────────────────  PROCESS 6  ──────────────────────────────┐
   │ auto-fetch: SAP PO/material/vendor/qty · Titan DC + Vendor DC · QED     │
   │ audit (accepted/rework/verdict) · mail reference · required documents    │
   │ run validation rules → MATCH / MISMATCH panel                           │
   │        ├── all pass / operator accepts  → status DOCUMENT_VERIFIED       │
   │        └── mismatch → RAISE DEVIATION                                    │
   │              Mark in DC → Mail to Vendor → Vendor Response/Accept        │
   │              → Revised DC upload + validation → DEVIATION_RESOLVED       │
   └────────────────────────────────────────────────────────────────────────┘
                                     │  (P6 must be COMPLETED)
                                     ▼
   ┌──────────────────────────────  PROCESS 17  ─────────────────────────────┐
   │ scan Box UID → show current material/status → scan/select CBFC Rack     │
   │ validate (P6 done, box not already stored, rack valid & active)         │
   │ confirm → inventory_movement row (from → to, type=MOVE_TO_CBFC_RACK)    │
   │ box.current_location = Rack ; status MOVED_TO_RACK                      │
   └────────────────────────────────────────────────────────────────────────┘
                                     │  (P17 must be COMPLETED)
                                     ▼
   ┌──────────────────────────────  PROCESS 18  ─────────────────────────────┐
   │ scan Box UID → pick Rack (default = P17 rack) → Row → Bin               │
   │ validate (bin belongs to row→rack, bin active, occupancy rule)          │
   │ confirm → box_location (rack_id,row_id,bin_id) + box_location_history   │
   │ status STORED ; box searchable by exact location                       │
   └────────────────────────────────────────────────────────────────────────┘
                                     ▼
                    Traceability panel: full lineage + event timeline
```

Per-step detail (screen · action · API · DB writes · validation · status · audit) is in sections 15–19.

## 6. Updated Architecture

> **[SUPERSEDED by §0 — Architecture Mandate]** This section describes a modular monolith with one Postgres instance and schema-per-module. The mandated architecture is separate deployable services, **each owning its own database**, behind the API Gateway. The diagram and seams below are retained for migration context only. See §0.

**Style:** modular monolith now, microservice-ready. One FastAPI app, one Postgres instance, **one schema per logical module**, module code isolated under `backend/app/modules/<name>/` with **no cross-module imports except through a published `contracts.py`**. Inter-module calls go through an in-process service registry that can later become HTTP without touching callers. This satisfies the proposal's microservice direction while honouring "do not over-engineer the MVP".

```
                         Shop floor / OT (Titan network, firewalled)
   ┌────────────┐   ┌──────────────┐   ┌───────────────┐   ┌──────────────┐
   │ HID / WiFi │   │ K8 scanner   │   │ Operator PC   │   │ Label printer│
   │ scanner    │   │ w/ display   │   │ (browser)     │   │ (DT48)       │
   └─────┬──────┘   └──────┬───────┘   └──────┬────────┘   └──────┬───────┘
         └─────────────────┴──────────┬───────┴───────────────────┘
                                      ▼
                          ┌───────────────────────┐
                          │  Nginx reverse proxy  │  TLS, rate-limit, headers
                          └───────────┬───────────┘
                     ┌────────────────┴───────────────┐
                     ▼                                ▼
          ┌────────────────────┐            ┌────────────────────────┐
          │ Next.js (SSR/RSC)  │            │  API Gateway layer     │
          │ frontend:3000      │───────────►│  (FastAPI app, /api/v1)│
          └────────────────────┘            │  authn, authz, req-id, │
                                            │  idempotency, routing  │
                                            └───────────┬────────────┘
        ┌───────────────┬───────────────┬───────────────┼───────────────┬───────────────┐
        ▼               ▼               ▼               ▼               ▼               ▼
   ┌─────────┐    ┌───────────┐   ┌───────────┐   ┌───────────┐   ┌───────────┐   ┌───────────┐
   │ identity│    │   sap     │   │ workflow  │   │ documents │   │ warehouse │   │  audit    │
   │ (auth,  │    │(integration)│  │ (engine + │   │ (metadata │   │ (location │   │(events,   │
   │ rbac)   │    │           │   │ P6/17/18) │   │ + MinIO)  │   │ + movement)│  │ trace)    │
   └────┬────┘    └─────┬─────┘   └─────┬─────┘   └─────┬─────┘   └─────┬─────┘   └─────┬─────┘
        │  schema:auth  │ schema:sap    │ schema:wf     │ schema:doc    │ schema:wh    │ schema:audit
        └───────────────┴───────────────┴───────┬───────┴───────────────┴──────────────┘
                                                ▼
                                   ┌───────────────────────┐   ┌──────────────┐
                                   │   PostgreSQL 16       │   │  MinIO (S3)  │
                                   │   (Traceability DB)   │   │  doc blobs   │
                                   └───────────────────────┘   └──────────────┘
                                                ▲
                                   ┌────────────┴───────────┐
                                   │ Redis (idempotency,    │  optional; app degrades gracefully
                                   │ rate-limit, cache)     │
                                   └────────────────────────┘
                                                ▲
                          ┌─────────────────────┴──────────────────────┐
                          │  notification (email/SMTP)   ·  scheduler  │
                          └────────────────────────────────────────────┘

   [ external ]  Titan SAP  ◄──── sap module provider (mock now │ real, config-driven, later)
                 Titan mail relay / Exchange  ◄──── notification module (SMTP; API TBC)
```

**Service-extraction seams (later):** each module already owns its schema, exposes a `contracts.py` (Pydantic DTOs + a `Protocol` interface), and is invoked via `app.core.registry.get(WorkflowService)`. Swapping the registry binding for an HTTP client turns a module into a service. No business code changes.

## 7. Microservice / Module Responsibilities

> **[SUPERSEDED IN PART by §0 — Architecture Mandate]** "Module + Schema" becomes "Service + its own Database" (see §0.3). The **Responsibilities** and **Must NOT** columns still apply; the **Schema** column is replaced by a dedicated database per service.

| Module | Schema | Owns (tables) | Responsibilities | Must NOT |
|---|---|---|---|---|
| **identity** | `auth` | `users`, `roles`, `permissions`, `role_permissions`, `user_roles`, `refresh_tokens` | Authn (JWT issue/refresh/rotation/reuse-detection), configurable roles, action-based permission matrix, `require_permission` dependency, user CRUD | Contain any PPC business rule |
| **sap** | `sap` | `sap_sync_run`, `sap_field_mapping`, `sap_po`, `sap_po_item`, `sap_dc`, `sap_dc_item`, `sap_material`, `sap_vendor`, `sap_batch`, `sap_movement_ref`, `sap_request_log` | Pull SAP data via provider interface; validate/transform via mapping config; persist immutable snapshots; sync-run status; SAP write orchestration (mock); idempotency keys; response audit; retry/timeout | Be the master for PPC-owned data (Box UID, location, workflow, deviation) |
| **catalog** | `catalog` | `vendor`, `material`, `purchase_order`(proj.), `delivery_challan`, `delivery_challan_item`, `box`, `qed_audit`, `qed_audit_item` | Reconcile SAP snapshot + document data into working master/traceability entities; Box UID lifecycle & uniqueness; box↔DC↔material↔QED linkage; barcode payload | Hold workflow state or location |
| **workflow** | `wf` | `process_definition`, `process_field`, `validation_rule`, `process_document_req`, `process_status`, `process_transition`, `process_role`, `process_execution`, `process_execution_data`, `process_execution_history`, `deviation`, `deviation_event` | Dynamic engine: serve process definitions; create/advance executions; evaluate rules; enforce prerequisites & transitions; deviation sub-flow | Hard-code P6/P17/P18; render UI; store files |
| **documents** | `doc` | `document`, `document_version`, `document_type`, `document_link` | Blob storage (MinIO) + metadata; versioning; entity/process linkage; RBAC download; checksum; scan hook | Interpret business meaning of a document |
| **warehouse** | `wh` | `storage_zone`, `rack`, `rack_row`, `bin`, `location_qr`, `box_location`, `box_location_history`, `inventory_movement` | Location hierarchy master + QR; movement transactions (P17); RRB mapping (P18); occupancy; current-location projection; put-away hook (stub) | Decide workflow eligibility (asks workflow via contract) |
| **audit** | `audit` | `audit_log`, `trace_event` | Central append-only audit sink; per-box trace timeline; traceability query API | Allow updates/deletes to its rows |
| **notification** | `notif` | `notification`, `notification_template` | Outbound email (SMTP) for deviation → vendor, internal alerts; delivery status; history | Contain deviation business logic |

Cross-cutting (not modules): **api-gateway layer** (`app/gateway/`), **scheduler** (APScheduler/Celery-beat), **config**, **observability**.

## 8. Database Architecture

> **[SUPERSEDED by §0 — Architecture Mandate]** "One database, schema-per-module" is overridden: **each service owns its own database**, with no cross-schema/`xr_` views and no shared metadata. Cross-service consistency is via API composition or the transactional-outbox event pattern, not a shared transaction. The per-table conventions (identity PK, `public_id`, timestamps, soft-delete rules, immutability triggers, index strategy) still apply **within each service's own database**. See §0.4.

- **Engine:** PostgreSQL 16, async SQLAlchemy 2.0 + asyncpg (matches existing repo).
- **One database, schema-per-module** (`auth`, `sap`, `catalog`, `wf`, `doc`, `wh`, `audit`, `notif`). A module may only write its own schema. Cross-schema reads allowed only via views prefixed `xr_` (explicit, reviewed) or via the module contract API. This is the microservice DB-ownership rule from the brief without the operational cost of N databases.
- **Every domain table** carries: `id BIGINT GENERATED ALWAYS AS IDENTITY` PK; `public_id UUID DEFAULT uuidv7()` for externally exposed ids; `created_at`, `updated_at timestamptz`; `created_by`, `updated_by BIGINT` (user id); `row_version INT` for optimistic locking on mutable transactional rows.
- **Soft delete** (`deleted_at`) only on **master/config** tables (vendor, material, locations, process definitions, users). **Transaction & audit tables are never deleted or updated destructively** — corrections are new rows / reversing entries (req §54, §70).
- **Immutability:** `sap_*` snapshot tables, `*_history`, `*_event`, `audit_log`, `inventory_movement`, `box_location_history` are append-only; enforced with a `BEFORE UPDATE/DELETE` trigger that raises.
- **Data classes** (tagged in comments + `docs/database.md`): MASTER, CONFIGURATION, TRANSACTION, SAP-SNAPSHOT, DOCUMENT-METADATA, AUDIT.
- **Keys/constraints:** natural unique keys enforced — `box.box_uid UNIQUE`, `bin.code UNIQUE within row`, `location_qr.qr_value UNIQUE`, `sap_po.po_number UNIQUE`, `delivery_challan.titan_dc_no UNIQUE`. All FKs `ON DELETE RESTRICT`.
- **Indexes:** every scan/search path — `box(box_uid)`, `box(material_id)`, `box(titan_dc_no)`, `box_location(bin_id)`, `box_location(rack_id,row_id,bin_id)`, `process_execution(process_code,status)`, `process_execution(box_id)`, `trace_event(box_id,occurred_at)`, `audit_log(entity,entity_id)`, GIN on `process_execution_data.data jsonb_path_ops`.
- **Transaction boundaries:** one DB transaction per use-case service method; process "complete" + status transition + trace event + audit write commit atomically or not at all.
- **Migrations:** Alembic, expand/contract, one revision per module feature, `alembic check` in CI (already the repo convention).
- **Seeding:** `app/db/seed.py` extended with idempotent config seeders — roles/permissions, document types, location sample hierarchy (flagged non-production), and **the P6/P17/P18 process configuration** (section 41).

## 9. Detailed ERD / Data Model

Notation: `PK` primary key, `FK→` foreign key, `U` unique, `[class]`.

### 9.1 identity (`auth`) — MASTER/CONFIG
```
users(id PK, public_id U, username U, email U, password_hash, full_name, is_active, last_login_at, deleted_at, audit cols)
roles(id PK, code U, name, description, is_system, deleted_at)                                   -- e.g. PPC, QA, STORE, CBFC, ADMIN
permissions(id PK, code U, description)                                                          -- e.g. process6:verify, movement:create, doc:upload
role_permissions(role_id FK→roles, permission_id FK→permissions, PK(role_id,permission_id))
user_roles(user_id FK→users, role_id FK→roles, PK(user_id,role_id))
refresh_tokens(id PK, user_id FK→users, token_hash U, family_id, issued_at, expires_at, used_at, revoked_at)
```

### 9.2 sap (`sap`) — SAP-SNAPSHOT + CONFIG
```
sap_sync_run(id PK, public_id U, object_types text[], trigger 'manual|scheduled', requested_by FK,
             status 'running|success|partial|failed', started_at, finished_at, stats jsonb, error text, idempotency_key U)
sap_field_mapping(id PK, object_type, app_field, sap_field, transform, is_active, U(object_type,app_field))   -- CONFIG
sap_po(id PK, sync_run_id FK, po_number U, sap_vendor_code, plant, currency, raw jsonb, pulled_at)            -- append-only
sap_po_item(id PK, sap_po_id FK, item_no, material_no, ordered_qty, uom, raw jsonb, U(sap_po_id,item_no))
sap_dc(id PK, sync_run_id FK, titan_dc_no U, vendor_code, dc_date, po_number, raw jsonb, pulled_at)
sap_dc_item(id PK, sap_dc_id FK, line_no, stock_no, batch_no, qty, uom, raw jsonb)
sap_material(id PK, sync_run_id FK, material_no U, model_no, part, description, uom, raw jsonb)
sap_vendor(id PK, sync_run_id FK, vendor_code U, vendor_name, gstin, raw jsonb)
sap_batch(id PK, sync_run_id FK, material_no, batch_no, raw jsonb, U(material_no,batch_no))
sap_movement_ref(id PK, box_uid, movement_type '101|321|313', sap_doc_no, posting_date, status, request_ref, response_ref, error, raw jsonb)  -- mock in MVP
sap_request_log(id PK, sync_run_id FK, direction 'pull|push', endpoint_key, request jsonb, response jsonb, http_status, duration_ms, attempt, ok bool, occurred_at)
```

### 9.3 catalog (`catalog`) — MASTER + TRANSACTION
```
vendor(id PK, public_id U, vendor_code U, name, sap_vendor_ref FK→sap.sap_vendor?, status, deleted_at)
material(id PK, public_id U, material_no U, model_no, part, description, uom, sap_material_ref FK?, deleted_at)
purchase_order(id PK, po_number U, vendor_id FK→vendor, plant, status, sap_po_ref FK→sap.sap_po)
po_item(id PK, po_id FK, item_no, material_id FK→material, ordered_qty, uom, U(po_id,item_no))
delivery_challan(id PK, public_id U, titan_dc_no U, vendor_dc_no, dc_date, vendor_id FK, po_id FK?, sap_dc_ref FK?, status, fifo_seq, received_at)
delivery_challan_item(id PK, dc_id FK, line_no, material_id FK, stock_no, batch_no, qty, uom, remarks)
box(id PK, public_id U, box_uid U, dc_id FK→delivery_challan, dc_item_id FK?, material_id FK, batch_no, lot_no,
    quantity, accepted_qty, rework_qty, verdict, tray_count, packing_date, current_status, current_location_id FK→wh.rack?, row_version)
qed_audit(id PK, public_id U, box_uid U, vendor_id FK, audit_date, audit_incharge, document_id FK→doc.document?)
qed_audit_item(id PK, qed_audit_id FK, s_no, model_no, part, inspected_qty, accepted_qty, rework_qty, od, pd, verdict)
mail_reference(id PK, box_id FK?, dc_id FK?, mail_type 'dispatch|input_to_polishing|deviation|other',
               subject, sent_on, external_ref, document_id FK→doc.document?)
```

### 9.4 workflow (`wf`) — CONFIGURATION + TRANSACTION
```
-- CONFIGURATION (the dynamic engine metadata)
process_definition(id PK, code U, name, description, sequence_no, entity_type 'BOX', is_active, version, deleted_at)
process_field(id PK, process_id FK, key, label, data_type 'string|number|date|bool|enum|reference|document',
              ui_component, source 'input|sap|dc|qed|mail|derived|constant', source_path, required bool,
              read_only bool, editable bool, enum_values jsonb, default_value, display_order, group_label, U(process_id,key))
validation_rule(id PK, process_id FK, code, description, rule_type 'compare|exists|prerequisite|location_available|bin_free|custom',
                expression jsonb, severity 'error|warning|info', blocking bool, message, display_order, is_active)
process_document_req(id PK, process_id FK, document_type_id FK→doc.document_type, required bool, min_count, max_count, condition jsonb)
process_status(id PK, process_id FK, code, label, is_initial bool, is_terminal bool, is_success bool, display_order, U(process_id,code))
process_transition(id PK, process_id FK, from_status FK→process_status, to_status FK→process_status,
                   action_code, label, guard jsonb, required_permission, U(process_id,from_status,action_code))
process_role(id PK, process_id FK, role_id FK→auth.roles, can_execute bool, can_view bool)
process_prerequisite(id PK, process_id FK, requires_process_code, requires_status_code, applies_to 'same_box')

-- TRANSACTION (runtime)
process_execution(id PK, public_id U, process_code FK→process_definition.code, box_id FK→catalog.box,
                  status FK→process_status.code, current_assignee FK→users?, started_by FK, started_at,
                  completed_at, outcome 'verified|deviation|moved|stored|cancelled', row_version, idempotency_key U)
process_execution_data(id PK, execution_id FK, field_key, value_text, value_num, value_date, value_json, U(execution_id,field_key))
process_execution_history(id PK, execution_id FK, from_status, to_status, action_code, actor_id FK, remarks, rule_results jsonb, occurred_at)  -- append-only

-- DEVIATION sub-flow (D12)
deviation(id PK, public_id U, execution_id FK→process_execution, box_id FK, deviation_type 'shortage|excess|wrong_model|other',
          expected_value, received_value, difference, marked_in_dc bool, status 'open|mailed|vendor_responded|accepted|rejected|revised_dc_pending|resolved',
          raised_by FK, raised_at, resolved_by FK, resolved_at, resolution_remarks, revised_dc_document_id FK→doc.document?, row_version)
deviation_event(id PK, deviation_id FK, event_type 'raised|marked_in_dc|mailed_vendor|vendor_response|accepted|rejected|revised_dc_uploaded|revised_dc_validated|resolved',
                actor_id FK, payload jsonb, notification_id FK→notif.notification?, occurred_at)  -- append-only
```

### 9.5 documents (`doc`) — DOCUMENT-METADATA
```
document_type(id PK, code U, name, description, allowed_mime text[], max_size_mb, retention_days, deleted_at)
   -- seed: DELIVERY_CHALLAN, JOB_CARD, QED_AUDIT_SHEET, DISPATCH_MAIL, INPUT_TO_POLISHING_MAIL, REVISED_DC, SAP_PRINTOUT, OTHER
document(id PK, public_id U, document_type_id FK, title, current_version_id FK→document_version, status 'active|superseded|deleted', created_by FK)
document_version(id PK, document_id FK, version_no, object_key, file_name, mime_type, size_bytes, checksum_sha256,
                 uploaded_by FK, uploaded_at, scan_status 'pending|clean|infected|skipped', U(document_id,version_no))
document_link(id PK, document_id FK, entity_type 'box|delivery_challan|qed_audit|process_execution|deviation|mail_reference',
              entity_id BIGINT, entity_public_id UUID, link_role, created_by FK, U(document_id,entity_type,entity_id,link_role))
```

### 9.6 warehouse (`wh`) — MASTER + TRANSACTION
```
storage_zone(id PK, code U, name, site 'CBFC|CBSC', is_active, deleted_at)                       -- MASTER
rack(id PK, public_id U, zone_id FK→storage_zone, code, name, is_active, deleted_at, U(zone_id,code))
rack_row(id PK, public_id U, rack_id FK→rack, code, name, display_order, is_active, deleted_at, U(rack_id,code))
bin(id PK, public_id U, row_id FK→rack_row, code, name, capacity_boxes int?, occupancy_rule 'single|multi|unlimited' default 'multi',
    is_active, deleted_at, U(row_id,code))
location_qr(id PK, qr_value U, level 'zone|rack|row|bin', ref_id BIGINT, is_active)               -- MASTER
box_location(id PK, box_id FK→catalog.box U, zone_id FK, rack_id FK, row_id FK?, bin_id FK?, assigned_by FK, assigned_at, row_version)  -- current
box_location_history(id PK, box_id FK, from_zone, from_rack, from_row, from_bin, to_zone, to_rack, to_row, to_bin,
                     movement_id FK→inventory_movement, changed_by FK, changed_at)               -- append-only
inventory_movement(id PK, public_id U, box_id FK→catalog.box, movement_type 'MOVE_TO_CBFC_RACK|RRB_MAP|CORRECTION',
                   from_location_json jsonb, to_location_json jsonb, execution_id FK→wf.process_execution,
                   performed_by FK, performed_at, device_id, remarks, status 'confirmed|reversed', reverses_id FK→inventory_movement?, idempotency_key U)  -- append-only
```

### 9.7 audit (`audit`) — AUDIT
```
audit_log(id PK, public_id U, actor_id BIGINT, actor_role, action, entity_type, entity_id BIGINT, entity_public_id UUID,
          process_code, previous_value jsonb, new_value jsonb, request_id, source_device, result 'success|failure',
          remarks, occurred_at)                                                                  -- append-only
trace_event(id PK, box_id BIGINT, box_uid, event_code, process_code, actor_id, actor_role,
            summary, detail jsonb, from_status, to_status, from_location, to_location,
            sap_ref, occurred_at)                                                                -- append-only, powers the timeline
```

### 9.8 notification (`notif`)
```
notification_template(id PK, code U, channel 'email', subject_tpl, body_tpl, is_active)
notification(id PK, public_id U, template_code, channel, recipient, cc, subject, body, related_entity_type, related_entity_id,
             status 'queued|sent|failed', provider_ref, error, queued_at, sent_at)
```

### 9.9 Relationship summary
```
users ─< user_roles >─ roles ─< role_permissions >─ permissions
roles ─< process_role >─ process_definition ─< process_field
                         process_definition ─< validation_rule
                         process_definition ─< process_document_req >─ document_type
                         process_definition ─< process_status ─< process_transition
                         process_definition ─< process_prerequisite
sap_sync_run ─< sap_po ─< sap_po_item ;  sap_sync_run ─< sap_dc ─< sap_dc_item ; ─< sap_material ; ─< sap_vendor
sap_vendor ~→ vendor ;  sap_material ~→ material ;  sap_po ~→ purchase_order ;  sap_dc ~→ delivery_challan
delivery_challan ─< delivery_challan_item
delivery_challan ─< box >─ material ;  box 1─1 qed_audit (by box_uid) ;  qed_audit ─< qed_audit_item
box ─< process_execution ─< process_execution_data
                          process_execution ─< process_execution_history
                          process_execution 1─< deviation ─< deviation_event
box 1─1 box_location ;  box ─< box_location_history ;  box ─< inventory_movement
storage_zone ─< rack ─< rack_row ─< bin ;  location_qr → (zone|rack|row|bin)
document ─< document_version ;  document ─< document_link → (any entity)
box ─< trace_event ;  (any entity) ─< audit_log
```

## 10. Dynamic Workflow Engine Design

**Goal:** P6, P17, P18 (and every future DFD step) are rows in `wf.process_*` tables. The engine is one code path; processes are data.

### 10.1 Concepts
- **Process definition** — code, name, sequence, entity type (`BOX` for MVP), version, active flag.
- **Fields** — what the screen shows/collects; each field declares its **data source** (`input` = operator types; `sap`/`dc`/`qed`/`mail` = auto-fetched via a resolver; `derived` = computed; `constant`). Read-only/editable/required flags drive rendering.
- **Validation rules** — declarative (section 12), each with severity + blocking flag.
- **Document requirements** — which `document_type`s must be linked, min/max count, optional condition.
- **Statuses & transitions** — a per-process state machine; transitions carry an `action_code`, an optional `guard` (JSON rule), and a `required_permission`.
- **Prerequisites** — "process X on the same box must be in status Y" (enforces P6→P17→P18).
- **Role bindings** — which roles may execute / view.
- **Execution** — a runtime instance bound to one box; holds current status + collected data + history.

### 10.2 Engine services (`wf/service.py`)
| Method | Purpose |
|---|---|
| `get_definition(process_code)` | Returns the full definition DTO (fields, rules, doc reqs, statuses, transitions, allowed actions for the caller's role). Cached; cache key includes definition `version`. |
| `start_execution(process_code, box_uid, actor)` | Checks role binding + prerequisites; creates `process_execution` at the initial status; resolves all `source != input` fields via the **field-source resolver**; emits trace + audit. Idempotent on `(process_code, box_id, idempotency_key)`. |
| `get_execution(public_id)` | Execution state + merged field values (resolved + entered) + last rule results. |
| `save_execution_data(public_id, {field_key: value}, actor)` | Validates field-level types; upserts `process_execution_data`; optimistic lock on `row_version`. |
| `evaluate(public_id)` | Runs the Validation Engine over merged data; returns rule results; persists snapshot on `process_execution_history` when called as part of a transition. |
| `perform_action(public_id, action_code, payload, actor)` | The single mutating entry point: finds the `process_transition` for `(current_status, action_code)`; checks `required_permission`; checks `guard`; runs blocking rules — abort with `422 workflow_validation_failed` if any blocking `error` fails; applies `to_status`; writes history + trace + audit atomically; fires side-effects via a **transition hook registry** (e.g. `on_enter:DEVIATION` → create deviation; `on_enter:MOVED_TO_RACK` → ask warehouse to create movement). |
| `list_executions(filter)` | Dashboard / worklist queries. |

### 10.3 Field-source resolver (`wf/resolvers.py`)
A registry mapping `source` → callable `(box, source_path) -> value`:
- `sap` → reads `sap.*` snapshot via `catalog` contract (e.g. `sap:po.ordered_qty`, `sap:material.model_no`).
- `dc` → `catalog.delivery_challan` / `_item` (`dc:titan_dc_no`, `dc:item.qty`).
- `qed` → `catalog.qed_audit` / `_item` (`qed:accepted_qty`, `qed:verdict`).
- `mail` → `catalog.mail_reference` (`mail:dispatch.external_ref`).
- `derived` → named functions (`derived:qty_difference`).
Resolvers never raise on missing data — they return `null` + a `resolution_note` so a rule can flag "missing DC".

### 10.4 Transition hook registry
`register_hook(process_code, trigger, fn)` where trigger ∈ `on_enter:<status>`, `on_exit:<status>`, `on_action:<code>`. MVP hooks:
- `P6 / on_enter:DEVIATION_RAISED` → `DeviationService.open(...)`.
- `P6 / on_action:COMPLETE_VERIFICATION` → `trace_event(DOCUMENT_VERIFIED)`.
- `P17 / on_enter:MOVED_TO_RACK` → `WarehouseService.create_movement(type=MOVE_TO_CBFC_RACK, ...)`.
- `P18 / on_enter:STORED` → `WarehouseService.map_rrb(...)` + `trace_event(STORED)`.
Hooks run inside the same transaction as the transition.

### 10.5 Why this design
- **No `if process == 6` anywhere** — frontend calls `GET /workflow/processes/6/definition` and renders; backend calls the same generic services.
- **Add a process by config** (section 41.4) — insert definition + fields + rules + doc reqs + statuses + transitions + role bindings + prerequisite rows → the process appears in the worklist and renders, no deploy.
- **Versioned** — editing a live process bumps `version`; in-flight executions keep their definition snapshot reference.

## 11. Dynamic Form Engine (frontend)

**Location:** `frontend/src/features/workflow/`.

### 11.1 Data contract
`GET /api/v1/workflow/processes/{code}/definition` →
```jsonc
{
  "processCode": "P6",
  "processName": "Refer DC Doc and Mail Reference Verification",
  "sequenceNo": 6,
  "entityType": "BOX",
  "fields": [
    { "key": "box_uid", "label": "Box UID", "dataType": "string", "uiComponent": "scanner-input",
      "source": "input", "required": true, "readOnly": false, "group": "Identify", "displayOrder": 10 },
    { "key": "sap_po_no", "label": "SAP PO No", "dataType": "string", "uiComponent": "text",
      "source": "sap", "sourcePath": "po.po_number", "readOnly": true, "group": "SAP", "displayOrder": 20 },
    { "key": "dc_qty", "label": "DC Qty", "dataType": "number", "source": "dc", "sourcePath": "item.qty",
      "readOnly": true, "group": "Delivery Challan", "displayOrder": 40 },
    { "key": "qed_accepted_qty", "label": "QED Accepted Qty", "dataType": "number", "source": "qed",
      "sourcePath": "accepted_qty", "readOnly": true, "group": "QED Audit", "displayOrder": 50 }
    /* ... */
  ],
  "documents": [
    { "documentTypeCode": "DELIVERY_CHALLAN", "required": true, "minCount": 1 },
    { "documentTypeCode": "QED_AUDIT_SHEET", "required": true, "minCount": 1 },
    { "documentTypeCode": "DISPATCH_MAIL", "required": false }
  ],
  "validationRules": [
    { "code": "DC_QTY_EQ_QED", "description": "DC qty must equal QED accepted qty",
      "severity": "error", "blocking": true, "message": "Delivery Challan quantity does not match QED accepted quantity" }
    /* expressions are evaluated server-side; frontend shows results only */
  ],
  "statuses": [
    { "code": "PENDING", "label": "Pending", "isInitial": true },
    { "code": "IN_REVIEW", "label": "In Review" },
    { "code": "DOCUMENT_VERIFIED", "label": "Verified", "isTerminal": true, "isSuccess": true },
    { "code": "DEVIATION_RAISED", "label": "Deviation" },
    { "code": "DEVIATION_RESOLVED", "label": "Deviation Resolved", "isTerminal": true, "isSuccess": true }
  ],
  "actions": [
    { "code": "START_REVIEW", "label": "Start Review", "fromStatus": "PENDING", "toStatus": "IN_REVIEW", "enabled": true },
    { "code": "COMPLETE_VERIFICATION", "label": "Complete Verification", "fromStatus": "IN_REVIEW",
      "toStatus": "DOCUMENT_VERIFIED", "requiredPermission": "process6:verify", "enabled": true },
    { "code": "RAISE_DEVIATION", "label": "Raise Deviation", "fromStatus": "IN_REVIEW",
      "toStatus": "DEVIATION_RAISED", "requiredPermission": "process6:verify", "enabled": true }
  ]
}
```

### 11.2 Components (extend the existing `components/ui/` library)
| Component | Role |
|---|---|
| `DynamicForm` | Takes a definition + execution; groups fields by `group`; orders by `displayOrder`; renders `DynamicField` per field; shows `ValidationResult`; renders action buttons from `actions` (disabled unless `enabled` && permission). |
| `DynamicField` | Switch on `uiComponent`: `text`, `number`, `date`, `select` (enumValues), `checkbox`, `textarea`, `scanner-input`, `reference-lookup`, `document-slot`. Read-only fields render as labelled values. |
| `ScannerInput` | See section 22. |
| `ConsolidatedPanel` | Read-only grouped view of all resolved SAP/DC/QED/mail fields side by side (the "one screen" from req §17). |
| `ValidationResult` | Lists rule results grouped by severity; red/amber/blue; blocking errors disable the primary action. |
| `DocumentSlot` / `DocumentList` / `DocumentViewer` | Upload against a `process_document_req`, list linked docs, preview PDFs/images. |
| `ProcessStatus` / `ProcessTimeline` | Current status chip + `process_execution_history` timeline. |
| `DeviationPanel` | Deviation type, expected/received, mark-in-DC toggle, mail-to-vendor action, vendor response capture, revised-DC upload + validate. |
| `LocationSelector` = `RackSelector` → `RowSelector` → `BinSelector` | Cascading selects fed by `/warehouse/*`; each accepts a scanned location QR. |
| `AuditTimeline` / `TraceabilityPanel` | Section 30. |

### 11.3 Rendering rules
- The form has **zero process-specific branches**. A `uiComponent` the frontend doesn't recognise falls back to `text` (forward-compatible).
- Field values = server-merged (`resolved` ⊕ `entered`); the form PATCHes only `source == input && editable` fields.
- Primary action calls `POST /workflow/executions/{id}/actions/{code}`; response returns the new state + rule results; the form re-renders from that.
- Screens are one route: `/(dashboard)/workflow/[processCode]` (worklist) and `/(dashboard)/workflow/[processCode]/[executionId]` (form).

## 12. Dynamic Validation Engine

**Location:** `wf/validation/`. Pure, deterministic, unit-testable, no DB access inside evaluators (data is passed in).

### 12.1 Rule model (`validation_rule.expression` JSONB)
```jsonc
// compare
{ "type": "compare", "left": "field:dc_qty", "op": "eq", "right": "field:qed_accepted_qty", "tolerance": 0 }
{ "type": "compare", "left": "field:sap_material_no", "op": "eq", "right": "field:qed_model_no" }
{ "type": "compare", "left": "field:received_qty", "op": "gte", "right": "field:dc_qty" }
// exists
{ "type": "exists", "target": "field:titan_dc_no" }
{ "type": "exists", "target": "document:DELIVERY_CHALLAN", "minCount": 1 }
{ "type": "exists", "target": "reference:box_uid" }            // box row exists in catalog
// prerequisite
{ "type": "prerequisite", "process": "P6", "status": "DOCUMENT_VERIFIED|DEVIATION_RESOLVED" }
// warehouse
{ "type": "location_available", "target": "field:dest_rack_id" }
{ "type": "bin_free", "target": "field:bin_id", "rule": "respect_occupancy" }
// composite
{ "type": "all_of", "rules": [ ... ] }   /  { "type": "any_of", "rules": [ ... ] }
// custom (named, registered function) — escape hatch, still config-selected
{ "type": "custom", "fn": "verdict_is_accepted" }
```
Operators: `eq, ne, gt, gte, lt, lte, in, not_in, contains, regex`.
Operand refs: `field:<key>`, `document:<typeCode>`, `reference:<name>`, `const:<value>`, `derived:<name>`.

### 12.2 Evaluation
```
evaluate(rules, context) -> [RuleResult{ code, severity, blocking, passed, message, actual, expected }]
```
- `context` = merged field values + document counts + prerequisite lookups (pre-fetched by the engine) + warehouse availability (pre-fetched).
- A missing operand → rule `passed=false` with `actual=null` (surfaces "missing DC/QED/mail").
- **Blocking behaviour:** `perform_action` refuses the transition if any result has `severity=error && blocking=true && passed=false`. `warning`/`info` never block; they're recorded and shown.
- All results are persisted to `process_execution_history.rule_results` on every transition attempt (audit of what was evaluated and why it passed/failed).

### 12.3 MVP rule set (exact expressions seeded — section 41)
- **P6:** `BOX_EXISTS`, `DC_LINKED`, `QED_LINKED`, `SAP_PO_LINKED`, `MAIL_REF_PRESENT` (warning), `DC_QTY_EQ_QED_ACCEPTED` (error/blocking), `SAP_MATERIAL_EQ_QED_MODEL` (error/blocking), `SAP_VENDOR_EQ_DC_VENDOR` (error/blocking), `DC_DOC_ATTACHED` (error/blocking), `QED_DOC_ATTACHED` (error/blocking), `VERDICT_ACCEPTED` (warning — rework/rejected still allowed to proceed to deviation).
  - **[OPEN-Q1]** Is `DC qty == QED accepted qty` the exact match rule, or `DC qty == QED inspected qty`, and what tolerance? Titan to confirm.
- **P17:** `P6_COMPLETED` (prerequisite, blocking), `BOX_NOT_ALREADY_STORED` (blocking), `DEST_RACK_ACTIVE` (blocking), `DEST_RACK_IN_CBFC` (blocking).
- **P18:** `P17_COMPLETED` (prerequisite, blocking), `BIN_BELONGS_TO_ROW_RACK` (blocking), `BIN_ACTIVE` (blocking), `BIN_OCCUPANCY_OK` (blocking, respects `bin.occupancy_rule`), `RRB_NOT_DUPLICATE` (blocking — same box not already mapped to same bin).

## 13. Document / File Architecture

- **Blobs:** MinIO (S3-compatible), on-prem container, bucket `ppcwim-documents`, server-side encryption at rest, versioned bucket off (we version in metadata). Object key: `docs/{document_type}/{yyyy}/{mm}/{public_id}/{version}-{safe_filename}`.
- **Metadata:** `doc.document`, `document_version`, `document_type`, `document_link` (section 9.5). **No blobs in Postgres.**
- **Upload flow:** `POST /api/v1/documents` (multipart) → validate mime/size against `document_type` → stream to MinIO → sha256 checksum → create `document` + `document_version` (v1) → optional async **scan hook** (`scan_status` starts `pending`; ClamAV container if Titan provides one, else `skipped`) → return `document.public_id`. Then `POST /documents/{id}/links` to attach to a box / execution / deviation.
- **New version:** `POST /documents/{id}/versions` → new `document_version`, `document.current_version_id` updated, old version retained (revised DC keeps the original).
- **Download:** `GET /documents/{id}/content` → RBAC check (`doc:download` + link-entity visibility) → short-lived presigned MinIO URL (5 min) or streamed through the API (config).
- **Linkage rule (req §41, §70):** every traceability-relevant document MUST have ≥1 `document_link`. `process_document_req` enforces required types at `perform_action` time.
- **Retention:** `document_type.retention_days`; a scheduled job marks eligible docs (never auto-hard-deletes audit-linked docs).
- **MVP document types seeded:** `DELIVERY_CHALLAN`, `JOB_CARD`, `QED_AUDIT_SHEET`, `DISPATCH_MAIL`, `INPUT_TO_POLISHING_MAIL`, `REVISED_DC`, `SAP_PRINTOUT`, `OTHER`.

## 14. SAP Integration Architecture

**Principle (req §18, §41, §63, §67):** SAP is external and its interface is unknown. Build the abstraction now; wire the real endpoint later via config only.

### 14.1 Provider interface (`sap/providers/base.py`)
```python
class SapProvider(Protocol):
    async def fetch_purchase_orders(self, since: datetime | None, filters: dict) -> list[RawPO]: ...
    async def fetch_delivery_challans(self, since, filters) -> list[RawDC]: ...
    async def fetch_materials(self, filters) -> list[RawMaterial]: ...
    async def fetch_vendors(self, filters) -> list[RawVendor]: ...
    async def fetch_batches(self, filters) -> list[RawBatch]: ...
    async def post_movement(self, req: MovementPostRequest) -> MovementPostResult: ...   # 101/321/313
```
Implementations:
- `MockSapProvider` — MVP default. Deterministic data derived from the sample values in `requirements.md` §8/§17/§32/§34 (Box `BX-260615-01`, PO `4500067891`, DC `3003064602` / `KRCC-144`, material `2777SAA02`, vendor `KALAI`, qty 74). Supports fault injection (`SAP_MOCK_FAULT=timeout|500|empty|slow`).
- `RestSapProvider` / `ODataSapProvider` / `RfcSapProvider` — skeletons; the concrete one is chosen by `SAP_PROVIDER` env. **All endpoint/auth/field details = `TITAN_SAP_*_TO_BE_CONFIRMED`.**

### 14.2 Config layer (`sap/config.py`, from env / secrets — never in code)
```
SAP_PROVIDER=mock                              # mock | rest | odata | rfc
SAP_BASE_URL=TITAN_SAP_API_ENDPOINT_TO_BE_CONFIRMED
SAP_ENV=TBC
SAP_AUTH_MODE=TBC                              # oauth2 | basic | x509 | saml-bearer
SAP_TIMEOUT_SECONDS=30
SAP_RETRY_MAX=3   SAP_RETRY_BACKOFF=2.0
SAP_TLS_VERIFY=true   SAP_TLS_CA_BUNDLE=/certs/titan-sap-ca.pem
SAP_CAN_POST=false                             # req §67-6: may we post to SAP, or assist only?
```
Field mapping lives in `sap.sap_field_mapping` (DB, admin-editable): `(object_type, app_field, sap_field, transform)`. The transform runs a small allow-listed expression (`upper`, `trim`, `date:%d-%m-%Y`, `strip_suffix:/R`, `lookup:<table>`).

### 14.3 Sync orchestration (`sap/sync.py`)
```
trigger (manual from SAP Upload screen | scheduled cron) 
  → create sap_sync_run(status=running, idempotency_key)
  → for each object_type: provider.fetch_* → map via sap_field_mapping → validate (pydantic RawX)
      → UPSERT into sap_* snapshot (append new row per pull; latest-per-key via view xr_sap_po_latest)
      → sap_request_log per call (request, response, http_status, duration, attempt, ok)
  → reconcile into catalog (vendor/material/PO/DC) — insert-or-update masters, never destructive
  → sap_sync_run(status=success|partial|failed, stats, finished_at)
  → trace/audit: SAP_SYNC_COMPLETED
```
- **Idempotency:** a sync run carries an `idempotency_key` (client-supplied or `hash(object_types+window)`); a duplicate within 10 min replays the prior run summary instead of re-pulling.
- **Errors:** `SAP unavailable` → run `failed`, screen shows last-good snapshot + retry; `timeout` → ret/backoff then `partial`; `invalid response` → row-level rejects recorded in `stats.rejected[]`, run `partial`.
- **Push (101/321/313):** MVP → `MockSapProvider.post_movement` writes `sap_movement_ref` (status `simulated`). Guarded by `SAP_CAN_POST`. Real posting is a later phase and needs `TITAN_SAP_MOVEMENT_CONTRACT_TO_BE_CONFIRMED`.

### 14.4 SAP data ownership (req §41)
`sap_*` = SAP-owned snapshot (read-only projections). `catalog.*` = reconciled working copy (may be corrected by Admin with audit). PPC-owned data (box_uid, links, workflow, deviation, location, audit) is never sourced from SAP.

## 15. SAP Upload Screen Behaviour

**Menu rename:** `nav.ts` `Production` → **`SAP Upload`**, `href` `/production` → `/sap-upload`, icon `Factory` → `DatabaseZap` (lucide). Route dir `frontend/src/app/(dashboard)/sap-upload/`. Keep a redirect `/production → /sap-upload` for one release.

**It is a SYNC console, not a file upload.** No `<input type=file>` for SAP data.

| Area | Behaviour | API |
|---|---|---|
| Header | "Pull from Titan SAP" button (perm `sap:sync`), object-type multiselect (PO / DC / Material / Vendor / Batch), optional date-from. Shows provider mode badge (`MOCK` in MVP). | `POST /api/v1/sap/sync-runs` |
| Sync runs table | Latest runs: id, trigger, object types, status, counts (fetched/created/updated/rejected), started/finished, duration. Auto-refresh while `running`. | `GET /api/v1/sap/sync-runs` |
| Run detail drawer | Per-object stats, `sap_request_log` entries (redacted), rejected-row reasons. | `GET /api/v1/sap/sync-runs/{id}` |
| Data browser tabs | Read-only paginated grids over the latest snapshot: **Purchase Orders**, **Delivery Challans** (with items), **Materials**, **Vendors**, **Batches**. Search by PO/DC/material/vendor. | `GET /api/v1/sap/purchase-orders` etc. |
| Empty state | Before first sync: `<EmptyState>` "No SAP data yet — run a pull to populate." | — |
| Errors | Banner on failed run with reason + retry; screen still renders last-good snapshot. | — |

Every sync writes `audit_log` (`actor`, `action=sap.sync`, `result`, `stats`) and a `trace_event` is emitted per box that gains/changes linked SAP data.

## 16. Process 6 Implementation

**Config, not code.** Everything below is seeded into `wf.*` (section 41.1) and executed by the generic engine.

### 16.1 Screen flow (`/workflow/P6` worklist → `/workflow/P6/{executionId}`)
1. **Identify** — operator scans Box UID (`ScannerInput`) or picks from the "Pending verification" worklist. → `POST /workflow/executions {processCode:"P6", boxUid}` → engine checks role (`PPC`/`QA`) + creates execution at `PENDING`, resolves SAP/DC/QED/mail fields.
2. **Consolidated view** — `ConsolidatedPanel` shows grouped read-only data: SAP (PO, material, vendor, qty), Titan DC + Vendor DC + DC qty + line items, QED (accepted/rework/verdict/inspector/trays), mail reference. Missing sources show "Not found — attach document / check SAP".
3. **Documents** — `DocumentList` shows required types (DELIVERY_CHALLAN, QED_AUDIT_SHEET) with upload slots; DISPATCH_MAIL optional.
4. **Start review** — action `START_REVIEW` → status `IN_REVIEW`.
5. **Validate** — `POST /workflow/executions/{id}/evaluate` → `ValidationResult` shows each rule: DC qty ↔ QED accepted qty, SAP material ↔ QED model, SAP vendor ↔ DC vendor, docs attached, verdict.
6. **Outcome:**
   - **Match / operator accepts** → action `COMPLETE_VERIFICATION` (perm `process6:verify`) → blocking rules must pass → status `DOCUMENT_VERIFIED` → `trace_event(DOCUMENT_VERIFIED)` → box `current_status=DOCUMENT_VERIFIED`.
   - **Mismatch** → action `RAISE_DEVIATION` → status `DEVIATION_RAISED` → hook opens a `deviation` (section 17).
7. Audit + history written on every transition.

### 16.2 APIs (all under gateway, JWT, perm-checked)
| Method | Endpoint | Perm | Notes |
|---|---|---|---|
| POST | `/workflow/executions` | `process6:execute` | body `{processCode, boxUid, idempotencyKey}` |
| GET | `/workflow/executions/{id}` | `process6:view` | merged data + last rule results |
| PATCH | `/workflow/executions/{id}/data` | `process6:execute` | input fields only, `row_version` |
| POST | `/workflow/executions/{id}/evaluate` | `process6:view` | non-mutating |
| POST | `/workflow/executions/{id}/actions/{code}` | per-transition | `START_REVIEW`, `COMPLETE_VERIFICATION`, `RAISE_DEVIATION` |
| GET | `/workflow/processes/P6/definition` | `process6:view` | drives the form |

### 16.3 DB writes
`process_execution`, `process_execution_data`, `process_execution_history`, `trace_event`, `audit_log`; `box.current_status`; on deviation → `deviation`, `deviation_event`.

### 16.4 Validation / errors
Blocking failures → `422 workflow_validation_failed` with `ruleResults`. Unknown Box UID → `404 box_not_found`. Box already verified → `409 already_completed` (idempotent replay returns the existing execution). Missing SAP data → non-blocking warning unless a blocking `exists` rule covers it.

### 16.5 Testing
Unit: each rule expression (pass/fail/missing-operand). Integration: full P6 happy path with mock SAP; mismatch→deviation path; missing-document block. RBAC: `STORE` role cannot execute P6. Idempotency: double `POST /executions` returns same id.

## 17. Deviation Implementation

**DFD sub-process A (req §11):** Mark in DC → Mail to Vendor → Vendor Response / Accept → Revised DC Validation → resolve.

### 17.1 State machine (`deviation.status`)
```
open ──mark_in_dc──► open(marked) ──mail_vendor──► mailed ──record_response──► vendor_responded
   vendor_responded ──accept──► accepted ──► (if revised DC required) revised_dc_pending ──upload+validate──► resolved
   vendor_responded ──reject──► rejected ──► (re-mail | escalate)
   accepted ──(no revised DC needed)──► resolved
```
Terminal `resolved` transitions the parent `process_execution` to `DEVIATION_RESOLVED` (success) via hook; `rejected` keeps it open for re-work.

### 17.2 Behaviour
- **Raise:** hook from P6 `RAISE_DEVIATION`. Operator picks `deviation_type` (shortage/excess/wrong_model/other), system pre-fills `expected_value` (DC/SAP qty or model) and `received_value` (QED/physical), computes `difference`.
- **Mark in DC:** `marked_in_dc=true` + `deviation_event(marked_in_dc)`; optionally annotate the DC document (new `document_version` of the DC with a note, or a linked `OTHER` doc). **[OPEN-Q2]** exact "mark in DC" artefact — physical stamp vs system flag vs annotated scan. Titan to confirm.
- **Mail to vendor:** `POST /deviations/{id}/mail` → `notification` module renders `DEVIATION_TO_VENDOR` template (box uid, DC, material, expected vs received, ask to confirm/accept) → SMTP send → `deviation_event(mailed_vendor, notification_id)`. Recipient list config **[OPEN-Q23]**.
- **Vendor response:** MVP captures manually — `POST /deviations/{id}/response {outcome: accepted|rejected, remarks, responseDocument?}` (operator transcribes the vendor's email reply and attaches it). Automated inbound mail parsing is out of scope.
- **Revised DC validation:** if accepted and a corrected DC is expected → status `revised_dc_pending` → `POST /deviations/{id}/revised-dc` uploads a `REVISED_DC` document → engine re-runs the P6 quantity/material rules against the revised values → pass → `resolved`.
- **Resolve:** `resolved_by`, `resolved_at`, `resolution_remarks`; parent execution → `DEVIATION_RESOLVED`; `trace_event(DEVIATION_RESOLVED)`.

### 17.3 APIs
`POST /deviations` (via hook), `GET /deviations/{id}`, `GET /deviations?status=&boxUid=`, `POST /deviations/{id}/mark-in-dc`, `POST /deviations/{id}/mail`, `POST /deviations/{id}/response`, `POST /deviations/{id}/revised-dc`, `POST /deviations/{id}/resolve`. Perms: `deviation:create|view|process|resolve`.

### 17.4 DB writes
`deviation`, `deviation_event` (append-only), `notif.notification`, `doc.document*` (revised DC), `process_execution_history`, `trace_event`, `audit_log`.

### 17.5 Testing
Shortage/excess/wrong-model raise; mail send (mock SMTP); vendor accept → resolve; vendor reject → stays open; revised DC re-validation pass/fail; audit completeness; RBAC (only PPC/QA process deviations).

## 18. Process 17 Implementation — Move to CBFC Rack

### 18.1 Screen flow (`/workflow/P17`)
1. Scan Box UID → `POST /workflow/executions {processCode:"P17", boxUid}`.
2. Engine prerequisite check: P6 execution for this box in `DOCUMENT_VERIFIED` or `DEVIATION_RESOLVED`, else `409 prerequisite_not_met`.
3. Screen shows current material/status/current location (should be none/CBSC).
4. Operator scans or selects **destination CBFC Rack** (`RackSelector`, filtered `zone.site='CBFC'`, accepts location QR).
5. `PATCH /data {dest_rack_id}` then action `CONFIRM_MOVE` (perm `movement:create`).
6. Blocking rules: `P6_COMPLETED`, `BOX_NOT_ALREADY_STORED`, `DEST_RACK_ACTIVE`, `DEST_RACK_IN_CBFC`.
7. On pass → status `MOVED_TO_RACK` → hook `WarehouseService.create_movement`:
   - insert `inventory_movement(type=MOVE_TO_CBFC_RACK, from_location_json=<current>, to_location_json={zone,rack}, execution_id, performed_by, performed_at, device_id, idempotency_key)`
   - upsert `box_location(zone_id, rack_id, row_id=NULL, bin_id=NULL)` + `box_location_history` row
   - `box.current_location_id = rack_id`, `box.current_status = MOVED_TO_RACK`
   - `trace_event(MOVED_TO_CBFC_RACK, from_location, to_location)` + `audit_log`.

### 18.2 APIs
Same generic workflow endpoints + `GET /warehouse/racks?site=CBFC`. Movement is created by the hook, not a separate client call (keeps it atomic + idempotent).

### 18.3 Rules / errors
`prerequisite_not_met` (P6), `box_already_stored` (409), `invalid_location` (rack inactive / not CBFC), duplicate confirm → idempotent (same `idempotency_key` returns the existing movement).

### 18.4 "Do not overwrite" guarantee
`box_location` current row is updated, but **every change writes `box_location_history` + `inventory_movement`** (both append-only, trigger-protected). A correction is a new `inventory_movement(type=CORRECTION, reverses_id=...)`, never an in-place edit.

### 18.5 Testing
Happy path; P6-incomplete block; move to non-CBFC rack block; already-stored block; double-submit idempotency; history + movement + trace rows all written; RBAC (`STORE` can, `QA` cannot).

## 19. Process 18 Implementation — Rack Row Bin Mapping

### 19.1 Screen flow (`/workflow/P18`)
1. Scan Box UID → `POST /workflow/executions {processCode:"P18", boxUid}`.
2. Prerequisite: P17 execution `MOVED_TO_RACK` for this box, else `409`.
3. `LocationSelector` cascade: **Rack** (default = the P17 rack) → **Row** (`GET /warehouse/racks/{id}/rows`) → **Bin** (`GET /warehouse/rows/{id}/bins`, each bin shows occupancy). Each level accepts a scanned location QR (`/scan/resolve` → `{level, refId}`).
4. `PATCH /data {rack_id, row_id, bin_id}` then action `CONFIRM_MAPPING` (perm `location:map`).
5. Blocking rules: `P17_COMPLETED`, `BIN_BELONGS_TO_ROW_RACK`, `BIN_ACTIVE`, `BIN_OCCUPANCY_OK` (respects `bin.occupancy_rule`: `single` → bin must be empty; `multi` → under `capacity_boxes`; `unlimited` → always ok), `RRB_NOT_DUPLICATE`.
6. On pass → status `STORED` → hook `WarehouseService.map_rrb`:
   - update `box_location(row_id, bin_id)` (row already had zone+rack from P17) + `box_location_history`
   - `inventory_movement(type=RRB_MAP, from_location_json={rack}, to_location_json={rack,row,bin}, execution_id, ...)`
   - `box.current_status = STORED`
   - `trace_event(RRB_MAPPED)` + `audit_log`
   - recompute `bin` occupancy projection.
7. Box is now searchable by exact Rack/Row/Bin.

### 19.2 APIs
Generic workflow endpoints + `GET /warehouse/racks/{id}/rows`, `GET /warehouse/rows/{id}/bins`, `POST /scan/resolve`.

### 19.3 Config-not-hardcoded guarantee
Rack/Row/Bin are `wh.*` master tables with full CRUD (`/warehouse/racks|rows|bins`, perm `warehouse:configure`, Admin/Store-lead). Location QRs in `location_qr`. Changing the warehouse layout = data edits; **no frontend change** (the cascade selects read the hierarchy live). `bin.occupancy_rule` + `capacity_boxes` make occupancy behaviour configurable per bin.

### 19.4 Errors
`prerequisite_not_met` (P17), `invalid_location` (bin not under selected row/rack, or inactive), `bin_occupied` (409, `single` rule), `bin_capacity_exceeded` (409), `duplicate_mapping` (idempotent replay).

### 19.5 Testing
Happy path; P17-incomplete block; bin-not-in-row block; occupied `single` bin block; `multi` bin under/over capacity; QR-scanned selection; duplicate confirm idempotency; history/movement/trace written; search by bin returns the box; RBAC.

## 20. Location / Rack / Row / Bin Model

```
storage_zone (site = CBFC | CBSC)
   └── rack            code unique per zone,  QR optional
        └── rack_row   code unique per rack,  display_order,  QR optional     [OPEN-Q17: is "Row" == "Shelf"?]
             └── bin    code unique per row,  capacity_boxes?, occupancy_rule (single|multi|unlimited), QR
```
- `location_qr(qr_value UNIQUE, level, ref_id, is_active)` — one scan resolves to exactly one node. QR value format **[OPEN-Q19]** — proposed `LOC-{ZONE}-{RACK}-{ROW}-{BIN}` but Titan to confirm.
- **Current location:** `box_location` (one row per box). **History:** `box_location_history` (append-only). **Movements:** `inventory_movement` (append-only, typed).
- `req §8` sample uses "Rack / Shelf / Bin" while `req §15` says "Rack / Row / Bin". This blueprint uses **Rack → Row → Bin** and treats "Shelf" as a synonym for "Row" pending **[OPEN-Q17]**.
- Occupancy dashboard + put-away suggestion read from a `xr_bin_occupancy` view; the suggestion function is a stub (`suggest_bin(box) -> bin?`) returning `null` in MVP (req §15 feature, not a P18 requirement).
- Capacity rules **[OPEN-Q18]** — default `occupancy_rule='multi'`, `capacity_boxes=NULL` (unlimited) until Titan confirms.

## 21. Barcode / Box UID Handling

- **Payload:** the White Box barcode contains **only the Box UID string** (e.g. `BX-260615-01`). Nothing else (req §7.1, §70).
- **Symbology:** Code128 (default) — configurable to Code39/DataMatrix per Titan printer/label spec **[OPEN-Q32/Q33]**. No business data, no delimiters, no JSON.
- **Format:** `BX-YYMMDD-NN` observed in samples. Treated as an opaque unique string; a soft regex `^BX-\d{6}-\d{2}$` produces a **warning only** (never rejects an unexpected-format UID) pending **[OPEN-Q9]** on generation ownership.
- **Generation ownership [OPEN-Q9]:** unclear whether vendor or Titan mints the UID. The app supports both: (a) **import** UIDs that arrive with QED/dispatch data (`catalog.box` created during SAP sync reconciliation or a box-import endpoint), (b) **mint + print** on demand (`POST /catalog/boxes` → allocate UID from a sequence + `POST /catalog/boxes/{uid}/label` → render Code128 PNG/ZPL for the DT48 printer).
- **Resolution:** `POST /api/v1/scan/resolve {value}` → if it matches a `box.box_uid` → returns box summary + linked SAP/DC/QED/document/status/location; if it matches `location_qr.qr_value` → returns location node; else `404 unresolved_scan` + audit.
- **Uniqueness:** `box.box_uid UNIQUE`; duplicate creation → `409 duplicate_box_uid` + `audit_log(result=failure)` (req §42).
- **Label reprint** never changes business data — the UID is stable; quantity/verdict/location changes are DB-only (req §7.2).
- **Traceability link:** the Box UID is the join key across `sap_*`, `catalog.*`, `wf.*`, `wh.*`, `doc.document_link`, `audit.trace_event`.

## 22. Scanner Integration

- **Default mode — HID / keyboard-wedge:** wireless (BS512) and Bluetooth scanners type the barcode + Enter into the focused field. `ScannerInput` component:
  - always-mounted, auto-focus, captures rapid keystrokes ending in Enter/Tab, debounces, strips CR/LF, then calls `onScan(value)`.
  - visible manual-entry fallback (operator PC without scanner).
  - distinguishes fast machine input (>x chars in <y ms) from human typing to auto-submit.
- **Display scanner (K8):** runs the Next.js app in its browser; same `ScannerInput`, plus the device's own scan button maps to Enter. No native SDK dependency.
- **Network/API scanner (future):** a `POST /api/v1/scan/events {deviceId, value, context}` gateway endpoint already exists for P17/P18 so a networked scanner can push scans; the workflow engine treats HID and API scans identically.
- **Decoupling:** the workflow engine consumes a resolved `boxUid` / `locationRef` — it never knows the scanner model. Adding a new device = a new transport into `/scan/resolve` or `ScannerInput`, no engine change (brief requirement).
- **Device identity:** `deviceId` (from a per-station config or a header `X-Device-Id`) is recorded on `inventory_movement.device_id` and `audit_log.source_device` (req §54).
- **Errors:** empty/garbled scan → inline "Scan not recognised, try again"; unresolved value → toast + `audit_log`; offline → queue the scan locally (frontend) and replay when the API is reachable (idempotency keys prevent dupes).
- **Testing:** simulate HID by dispatching synthetic `keydown` bursts; `/scan/resolve` contract tests for box UID / location QR / unknown; offline-queue replay test.

## 23. Authentication / RBAC

- **Authn:** reuse the existing JWT stack (Argon2id, HS256 dev / RS256 prod, 15-min access token, opaque rotating refresh token with reuse-detection, HttpOnly refresh cookie scoped to `/api/v1/auth`). No change to the crypto.
- **Configurable roles:** `auth.roles` table (seeded: `PPC`, `QA`, `STORE`, `CBFC`, `GATE_SECURITY`, `ADMIN` — names **[OPEN-Q15]**). A user has many roles (`user_roles`).
- **Action-based permissions:** `auth.permissions` (seeded, e.g. `sap:sync`, `sap:view`, `process6:execute`, `process6:verify`, `process6:view`, `deviation:create|process|resolve`, `movement:create`, `location:map`, `warehouse:configure`, `doc:upload|download`, `workflow:configure`, `audit:view`, `user:admin`). `role_permissions` maps them. Permission set **[OPEN-Q16]**.
- **Enforcement:** `require_permission("perm:code")` FastAPI dependency on every protected route **and** a re-check inside each service method (defense in depth — req §37, §70: "do not simply hide UI buttons"). The dynamic engine additionally checks `process_role.can_execute` and `process_transition.required_permission`.
- **Frontend:** `/whoami` returns roles + permissions; UI hides/disables actions the user lacks — but this is UX only; the server is authoritative.
- **Process-level access:** `process_role` binds roles to processes (PPC/QA → P6; STORE → P17/P18; ADMIN → all + config).
- **Audit:** login, logout, refresh, role change, permission change, config change → `audit_log` with actor + IP + request id.
- **Session on shared operator PCs:** short idle timeout (config, default 15 min) + explicit "switch user" — **[OPEN-Q]** confirm with Titan; shop-floor stations are often shared.

## 24. API Gateway

Implemented as a **FastAPI layer** (`app/gateway/`) in front of the module routers — the single entry point (req §19 L3, §40). Not a separate product for MVP; extractable to Kong/Traefik later.

Responsibilities (as middleware, in order):
1. **TLS termination** at Nginx; gateway assumes HTTPS, sets HSTS/CSP/nosniff/frame-deny (already in repo middleware).
2. **Correlation ID** — accept/echo `X-Request-ID`, generate if absent, bind to logging context + `audit_log.request_id`.
3. **Authn** — validate JWT, load user + roles + permissions into `request.state`.
4. **Authz** — route-declared `require_permission`.
5. **Request validation** — Pydantic schemas, `extra="forbid"`.
6. **Idempotency** — `Idempotency-Key` header on all POST/PATCH; `(key, route, user)` stored (Redis if up, else `wf`/`sap` idempotency columns) for 24h; replays stored response.
7. **Rate limiting** — token bucket per user/IP (Redis; fail-open with the existing circuit breaker) + Nginx `limit_req` outer guard. Scan endpoints get a higher bucket.
8. **Routing** — `/api/v1/{module}/...` → module router. Internal module-to-module calls go through the in-process registry, never back through HTTP in MVP.
9. **Error normalisation** — the repo's RFC-9457-style envelope for every 4xx/5xx; stack traces to logs only.
10. **Access log** — method, path, status, duration, user, request id, device id → structured JSON.

Field devices hit only `/api/v1/scan/*` and `/api/v1/workflow/*` through the gateway; `sap`, `documents` internals are not reachable from the OT VLAN (Nginx `allow`/`deny` by source + firewall).

## 25. API Contracts (MVP)

Base `/api/v1`. All JSON. All mutating calls accept `Idempotency-Key`. All responses carry `X-Request-ID`. Error envelope per `docs/api.md`.

### 25.1 Auth
| M | Endpoint | Perm | Req → Res | Errors |
|---|---|---|---|---|
| POST | `/auth/login` | — | `{username,password}` → `{accessToken, user}` + refresh cookie | 401 `invalid_credentials`, 429 |
| POST | `/auth/refresh` | cookie | — → `{accessToken}` | 401 `token_expired|token_reused` |
| POST | `/auth/logout` | auth | — → 204 | — |
| GET | `/whoami` | auth | → `{id, roles[], permissions[]}` | 401 |

### 25.2 SAP
| M | Endpoint | Perm | Notes |
|---|---|---|---|
| POST | `/sap/sync-runs` | `sap:sync` | `{objectTypes[], since?}` → `{id, status}`; idempotent 10-min window |
| GET | `/sap/sync-runs` | `sap:view` | paginated list |
| GET | `/sap/sync-runs/{id}` | `sap:view` | detail + request logs (redacted) |
| GET | `/sap/purchase-orders` `?search=&page=` | `sap:view` | latest snapshot |
| GET | `/sap/delivery-challans` | `sap:view` | + items |
| GET | `/sap/materials` / `/sap/vendors` / `/sap/batches` | `sap:view` | latest snapshot |
| GET | `/sap/field-mappings` / PUT `/sap/field-mappings/{id}` | `workflow:configure` | admin mapping editor |
| POST | `/sap/movements` | `sap:post` | 101/321/313 — **mock only**, guarded by `SAP_CAN_POST`; → `sap_movement_ref` |

*SAP endpoint URLs, auth, payloads to the real SAP = `TITAN_SAP_API_ENDPOINT_TO_BE_CONFIRMED`.*

### 25.3 Workflow (generic — serves P6/P17/P18 and future)
| M | Endpoint | Perm | Notes |
|---|---|---|---|
| GET | `/workflow/processes` | `workflow:view` | list active process definitions for the caller's roles |
| GET | `/workflow/processes/{code}/definition` | `{code}:view` | full metadata (fields, docs, rules, statuses, actions) |
| POST | `/workflow/executions` | `{code}:execute` | `{processCode, boxUid, idempotencyKey}` → execution; checks prerequisites |
| GET | `/workflow/executions/{id}` | `{code}:view` | merged data + last rule results + history |
| GET | `/workflow/executions?processCode=&status=&boxUid=&page=` | `{code}:view` | worklist |
| PATCH | `/workflow/executions/{id}/data` | `{code}:execute` | `{fields:{}, rowVersion}` — input fields only |
| POST | `/workflow/executions/{id}/evaluate` | `{code}:view` | non-mutating rule run |
| POST | `/workflow/executions/{id}/actions/{actionCode}` | per-transition | `{payload?, idempotencyKey}` → new state + ruleResults; 422 `workflow_validation_failed`, 409 `invalid_transition`, 409 `prerequisite_not_met` |
| GET | `/workflow/processes/{code}/config` / PUT (Admin) | `workflow:configure` | read/update definition (bumps `version`) |

### 25.4 Deviation
`POST /deviations` (hook), `GET /deviations`, `GET /deviations/{id}`, `POST /deviations/{id}/mark-in-dc`, `POST /deviations/{id}/mail`, `POST /deviations/{id}/response {outcome,remarks,documentId?}`, `POST /deviations/{id}/revised-dc {documentId}`, `POST /deviations/{id}/resolve {remarks}`. Perms `deviation:create|process|resolve`. Errors: 409 `invalid_deviation_state`, 422 `revised_dc_validation_failed`.

### 25.5 Documents
| M | Endpoint | Perm | Notes |
|---|---|---|---|
| POST | `/documents` (multipart) | `doc:upload` | `{documentTypeCode, title, file}` → `{publicId}`; 415 `unsupported_media_type`, 413 `payload_too_large` |
| POST | `/documents/{id}/versions` | `doc:upload` | new version |
| POST | `/documents/{id}/links` | `doc:upload` | `{entityType, entityPublicId, linkRole}` |
| GET | `/documents/{id}` | `doc:download` | metadata + versions |
| GET | `/documents/{id}/content` | `doc:download` | presigned URL or stream |
| GET | `/documents?entityType=&entityId=` | `doc:download` | list for an entity |

### 25.6 Warehouse
| M | Endpoint | Perm | Notes |
|---|---|---|---|
| GET/POST | `/warehouse/zones` | view / `warehouse:configure` | |
| GET/POST/PATCH | `/warehouse/racks` `?site=CBFC` | | |
| GET | `/warehouse/racks/{id}/rows` , POST `/warehouse/rows` | | |
| GET | `/warehouse/rows/{id}/bins` , POST `/warehouse/bins` | | bin shows occupancy |
| POST | `/warehouse/location-qrs` | `warehouse:configure` | mint QR for a node |
| GET | `/warehouse/boxes/{boxUid}/location` | `warehouse:view` | current + history |
| GET | `/warehouse/movements?boxUid=` | `warehouse:view` | movement ledger |
| GET | `/warehouse/occupancy?rackId=` | `warehouse:view` | dashboard feed |

*Movements for P17/P18 are created by workflow transition hooks, not by direct client POST — keeps them atomic + idempotent.*

### 25.7 Process 17 / 18
No dedicated endpoints — they are `processCode` `P17` / `P18` on the generic `/workflow/*` API. Only the warehouse **read** endpoints above are P17/P18-specific.

### 25.8 Scan
| M | Endpoint | Perm | Notes |
|---|---|---|---|
| POST | `/scan/resolve` | `scan:use` | `{value, context?}` → `{kind:"box"|"location"|"unknown", ...payload}` |
| POST | `/scan/events` | `scan:use` | networked-scanner push; `{deviceId, value, context}` |

### 25.9 Audit / Traceability
| M | Endpoint | Perm | Notes |
|---|---|---|---|
| GET | `/audit/logs?entityType=&entityId=&actor=&from=&to=&page=` | `audit:view` | filtered audit log |
| GET | `/trace/boxes/{boxUid}` | `trace:view` | full lineage: SAP refs, DC, vendor, material, QED, documents, executions, deviations, movements, current location, status |
| GET | `/trace/boxes/{boxUid}/timeline` | `trace:view` | ordered `trace_event` list |
| GET | `/trace/search?q=&by=boxUid|material|model|vendor|dc|po|rack|row|bin|status&page=` | `trace:view` | dashboard search |

### 25.10 Dashboard
`GET /dashboard/summary` → `{pendingVerification, openDeviations, boxesInCbsc, boxesStored, syncStatus}`. `GET /dashboard/pending-verification`, `/dashboard/deviations`, `/dashboard/storage-status`.

## 26. Frontend Architecture

> **[NOTE — see §0 Architecture Mandate]** Frontend structure is unaffected, but every `api.ts` now targets the **API Gateway**, which fans out to the individual services; there is no single backend OpenAPI document — the gateway aggregates per-service schemas.

- **Next.js 15 App Router** (existing). Route groups: `(auth)`, `(dashboard)`.
- **New routes:** `(dashboard)/sap-upload`, `(dashboard)/workflow/[processCode]`, `(dashboard)/workflow/[processCode]/[executionId]`, `(dashboard)/deviations`, `(dashboard)/deviations/[id]`, `(dashboard)/warehouse` (config), `(dashboard)/trace`, `(dashboard)/trace/[boxUid]`, `(dashboard)/admin/processes` (engine config), `(dashboard)/admin/users`.
- **Feature folders:** `src/features/{sap,workflow,deviation,documents,warehouse,trace,admin}/` each with `api.ts` (typed client), `hooks.ts` (TanStack Query), `components/`, `types.ts`.
- **Typed API:** CI regenerates `frontend/src/lib/api/schema.d.ts` from backend OpenAPI (existing pipeline); all feature `api.ts` typed against it.
- **State:** server state via TanStack Query; auth via the existing zustand store seeded from the RSC session; no Redux.
- **Dynamic rendering:** `DynamicForm` (section 11) is the only "screen" for P6/P17/P18. Worklists use the existing `DataTable`. `nav.ts` updated (SAP Upload; add Workflow, Deviations, Traceability; Warehouse + Admin under a config group / user menu).
- **Design system:** reuse the TITAN teal Tailwind v4 tokens + `components/ui/` library already in the repo; add the components listed in §11.2.
- **Offline resilience:** `ScannerInput` + a small mutation queue for scan/confirm actions on flaky OT Wi-Fi; replays with idempotency keys.
- **Auth strings** unchanged ("Email"/"Password"/"Sign in"/"Your projects") to keep existing e2e tests green.
- **Keep it dynamic:** no hard-coded process fields, rack lists, or validation messages in TSX (brief mandate).

## 27. Backend Architecture

> **[SUPERSEDED IN PART by §0 — Architecture Mandate]** The single `backend/app/` tree with `modules/<name>/` and an **in-process service registry** (`registry.get(WorkflowService)`) is overridden. Each service is its own deployable under `services/<name>/` with its own database; inter-service calls are HTTP/gRPC clients or events, not `registry.get(...)`. `contracts.py` survives as the network interface. See §0.4.

- **FastAPI** (existing), Python 3.12, async SQLAlchemy 2.0 + asyncpg, Pydantic v2, Alembic.
- **Layout:**
```
backend/app/
  gateway/            middleware: request-id, authn, authz, idempotency, rate-limit, errors, access-log
  core/               config, security, rbac, registry (in-process service locator), metrics, logging
  db/                 base (mixins), session (rw/ro engines), seed/
  modules/
    identity/         models.py schemas.py repository.py service.py router.py contracts.py
    sap/              + providers/{base,mock,rest,odata,rfc}.py  sync.py  mapping.py
    catalog/          reconcile.py  barcode.py
    workflow/         engine/{definition,execution,resolvers,hooks}.py  validation/{model,evaluate,operators}.py  router.py
    documents/        storage/{minio,fs}.py
    warehouse/        service.py (movements, rrb, occupancy)  putaway.py (stub)
    audit/            sink.py  trace.py
    notification/     smtp.py  templates/
  workers/            scheduler tasks: sap scheduled sync, doc retention, notification retry
  scripts/            generate_openapi.py, seed_processes.py
```
- **Module boundary rule:** `modules/X` may import from `core`, `db`, and `modules/Y/contracts.py` only — enforced by an import-linter contract in CI.
- **Service registry:** `registry.bind(WorkflowService, WorkflowServiceImpl)`; callers `registry.get(WorkflowService)`. Swap to HTTP client later = one line.
- **Transactions:** one `async with uow()` per use-case; hooks run inside it.
- **Idempotency:** decorator `@idempotent(scope="sap_sync")` reading the `Idempotency-Key`.
- **Config:** `Settings` (pydantic-settings) from env; `validate_production()` aborts boot on placeholder secrets (existing pattern) — extended to assert `SAP_PROVIDER != mock` warning in prod, MinIO creds present, SMTP configured.
- **Observability:** structured JSON logs with request id; Prometheus `/metrics` (existing); per-module counters (sap_sync_total, workflow_transitions_total, validation_failures_total, movements_total).

## 28. Repository / Project Structure

> **[SUPERSEDED IN PART by §0 — Architecture Mandate]** `backend/app/modules/<name>/` is replaced by top-level **`services/<name>/`**, each an independent deployable with its own `Dockerfile`, `alembic/`, database, and CI job. The monorepo layout is kept; the single `backend` app is not. See §0.4.

Monorepo (existing single repo). Add:
```
PPC/
  frontend/                     (existing Next.js app — add feature folders + routes)
  backend/                      (existing FastAPI app — add modules/ tree above)
  packages/
    contracts/                  OpenAPI-derived TS types (generated) + shared JSON-schema for rule expressions
  infrastructure/
    nginx/  postgres/  redis/  minio/            <- add minio/
    monitoring/
  docs/
    BLUEPRINT.md (this)  api.md  database.md  security.md  deployment.md  observability.md
    sap-integration.md  (new — provider contract + TITAN inputs needed)
    workflow-engine.md  (new — how to add a process)
    uat/  (new — UAT scripts)
  docker-compose.yml            (dev: + minio)
  docker-compose.prod.yml       (on-prem: + minio, no published DB/redis ports)
  Makefile                      (migration/migrate/seed/seed-processes/test/openapi)
```
Services stay independently maintainable via the module boundary + contracts + registry; a module can later move to `services/<name>/` with its own Dockerfile without touching callers.

## 29. Database Migration Strategy

> **[SUPERSEDED by §0 — Architecture Mandate]** There is no single Alembic head and no `CREATE SCHEMA auth, sap, …` migration. **Each service keeps its own independent Alembic history against its own database.** Expand/contract discipline still applies per service. See §0.4.

- **Alembic**, one head, `alembic check` in CI against models (existing convention).
- **Schema creation migration first:** `CREATE SCHEMA auth, sap, catalog, wf, doc, wh, audit, notif;` + `uuidv7()` function + append-only trigger function.
- **One revision per module feature**, named `<module>_<feature>` (e.g. `wf_process_definitions`, `wh_location_hierarchy`).
- **Expand/contract only:** add nullable → backfill task → enforce not-null in a later revision. No destructive column drops in the same release they're deprecated.
- **Data migrations** (seeding roles/permissions/document-types/process-config) live in **idempotent seed scripts** (`app/db/seed/`), not Alembic — run via `make seed && make seed-processes`, safe to re-run.
- **Process config versioning:** editing a live process is an `UPDATE` that bumps `process_definition.version`; a nightly export (`scripts/dump_process_config.py`) writes the current config to `docs/process-config/*.json` for review/PR diffing.
- **Rollout:** migration job runs before new app containers scale up (deployment §34); migrations backward-compatible so old+new pods coexist.
- **Backup before migrate** in prod (pre-deploy `pg_dump` snapshot, §34 checklist).

## 30. Audit / Traceability Architecture

- **Two sinks:**
  - `audit.audit_log` — every significant action (who/role/action/entity/process/prev→new/request-id/device/result/remarks/ts). Written by an `AuditSink` called from every service mutation + gateway (auth events). Append-only (trigger-protected). Retention **[OPEN-Q28]** (default 7 years, configurable).
  - `audit.trace_event` — box-centric business timeline (event_code, process_code, actor, summary, from/to status, from/to location, sap_ref, ts). Written by workflow hooks + sap sync + warehouse movements.
- **Traceability API** (`/trace/boxes/{boxUid}`) assembles, read-only, across modules via contracts:
  - Origin: vendor, Titan DC, Vendor DC, SAP PO, material/model/part, batch/lot.
  - Quantities: DC qty, QED inspected/accepted/rework, verdict.
  - Verification: P6 execution, rule results, who verified, when.
  - Deviation: type, expected vs received, vendor response, who resolved.
  - Movement: P17 movement (from→to, when, who, device), P18 RRB (rack/row/bin, when, who).
  - Current: status, exact location, all linked documents.
- **Timeline** (`/trace/boxes/{boxUid}/timeline`) → ordered `trace_event` feed → `TraceabilityPanel` + `AuditTimeline` components.
- **Search** (`/trace/search`) indexes box_uid, material_no, model_no, vendor, titan_dc_no, vendor_dc_no, po_number, rack/row/bin codes, status (req §55).
- **No silent overwrite:** location, status, deviation, verification changes always append history; corrections are typed reversing entries (req §54, §70).

## 31. Error Handling

- **Envelope:** RFC-9457-style `{error:{code,message,details,request_id,status}}` for every 4xx/5xx (existing `docs/api.md`).
- **Operator-facing vs log:** `message` is operator-readable and actionable; technical detail (stack, SAP raw response, SQL) goes to structured logs + `sap_request_log` / `audit_log` only.
- **Catalogue (req §43):**

| Condition | HTTP / code | Operator message | System action |
|---|---|---|---|
| Missing / unknown Box UID | 404 `box_not_found` | "Box UID not recognised. Check the label or run SAP sync." | audit(failure) |
| Duplicate Box UID create | 409 `duplicate_box_uid` | "This Box UID already exists." | audit(failure) |
| Missing DC / PO / QED / mail | 422 rule result (blocking or warning) | "Delivery Challan not linked to this box." | rule_results persisted |
| DC/PO/material/model mismatch | 422 `workflow_validation_failed` | per-rule message | history snapshot |
| Quantity shortage / excess / wrong model | 200 + deviation path | "Quantity mismatch — raise deviation?" | deviation created on action |
| Unauthorized action | 403 `forbidden` / `insufficient_permission` | "You don't have permission for this action." | audit |
| Prerequisite not met (P17 without P6, P18 without P17) | 409 `prerequisite_not_met` | "Complete Process 6 verification first." | — |
| Duplicate movement / mapping | 200 (idempotent replay) or 409 `duplicate_movement` | "This box is already moved / mapped." | return existing txn |
| Bin occupied / capacity exceeded | 409 `bin_occupied` / `bin_capacity_exceeded` | "Bin BIN-07 is full — choose another." | — |
| Invalid rack/row/bin | 422 `invalid_location` | "Selected bin is not in the chosen row." | — |
| SAP unavailable / timeout | 502 `sap_unavailable` / 504 `sap_timeout` (sync run `failed`/`partial`) | "SAP is not responding. Showing last synced data. Retry later." | retry w/ backoff, run status |
| SAP invalid response | sync `partial` | "Some SAP records could not be read." | rejected rows in `stats` |
| SAP posting failure | `sap_movement_ref.status=failed` | "SAP posting failed — see SAP log." | audit + retry option |
| Document upload failure | 502 `storage_unavailable` / 413 / 415 | "Upload failed — file too large / wrong type / storage offline." | no metadata row created |
| DB failure | 500 `internal_error` | "Something went wrong. Your action was not saved." | alert, transaction rolled back |
| Network failure (client) | — | offline banner + queued action | replay w/ idempotency key |
| Scanner invalid input | — (client) | "Scan not recognised." | audit if it reached `/scan/resolve` |

- **Global handler** maps unhandled exceptions to `500 internal_error` (generic message), logs full context, increments an alert metric.

## 32. Idempotency

- **`Idempotency-Key` header** required on every POST/PATCH; missing key on a mutating call → the gateway generates one (per-request) so at least intra-request retries are safe, and logs a warning.
- **Store:** Redis `(key,route,user) → {status, body}` TTL 24h when Redis is up; **durable fallback** columns `idempotency_key UNIQUE` on `sap_sync_run`, `process_execution`, `inventory_movement`, `notification`, and a `wf.idempotency_record` table for generic actions.
- **Semantics:** first call executes + stores the response; a replay within TTL returns the **stored response** (same status code) without re-executing.
- **Protected operations (req §42):**
  - SAP sync — dedupe window 10 min on `hash(objectTypes+since)` even without a client key.
  - `POST /workflow/executions` — `(processCode, boxId)` returns the existing open execution.
  - `perform_action` (COMPLETE_VERIFICATION, CONFIRM_MOVE, CONFIRM_MAPPING) — `(executionId, actionCode)` unique; replay returns the post-transition state.
  - Movement / RRB creation — `inventory_movement.idempotency_key` unique; DB rejects the second insert, service returns the first row.
  - Document upload — checksum + `(document_type, checksum, uploader, 5-min window)` → returns existing document.
  - Deviation mail — `(deviationId, 'mail', hour-bucket)` prevents duplicate vendor emails on double-click.
- **Rejected duplicates are audited** (`audit_log(result=failure, remarks='idempotent replay'/'duplicate blocked')`) per req §42.

## 33. Security

- **Deployment:** on-prem only, Titan VLAN, firewall; OT scanner subnet can reach only Nginx :443 → `/api/v1/scan/*` and `/api/v1/workflow/*`. `sap`, `documents`, `admin` routes restricted by source IP (Nginx `allow/deny`) + permission.
- **Transport:** TLS 1.2+ everywhere (internal too); HSTS, CSP, `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy` (Nginx + FastAPI middleware — existing).
- **Authn/Authz:** §23. JWT RS256 in prod; refresh rotation + reuse detection; Argon2id.
- **Secrets:** never in Git; `.env` git-ignored; on-prem secret store = Docker secrets / HashiCorp Vault (Titan choice **[OPEN-Q]**). SAP credentials + mail credentials + MinIO keys + JWT signing key injected at runtime. `validate_production()` blocks boot on placeholders. SAP credential confidentiality is a Titan NDA requirement (req §37).
- **Input/output:** Pydantic `extra="forbid"`; SQLAlchemy parameterized only; React auto-escapes, `dangerouslySetInnerHTML` lint-banned; upload size/type caps at Nginx + FastAPI; presigned MinIO URLs short-lived.
- **Audit:** all security events → `audit_log` (§30).
- **Abuse protection:** login lockout per (user, ip); global rate limit; Nginx `limit_req`/`limit_conn`.
- **Dependency + image scanning:** `pip-audit`, `npm audit`, Trivy on images — fail CI on HIGH/CRITICAL (existing).
- **VAPT:** Titan-conducted vulnerability testing is in scope (req §37, §49); provide a pre-VAPT checklist + fix SLA. Standards/tools **[OPEN-Q29]**.
- **Data:** no data leaves Titan network; no external analytics/telemetry; Sentry (if used) self-hosted on-prem or disabled.
- **PII:** minimal (operator names). Audit retention policy documented **[OPEN-Q28]**.

## 34. Deployment Architecture (On-Premise)

> **[SUPERSEDED IN PART by §0 — Architecture Mandate]** The single `api` container + single `postgres` container is overridden: the Compose/on-prem topology gains **one service container + one database per business service** (Auth, SAP Integration, Workflow, Document, Warehouse, Audit, Notification) behind the gateway. `minio` stays shared for blobs; `redis`/event bus backs the outbox. See §0.4.

**Target:** single Titan VM (or 2 for HA) running Docker Compose. No public cloud (req §19, §61).

```
                 Titan LAN / OT VLAN
                        │  :443
                 ┌──────▼───────┐
                 │    nginx     │  TLS, headers, rate-limit, source ACLs, static
                 └───┬──────┬───┘
            :3000 ┌──▼──┐ ┌─▼────┐ :8000
                  │ web │ │ api  │  (FastAPI, gunicorn+uvicorn workers, replicas=2)
                  └─────┘ └─┬──┬─┘
                    ┌───────┘  └────────┐
              ┌─────▼─────┐      ┌──────▼──────┐
              │ postgres  │      │   minio     │   (internal network only, no published ports)
              │  16       │      │  (docs)     │
              └───────────┘      └─────────────┘
              ┌───────────┐  ┌───────────┐  ┌───────────┐
              │  redis    │  │  worker   │  │  beat     │  (scheduled SAP sync, retention, retries)
              └───────────┘  └───────────┘  └───────────┘
              (optional)      celery/APScheduler          exactly 1
```

- **Images:** `frontend`, `backend` built in CI, pushed to Titan's internal registry (or `docker save`/`load` if air-gapped).
- **`docker-compose.prod.yml`:** extend existing — add `minio` + `minio-init` (bucket create), keep postgres/redis internal-only, `backend`/`frontend` `deploy.replicas`, `worker` scalable, `beat` = 1.
- **Config:** `.env.prod` from Titan secret store / Docker secrets; `validate_production()` gate.
- **TLS:** Titan-issued internal CA cert mounted into nginx; SAP CA bundle mounted into backend.
- **Migrations:** `docker compose run --rm backend alembic upgrade head` as a pre-deploy step, gated before new containers start; `make seed && make seed-processes` on first deploy.
- **Backup:** nightly `pg_dump` + WAL archiving (`wal-g` or `pgbackrest`) to a Titan NAS; MinIO `mc mirror` nightly to NAS; retention 30 days (**[OPEN-Q27]**). Restore drill documented + rehearsed at UAT.
- **Health:** `/healthz` (liveness), `/readyz` (DB + MinIO + Redis check); nginx passive health-check retries next upstream.
- **Monitoring:** Prometheus + Grafana (existing `infrastructure/monitoring/`) on-prem; alerts on sync failure rate, 5xx rate, DB connections, disk. Loki/promtail for logs (optional).
- **Zero-downtime:** `docker compose up -d --no-deps --scale backend=4` rolling; backward-compatible migrations.
- **DR:** RPO 5 min (WAL), RTO 1h documented in a runbook; second VM as warm standby (streaming replication) if Titan provides it.

## 35. Development Phases

For each: **Objective · Backend · Frontend · Database · APIs · Dependencies · Deliverables · Acceptance · Testing.**

### PHASE 0 — Requirement / Knowledge Validation (1 wk)
- **Objective:** close blocking unknowns before code.
- **Backend/Frontend/DB:** none.
- **Deliverables:** signed-off answers (or interim decisions) to the §42 open-questions list, especially SAP interface (Q1–Q9), roles/permissions (Q15/Q16), RRB hierarchy (Q17–Q19), P6/P17/P18 acceptance boundaries (Q40); confirmed process-config spec for P6/P17/P18; sample data pack (real DC/QED/dispatch mail) for the mock provider + UAT.
- **Acceptance:** Titan sign-off on the MVP scope + open-question register.
- **Testing:** n/a.

### PHASE 1 — Architecture & Repo Setup (1 wk)
- **Objective:** module skeleton, gateway, CI, import-linter, OpenAPI→TS pipeline, Compose with MinIO.
- **Backend:** `gateway/` middleware (request-id, authn, authz, idempotency, rate-limit, errors), `core/registry`, module folders with empty `contracts.py`, import-linter contract in CI.
- **Frontend:** feature-folder scaffold, typed api-client wiring, `nav.ts` updated (SAP Upload rename + redirect), route stubs.
- **DB:** schema-creation migration (`auth,sap,catalog,wf,doc,wh,audit,notif`), `uuidv7()`, append-only trigger fn.
- **APIs:** `/healthz`, `/readyz`, `/whoami` extended.
- **Dependencies:** Phase 0.
- **Deliverables:** green CI, `docker compose up` brings up web+api+pg+redis+minio, module-boundary lint passing.
- **Acceptance:** a dummy endpoint in one module cannot import another module's internals (CI proves it).
- **Testing:** CI smoke, middleware unit tests.

### PHASE 2 — Database Foundation (1 wk)
- **Objective:** all MVP tables + mixins + indexes + constraints + seed framework.
- **Backend:** `db/base` mixins (id/public_id/timestamps/actor/row_version/soft-delete), `session` rw/ro, `AuditSink` stub.
- **DB:** migrations for every table in §9; append-only triggers on immutable tables; seed scripts for roles/permissions/document-types + sample location hierarchy (flagged).
- **APIs:** none (repositories only).
- **Dependencies:** Phase 1.
- **Deliverables:** `alembic upgrade head` + `alembic check` clean; `make seed` idempotent.
- **Acceptance:** ERD in `docs/database.md` matches migrations; re-running seed is a no-op.
- **Testing:** migration up/down; trigger rejects UPDATE on `audit_log`; unique constraints; repository CRUD tests.

### PHASE 3 — Authentication / RBAC (1 wk)
- **Objective:** configurable roles + action permissions + enforcement everywhere.
- **Backend:** `identity` module — roles/permissions/user_roles, `require_permission`, service-level re-check, `/whoami` returns roles+permissions; audit auth events.
- **Frontend:** permission-aware nav + action gating; user/role admin screen (`/admin/users`).
- **DB:** seed the MVP role→permission matrix (interim per Q15/Q16).
- **APIs:** `/auth/*` (existing), `/users`, `/roles`, `/permissions`.
- **Dependencies:** Phase 2.
- **Deliverables:** every subsequent endpoint uses `require_permission`.
- **Acceptance:** a `STORE` user is 403 on `process6:verify`; an `ADMIN` can assign roles; all enforced server-side (UI-hidden ≠ secure).
- **Testing:** RBAC matrix tests (role × endpoint), negative auth, token reuse.

### PHASE 4 — SAP Integration (1.5 wk)
- **Objective:** provider interface + mock + sync orchestration + snapshot + mapping + logging + idempotency.
- **Backend:** `sap` module — `SapProvider` protocol, `MockSapProvider` (sample data + fault injection), `sync.py`, `mapping.py`, `sap_request_log`, reconcile into `catalog` (vendor/material/PO/DC), scheduled-sync task.
- **Frontend:** none yet (Phase 5).
- **DB:** `sap_*` tables + `sap_field_mapping` seed; `catalog` masters.
- **APIs:** `POST/GET /sap/sync-runs`, `GET /sap/{purchase-orders,delivery-challans,materials,vendors,batches}`, `GET/PUT /sap/field-mappings`.
- **Dependencies:** Phase 2/3; Phase 0 SAP answers (else stay mock).
- **Deliverables:** a sync run pulls mock data, populates snapshots + catalog, logs every call, is idempotent.
- **Acceptance:** running sync twice in 10 min replays; `timeout` fault → run `partial` + retry; rejected rows recorded.
- **Testing:** provider contract tests, mapping transform tests, sync integration (success/partial/failed), idempotency, reconcile correctness.

### PHASE 5 — SAP Upload UI (0.5 wk)
- **Objective:** the renamed screen as a sync console + data browser.
- **Frontend:** `(dashboard)/sap-upload` — trigger, sync-runs table (auto-refresh), run-detail drawer, data browser tabs, empty/error states.
- **Backend:** dashboard feed for sync status.
- **APIs:** consumes Phase 4.
- **Dependencies:** Phase 4.
- **Deliverables:** operator can pull SAP data and browse PO/DC/material/vendor/batch.
- **Acceptance:** menu shows "SAP Upload"; `/production` redirects; no file-upload control for SAP data; last-good snapshot shows on failure.
- **Testing:** component tests, E2E "trigger sync → see rows".

### PHASE 6 — Document / File Service (1 wk)
- **Objective:** MinIO blob + metadata + versioning + linkage + RBAC.
- **Backend:** `documents` module — MinIO client, upload/version/link/download, checksum, scan hook (skip if no ClamAV), `document_type` enforcement.
- **Frontend:** `DocumentSlot`, `DocumentList`, `DocumentViewer` components.
- **DB:** `doc.*` tables + `document_type` seed.
- **APIs:** §25.5.
- **Dependencies:** Phase 2/3.
- **Deliverables:** upload a DC PDF, link to a box, download via presigned URL, upload v2.
- **Acceptance:** blobs in MinIO not Postgres; wrong mime → 415; oversize → 413; download requires `doc:download` + entity visibility.
- **Testing:** upload/version/link/download, RBAC, mime/size rejection, checksum dedupe.

### PHASE 7 — Dynamic Workflow Engine (2 wk)
- **Objective:** generic engine — definitions, executions, resolvers, validation, transitions, hooks.
- **Backend:** `workflow` module — definition service (+cache), `start_execution`, `save_execution_data`, `evaluate`, `perform_action`, field-source resolvers, transition-hook registry, `validation/` (model + evaluators + operators).
- **Frontend:** `DynamicForm`, `DynamicField`, `ConsolidatedPanel`, `ValidationResult`, `ProcessStatus`, `ProcessTimeline`; routes `/workflow/[processCode][/executionId]`.
- **DB:** `wf.*` config + runtime tables; `seed_processes.py` framework.
- **APIs:** §25.3 (generic).
- **Dependencies:** Phase 2–6.
- **Deliverables:** a **test process** ("P0-DEMO") fully configured in seed renders + executes + validates + transitions with zero process-specific code.
- **Acceptance:** adding P0-DEMO is data-only; frontend has no `if processCode ===` branch; unknown `uiComponent` falls back to text.
- **Testing:** definition serialization, resolver registry, each operator, blocking vs non-blocking, transition guards, prerequisite enforcement, hook execution in-transaction, optimistic-lock conflict.

### PHASE 8 — Process 6 (1.5 wk)
- **Objective:** P6 + consolidated verification, configured on the engine.
- **Backend:** seed P6 definition/fields/rules/docs/statuses/transitions/roles/prereqs (§41.1); resolvers for SAP/DC/QED/mail; `catalog` reconcile of QED audit + mail reference; box registration/import.
- **Frontend:** P6 worklist + form (mostly `DynamicForm`); `ConsolidatedPanel` polish.
- **DB:** `catalog.qed_audit*`, `mail_reference`, `box`.
- **APIs:** generic workflow + `/catalog/boxes`, `/catalog/qed-audits`.
- **Dependencies:** Phase 7.
- **Deliverables:** scan Box UID → see SAP+DC+QED+mail → validate → COMPLETE_VERIFICATION or RAISE_DEVIATION.
- **Acceptance:** §66 P6 criteria; mismatch blocks completion; verification persisted; audit + trace written.
- **Testing:** happy path w/ mock SAP, each mismatch type, missing doc block, RBAC, idempotency.

### PHASE 9 — Deviation Sub-Flow (1 wk)
- **Objective:** DFD sub-process A.
- **Backend:** `deviation` state machine, hooks from P6, `notification` SMTP (mock in dev), revised-DC re-validation.
- **Frontend:** `DeviationPanel`, `/deviations` list + detail.
- **DB:** `wf.deviation`, `deviation_event`, `notif.*`.
- **APIs:** §25.4.
- **Dependencies:** Phase 8, Phase 6.
- **Deliverables:** raise → mark-in-DC → mail vendor → capture response → accept → revised DC → resolve → P6 `DEVIATION_RESOLVED`.
- **Acceptance:** §11 loop reproduced; mail recorded with `notification_id`; reject keeps deviation open; full audit.
- **Testing:** all three deviation types, mail send (mock), accept/reject, revised-DC pass/fail, audit completeness.

### PHASE 10 — Warehouse / Location Service (1 wk)
- **Objective:** location hierarchy master + QR + occupancy + movement primitives.
- **Backend:** `warehouse` module — zone/rack/row/bin CRUD, `location_qr`, `create_movement`, `map_rrb`, occupancy view, put-away stub.
- **Frontend:** `/warehouse` config screens, `RackSelector`/`RowSelector`/`BinSelector`, `LocationSelector`.
- **DB:** `wh.*`.
- **APIs:** §25.6.
- **Dependencies:** Phase 2/3.
- **Deliverables:** Admin builds CBFC→Rack→Row→Bin; mints QRs; occupancy visible.
- **Acceptance:** hierarchy fully data-driven; changing layout needs no frontend change; QR resolves to one node.
- **Testing:** CRUD, hierarchy integrity, QR uniqueness/resolution, occupancy calc.

### PHASE 11 — Process 17 (1 wk)
- **Objective:** Move to CBFC Rack on the engine.
- **Backend:** seed P17 config (§41.2); transition hook → `warehouse.create_movement`; prerequisite P6.
- **Frontend:** P17 worklist + form; rack scan/select.
- **DB:** `wh.inventory_movement`, `box_location`, `box_location_history`.
- **APIs:** generic workflow + `/warehouse/racks?site=CBFC`.
- **Dependencies:** Phase 7, 10; Phase 8 (P6).
- **Deliverables:** scan box → select CBFC rack → confirm → movement txn + location update, P6-gated.
- **Acceptance:** §66 P17; no location overwrite without history+movement; P6-incomplete blocked; idempotent.
- **Testing:** §18.5.

### PHASE 12 — Process 18 (1 wk)
- **Objective:** Rack Row Bin Mapping on the engine.
- **Backend:** seed P18 config (§41.3); hook → `warehouse.map_rrb`; prerequisite P17; occupancy rules.
- **Frontend:** P18 form with `LocationSelector` cascade + QR scan.
- **DB:** `wh.box_location` (row/bin), history, movement `RRB_MAP`.
- **APIs:** generic workflow + `/warehouse/racks/{id}/rows`, `/rows/{id}/bins`, `/scan/resolve`.
- **Dependencies:** Phase 11.
- **Deliverables:** scan box → Rack→Row→Bin → validate → confirm → exact location persisted + searchable.
- **Acceptance:** §66 P18; bin validation + occupancy enforced; duplicate/invalid blocked; history kept.
- **Testing:** §19.5.

### PHASE 13 — Audit / Traceability (0.5 wk, runs alongside 8–12)
- **Objective:** central audit + box timeline + traceability + search.
- **Backend:** `audit` module — `AuditSink` wired into all mutations, `trace_event` writes in hooks, `/trace/*` assembly, search index.
- **Frontend:** `TraceabilityPanel`, `AuditTimeline`, `/trace` search, `/trace/[boxUid]`.
- **APIs:** §25.9.
- **Dependencies:** Phases 4–12 emit events.
- **Deliverables:** `/trace/boxes/{uid}` answers every §29 question.
- **Acceptance:** every §29 question answerable from the API; no event missing from the timeline.
- **Testing:** end-to-end box lifecycle → assert full trace; audit immutability; search by each dimension.

### PHASE 14 — Scanner Integration (0.5 wk)
- **Objective:** HID scan + `/scan/resolve` + offline queue.
- **Backend:** `/scan/resolve`, `/scan/events`.
- **Frontend:** `ScannerInput` (HID capture), offline mutation queue, device-id header.
- **Dependencies:** Phases 8–12.
- **Deliverables:** BS512/K8 scan drives P6/P17/P18; unknown scan handled; offline replay.
- **Acceptance:** §22 tests pass on a real device at UAT; device id on movements/audit.
- **Testing:** synthetic HID bursts, resolve contract, offline replay idempotency.

### PHASE 15 — Testing Hardening (1 wk)
- Full regression, E2E suite, load smoke, security pre-VAPT checklist, failure-injection matrix (SAP down, DB down, MinIO down, Redis down). See §37.

### PHASE 16 — UAT (1–2 wk)
- With Titan, real sample data, real scanners, real rack. See §40.

### PHASE 17 — On-Premise Deployment (0.5–1 wk)
- Compose prod on Titan VM, TLS, backups, monitoring, runbook, go-live checklist §41. (Numbered 16 in the brief's list; sequenced after UAT here.)

> Indicative total ≈ 16–18 working weeks with the team in §37 — consistent with the proposal's 13–14 week guide plus SAP-unknown risk buffer. **[OPEN-Q]** confirm contractual baseline (proposal states both "3 months" and "13–14 weeks").

## 36. Sprint / Task Breakdown

Two-week sprints. Sprint goal → key stories (S = story, ~pts).

| Sprint | Goal | Stories |
|---|---|---|
| **S1** | Foundation | S: schema/gateway/registry/import-linter (5); S: Compose+MinIO+CI (3); S: nav rename + route stubs (2); S: DB mixins + triggers (5); S: OpenAPI→TS (2) |
| **S2** | Auth + DB tables | S: roles/permissions model + `require_permission` (5); S: all §9 migrations (8); S: seed framework + role matrix (3); S: `/admin/users` (5); S: RBAC test harness (3) |
| **S3** | SAP core | S: `SapProvider` + `MockSapProvider` + faults (5); S: `sync.py` + snapshot upsert (8); S: `sap_field_mapping` + transforms (5); S: reconcile to catalog (5); S: sap_request_log + idempotency (3) |
| **S4** | SAP UI + Documents | S: `/sap-upload` console + browser (8); S: MinIO document module (8); S: DocumentSlot/List/Viewer (5); S: doc RBAC + types seed (3) |
| **S5** | Workflow engine I | S: definition service + cache + `/definition` API (8); S: `start_execution` + resolvers (8); S: `DynamicForm`/`DynamicField`/`ConsolidatedPanel` (8); S: P0-DEMO seed (3) |
| **S6** | Workflow engine II | S: validation model + operators + evaluate (8); S: `perform_action` + transitions + guards + prereqs (8); S: hook registry (3); S: `ValidationResult`/`ProcessTimeline` (5); S: engine test suite (5) |
| **S7** | Process 6 | S: P6 config seed (5); S: box register/import + QED + mail reconcile (8); S: P6 worklist + form polish (5); S: P6 integration + RBAC + idempotency tests (8) |
| **S8** | Deviation | S: deviation state machine + hooks (8); S: notification SMTP + templates (5); S: `DeviationPanel` + `/deviations` (8); S: revised-DC re-validation (3); S: deviation tests (5) |
| **S9** | Warehouse + P17 | S: `wh` hierarchy CRUD + QR (8); S: `/warehouse` config UI + selectors (8); S: P17 config + movement hook (5); S: P17 form + tests (8) |
| **S10** | P18 + Traceability | S: P18 config + `map_rrb` + occupancy rules (8); S: `LocationSelector` cascade + QR scan (5); S: `audit`/`trace` module + `/trace/*` (8); S: `TraceabilityPanel`/`AuditTimeline`/search (8) |
| **S11** | Scanner + Dashboard + hardening | S: `ScannerInput` + `/scan/*` + offline queue (8); S: dashboard MVP slice (5); S: failure-injection matrix (5); S: E2E suite (8); S: security pre-VAPT checklist (3) |
| **S12** | UAT support + deploy | S: UAT fixes (13); S: prod Compose + TLS + backup + monitoring (8); S: runbook + go-live checklist (3) |

Backlog / later-phase (not scheduled): SAP real provider wiring, 101/321/313 posting, P7–P16 config, plating loop, put-away suggestion, material issue/261, dashboards analytics.

## 37. Developer-Wise Task Allocation

Assumed team (adjust to actual): **1 Lead/Architect, 2 Backend, 2 Frontend, 1 QA, 0.5 DevOps** (proposal's Pinesphere team).

| Person | Primary ownership | Phases/Sprints |
|---|---|---|
| **Lead / Architect** | Module boundaries, gateway, workflow-engine design + review, SAP provider interface, data model, code review, Titan open-question closure, security | P0–P1, engine design in P7, all reviews |
| **Backend A** | `identity`, `sap` module (provider, sync, mapping, reconcile), `notification` | S2–S4, S8 |
| **Backend B** | `workflow` engine (execution, validation, transitions, hooks), `deviation`, `warehouse` (movements, RRB), `audit`/`trace` | S5–S6, S8–S10, S13 |
| **Frontend A** | Design-system extensions, `DynamicForm`/`DynamicField`/`ConsolidatedPanel`/`ValidationResult`, workflow routes, P6/P17/P18 screens | S1, S5–S7, S9–S10 |
| **Frontend B** | `sap-upload` console, `documents` components, `DeviationPanel`, `/warehouse` config, `LocationSelector`, `/trace`, dashboard, `ScannerInput` | S4, S8–S11 |
| **QA** | Test strategy, RBAC matrix, engine test suite, integration/E2E (Playwright), SAP-mock scenarios, failure injection, UAT scripts | from S2 onward, lead S11–S12 |
| **DevOps (0.5)** | CI/CD, Compose dev+prod, MinIO, secrets, backups, monitoring, on-prem deploy, VAPT support | S1, S11–S12 |
| **Backend C (if available)** | `catalog` module, `documents` backend, barcode/label rendering, idempotency framework | S3–S4, S7 |

Pairing points: engine design (Lead + Backend B); SAP mapping (Backend A + Lead); dynamic form contract (Backend B + Frontend A).

## 38. Acceptance Criteria (MVP)

### Global
- G1 Every protected endpoint enforces a permission server-side; UI hiding is cosmetic only.
- G2 No process-specific branch (`if process == 6/17/18`) exists in frontend or backend business code — proven by grep + code review.
- G3 Adding a new process (e.g. P0-DEMO / a future P19) is achieved by seed data only, no deploy — demonstrated.
- G4 Every significant action writes `audit_log`; every box state change writes `trace_event`; audit/history rows are UPDATE/DELETE-protected (trigger test).
- G5 All mutating endpoints are idempotent under retry (double-submit test suite green).
- G6 SAP is consumed via the provider interface; swapping `SAP_PROVIDER` requires no business-code change; no invented SAP endpoint/field is hard-coded (placeholders only).
- G7 `Production` menu reads **SAP Upload**, routes to a sync console (no SAP file-upload control), `/production` redirects.
- G8 Box UID barcode payload = the UID string only (decode test).
- G9 Documents stored in MinIO, metadata in Postgres, every traceability doc has ≥1 link.
- G10 The system runs on `docker-compose.prod.yml` on a single VM with Postgres + MinIO internal-only.

### Process 6 (req §66)
- P6-1 A PPC/QA user scans/selects a Box UID and sees linked DC, SAP PO/material, QED, vendor, material/model/quantity, and mail reference (or an explicit "not found").
- P6-2 The system shows per-rule match/mismatch.
- P6-3 Completion is blocked while any blocking error rule fails.
- P6-4 On mismatch the user can raise a deviation; a `deviation` record is created with type + expected/received.
- P6-5 The verification result is persisted with actor + timestamp + evaluated rule snapshot.
- P6-6 The deviation loop (mark-in-DC → mail vendor → vendor response → revised-DC validation → resolve) is completable and fully audited.

### Process 17 (req §66)
- P17-1 A box can be moved to a CBFC rack **only** when its P6 execution is `DOCUMENT_VERIFIED` or `DEVIATION_RESOLVED`.
- P17-2 Confirmation creates an `inventory_movement` (from → to, type, execution, user, device, timestamp) — the prior location is never overwritten without a history + movement row.
- P17-3 Current movement status/location is visible on the box and dashboard.
- P17-4 Duplicate confirm returns the existing movement (idempotent).

### Process 18 (req §66)
- P18-1 A box can be assigned to a Rack/Row/Bin **only** when its P17 execution is `MOVED_TO_RACK`.
- P18-2 Location is validated: bin belongs to the chosen row→rack, bin active, occupancy rule satisfied.
- P18-3 Exact location is persisted; `box_location_history` + `inventory_movement(RRB_MAP)` written.
- P18-4 Invalid/duplicate assignment is prevented per configured rules.
- P18-5 The box is afterwards searchable by Box UID, material, model, vendor, DC, PO, and Rack/Row/Bin.
- P18-6 Location history is retained.

## 39. Test Cases

Format: **ID · area · precondition → action → expected**. (Representative set; QA expands to full matrix. Positive + negative per req §53.)

### Unit
- U-VAL-01 `compare eq` equal numbers → pass. U-VAL-02 unequal → fail w/ actual/expected. U-VAL-03 missing left operand → fail, actual=null.
- U-VAL-04 `compare gte` with tolerance. U-VAL-05 `exists document:DELIVERY_CHALLAN minCount 1` with 0 docs → fail.
- U-VAL-06 `prerequisite P6 status in {DOCUMENT_VERIFIED,DEVIATION_RESOLVED}` — each branch.
- U-VAL-07 `bin_free` single-rule with occupied bin → fail; multi under capacity → pass; over capacity → fail.
- U-RESOLVE-01..05 each field-source resolver returns value / null+note.
- U-MAP-01 SAP mapping transform `date:%d-%m-%Y`, `strip_suffix:/R`, `upper`.
- U-BARCODE-01 encode `BX-260615-01` → Code128 → decode → exact string, nothing else.
- U-IDEM-01 idempotency store returns cached response on replay.

### Integration / API
- I-AUTH-01 login → access+refresh; I-AUTH-02 reused refresh → family revoked, 401 `token_reused`.
- I-RBAC-01 `STORE` → `POST process6 action COMPLETE_VERIFICATION` → 403. I-RBAC-02 `QA` → `POST P17 confirm` → 403.
- I-SAP-01 sync (mock) → snapshots + catalog populated + request logs. I-SAP-02 sync twice/10min → replay. I-SAP-03 `SAP_MOCK_FAULT=timeout` → run `partial`, retried. I-SAP-04 `=500` → run `failed`, last-good snapshot still served. I-SAP-05 malformed row → rejected in `stats`, run `partial`.
- I-DOC-01 upload PDF DC → MinIO object + metadata. I-DOC-02 upload `.exe` → 415. I-DOC-03 oversize → 413. I-DOC-04 download without `doc:download` → 403. I-DOC-05 v2 upload keeps v1.
- I-WF-01 `GET /workflow/processes/P6/definition` shape. I-WF-02 `start_execution` unknown box → 404. I-WF-03 start twice → same execution. I-WF-04 `perform_action` wrong from-status → 409 `invalid_transition`.
- I-P6-01 happy path (mock SAP, matching data) → `DOCUMENT_VERIFIED`. I-P6-02 DC qty ≠ QED accepted → COMPLETE blocked 422 with rule. I-P6-03 material ≠ model → blocked. I-P6-04 missing DC document → blocked. I-P6-05 RAISE_DEVIATION → deviation row + `DEVIATION_RAISED`.
- I-DEV-01 shortage deviation → mark-in-DC → mail (mock SMTP captured) → response accepted → revised DC → re-validate pass → `resolved` + parent `DEVIATION_RESOLVED`. I-DEV-02 vendor reject → deviation stays `rejected`/open. I-DEV-03 revised DC still mismatched → `revised_dc_validation_failed`.
- I-P17-01 P6 done → move to CBFC rack → movement + `box_location(rack)` + history + `MOVED_TO_RACK`. I-P17-02 P6 not done → 409 `prerequisite_not_met`. I-P17-03 move to non-CBFC rack → 422 `invalid_location`. I-P17-04 already stored → 409. I-P17-05 double confirm → same movement id.
- I-P18-01 P17 done → Rack/Row/Bin → `STORED` + `box_location` + history + `RRB_MAP`. I-P18-02 P17 not done → 409. I-P18-03 bin not in row → 422 `invalid_location`. I-P18-04 `single` bin occupied → 409 `bin_occupied`. I-P18-05 `multi` bin over capacity → 409 `bin_capacity_exceeded`. I-P18-06 duplicate mapping → idempotent replay.
- I-SCAN-01 `/scan/resolve` known box UID → box payload. I-SCAN-02 known location QR → node. I-SCAN-03 unknown → 404 `unresolved_scan` + audit.
- I-TRACE-01 full lifecycle box → `/trace/boxes/{uid}` answers all §29 questions. I-TRACE-02 `audit_log` UPDATE attempt → DB error. I-TRACE-03 search by bin code → returns stored box.

### Workflow-engine (dynamic proof)
- W-DYN-01 seed a brand-new process "P19-TEST" (fields+rules+docs+statuses+transitions+roles) via seed script → it appears in `/workflow/processes`, renders in `DynamicForm`, executes a transition — **no code change, no deploy**.
- W-DYN-02 add a field to P6 config → appears on the form after cache TTL, no frontend change.
- W-DYN-03 change a rule severity error→warning → completion no longer blocked.

### E2E (Playwright)
- E2E-01 login → SAP Upload → run sync → see PO/DC rows.
- E2E-02 P6: scan box → consolidated panel → validate → complete → status Verified; trace timeline shows the event.
- E2E-03 P6 mismatch → raise deviation → mail vendor → record acceptance → upload revised DC → resolve.
- E2E-04 P17: scan box → pick CBFC rack → confirm → movement visible.
- E2E-05 P18: scan box → Rack→Row→Bin → confirm → search by bin finds the box.
- E2E-06 RBAC: STORE user cannot see/act on P6 verify button and API rejects it.

### Failure-scenario
- F-01 stop Postgres mid-action → 500 generic, transaction rolled back, no partial write. F-02 stop MinIO → upload 502, no metadata row. F-03 stop Redis → app still serves (fail-open), idempotency falls back to DB columns. F-04 SAP mock down → SAP Upload shows last-good + retry. F-05 kill API between movement insert and status update → next retry idempotently completes (or fully rolls back).

### Security
- SEC-01 access another user's document by id → 403. SEC-02 SQL-injection payloads in search params → parameterised, no leak. SEC-03 JWT `role` tamper → signature check fails. SEC-04 expired access token → 401, refresh path. SEC-05 rate-limit login brute force → lockout. SEC-06 headers present (HSTS/CSP/nosniff/frame-deny). SEC-07 OT subnet cannot reach `/api/v1/sap/*` (network test). SEC-08 secrets not in image (Trivy/secret scan).

## 40. UAT Plan

- **Environment:** dedicated Titan UAT VM, prod-like Compose, **real sample data** (real DC scans, real QED sheet with the two new columns, real dispatch email, a SAP extract or Titan-approved mock dataset), real BS512 + K8 scanners, one real/representative CBFC rack with printed bin QRs, DT48 printer.
- **Participants:** PPC, QA, Store, CBFC operators + Titan project lead (Santhosh Raj V / Kumarvel P) + Pinesphere.
- **Entry criteria:** all Phase 15 tests green; open-question register resolved or risk-accepted; UAT data loaded; roles assigned to real users.
- **Exit criteria:** all P0/P1 UAT scripts pass; no open Sev-1/Sev-2 defects; Titan sign-off on P6/P17/P18 acceptance (§38); go-live checklist (§41) complete.

**UAT scripts (each = steps + expected + pass/fail + notes):**

| ID | Scenario | Expected |
|---|---|---|
| UAT-01 | SAP sync with UAT dataset | PO/DC/material/vendor/batch visible; counts match source |
| UAT-02 | Register/import a real Box UID and link its DC + QED | Box shows correct linked data on scan |
| UAT-03 | P6 — matching box | Consolidated panel correct; all rules pass; verify succeeds; trace event logged |
| UAT-04 | P6 — shortage (real short-qty DC) | Mismatch shown; deviation raised as `shortage` with correct expected/received |
| UAT-05 | P6 — wrong model | `wrong_model` deviation; completion blocked |
| UAT-06 | Deviation — full loop with a real vendor email exchange transcribed | mark-in-DC, mail sent+recorded, response captured, revised DC uploaded + re-validated, resolved |
| UAT-07 | P17 — move verified box to CBFC rack (scan rack QR) | Movement recorded with operator + device + time; box location = rack |
| UAT-08 | P17 — attempt before P6 done | Blocked with clear message |
| UAT-09 | P18 — map to Rack/Row/Bin (scan each QR) | Exact location stored; history + movement written |
| UAT-10 | P18 — bin occupancy rule (occupied `single` bin) | Blocked "bin full — choose another" |
| UAT-11 | Search — by Box UID / material / model / vendor / DC / PO / Rack-Row-Bin / status | Correct box(es) returned quickly |
| UAT-12 | Traceability — pick a fully-processed box | Every §29 question answered on one screen |
| UAT-13 | RBAC — each real role does only its permitted actions | Unauthorized actions blocked in UI and API |
| UAT-14 | Scanner — BS512 + K8 drive P6/P17/P18 end to end | Scans resolve; workflow proceeds; unknown scan handled |
| UAT-15 | Label print — mint + print a Box UID label on DT48, re-scan | Prints; re-scan resolves to the same box |
| UAT-16 | Failure — SAP unavailable during a shift | Last-good data shown; work continues where possible; retry works |
| UAT-17 | Audit — export audit log for a box's day | Complete, ordered, no gaps, immutable |
| UAT-18 | Dashboard — pending verification / deviations / storage status | Numbers reconcile with reality |

- **Defect triage:** Sev-1 blocks go-live, Sev-2 fix before go-live or documented workaround, Sev-3/4 backlog.
- **Pilot:** run parallel with the manual process for an agreed period; accuracy checked against manual records before full cutover (req §53).

## 41. Deployment Checklist (On-Premise Go-Live)

**Pre-deploy**
- [ ] Titan VM(s) provisioned, OS patched, Docker + Compose installed, disk sized (DB + MinIO + logs + backups).
- [ ] Firewall rules: :443 from LAN/OT to Nginx only; OT subnet ACL excludes `/sap`, `/admin`; no inbound from outside Titan network.
- [ ] Internal CA TLS cert for the app hostname; SAP CA bundle obtained.
- [ ] Secrets provisioned in the chosen store (JWT signing key, DB creds, MinIO keys, SMTP creds, SAP creds placeholder or real).
- [ ] `.env.prod` complete; `validate_production()` passes; `DEBUG=false`.
- [ ] Images built, scanned (Trivy clean of HIGH/CRITICAL), loaded into Titan registry / host.
- [ ] `docker-compose.prod.yml` reviewed: postgres/redis/minio internal-only, replicas set, beat=1.
- [ ] Backup target (NAS) mounted; backup + restore scripts tested; restore drill done once.
- [ ] Monitoring up (Prometheus/Grafana); alert routes configured.

**Deploy**
- [ ] `pg_dump` snapshot of any existing data.
- [ ] `alembic upgrade head` (migration job) — success.
- [ ] `make seed` (roles, permissions, document types) + `make seed-processes` (P6/P17/P18 config) — verify P6/P17/P18 appear in `/workflow/processes`.
- [ ] Seed the real CBFC → Rack → Row → Bin hierarchy + print/apply bin QRs (or import Titan's layout export).
- [ ] Create real user accounts + role assignments.
- [ ] `docker compose -f docker-compose.prod.yml up -d`.
- [ ] `/healthz` + `/readyz` green; MinIO bucket exists; SMTP test mail sends.

**Post-deploy smoke**
- [ ] Login as each role.
- [ ] SAP sync (mock or real) populates data.
- [ ] One box through P6 → P17 → P18 on a real scanner; trace + audit correct.
- [ ] Deviation loop once; vendor mail delivered.
- [ ] Label printed + re-scanned.
- [ ] Backup job runs on schedule; log shipping works.

**Cutover**
- [ ] Parallel-run period agreed and started.
- [ ] Runbook handed over (start/stop, backup/restore, rotate secrets, add a process, add a rack, common errors).
- [ ] Training delivered (operators, admin); user manual + SAP integration doc + QR labelling standard delivered (req §52).
- [ ] Support/escalation contacts + SLA agreed.
- [ ] Sign-off recorded.

**Rollback**
- [ ] `docker compose down` new stack → restore previous images + `pg_restore` snapshot → verify. (Migrations are expand/contract so previous image runs against the new schema in most cases.)

## 42. Open Questions / Dependencies From TITAN

Consolidated from `requirements.md` §67 + decisions this blueprint could not make. Each must be answered or risk-accepted before the dependent phase.

| ID | Question | Blocks | Interim decision in this blueprint |
|---|---|---|---|
| Q1 | Exact P6 quantity match rule (DC qty vs QED accepted vs inspected; tolerance) | P8 rules | `DC qty == QED accepted qty`, tolerance 0, blocking error |
| Q2 | "Mark in DC" artefact — physical stamp / system flag / annotated scan | P9 | system flag + optional annotated doc |
| Q3 | Exact SAP system + version | P4 real provider | mock |
| Q4 | SAP interface: OData / BAPI / RFC / REST / file | P4 | provider abstraction, mock |
| Q5 | SAP technical field names per object | P4 mapping | `sap_field_mapping` config, sample names |
| Q6 | SAP auth method + credentials delivery | P4 | `SAP_AUTH_MODE=TBC` |
| Q7 | May the app POST to SAP (101/321/313) or assist/manual-confirm only? | later phase | `SAP_CAN_POST=false`, mock only in MVP |
| Q8 | Exact PO ↔ DC relationship in SAP | P4 reconcile | 1 DC → 0..1 PO, multi-line DC |
| Q9 | Box UID generation ownership (vendor vs Titan) + format authority | P8 box lifecycle | support both import + mint; soft format check |
| Q10 | Final QED Audit Sheet format after the 2 new columns | P8 QED ingest | fields per req §33 |
| Q11 | "Number of Trays" meaning + data type | P8 | integer, informational |
| Q12 | QED captured by scan/upload vs digital entry | P8 | upload the sheet as a document + key fields entered/parsed manually |
| Q13 | Vendor dispatch emails: manual upload vs auto-ingest | P9 | manual — attach `.eml`/PDF + record `mail_reference` |
| Q14 | Mail server / API for outbound vendor mail | P9 | SMTP; host/creds TBC |
| Q15 | Final role names | P3 | PPC, QA, STORE, CBFC, GATE_SECURITY, ADMIN |
| Q16 | Final permission set + role→permission matrix | P3 | interim matrix in seed |
| Q17 | RRB hierarchy — is "Row" the same as "Shelf"? levels? | P10 | Rack → Row → Bin; Shelf = Row |
| Q18 | Bin/rack capacity + occupancy rules | P12 | per-bin `occupancy_rule` default `multi`, capacity null |
| Q19 | Location QR value format | P10 | `LOC-{ZONE}-{RACK}-{ROW}-{BIN}` proposed |
| Q20 | Exact FIFO rule (on Titan DC No) | later | capture data only, no enforcement |
| Q21 | Deviation approval authority | P9 | PPC/QA can resolve; escalation TBC |
| Q22 | Vendor response SLA | P9 | none enforced |
| Q23 | Notification recipients (vendor contacts, internal DLs) | P9 | config table, values TBC |
| Q24 | Dashboard KPIs | P11/S11 | MVP slice: pending verification, deviations, storage status, search |
| Q25 | UAT acceptance criteria detail | P16 | §38 + §40 draft |
| Q26 | Production uptime/availability target | §34 | none hard-coded |
| Q27 | Backup / DR RPO/RTO + retention | §34 | 30-day, RPO 5min, RTO 1h proposed |
| Q28 | Audit record retention period | §30 | 7 years proposed |
| Q29 | Security / VAPT standard + tooling | §33/S11 | OWASP ASVS L2 proposed |
| Q30 | Network / VPN / port details, registry access, air-gapped? | S1/S12 | assume internal registry |
| Q31 | Approved scanner models for procurement | P14 | BS512 / K8 / DT48 per proposal |
| Q32 | Printer + label spec (size, symbology, ZPL) | P8 label | Code128, size TBC |
| Q33 | QR labelling standard document requirements | §52 | to be authored with Titan |
| Q34 | Vision System — MVP or later? | scope | later |
| Q35 | Quantity counting — MVP or later? | scope | later |
| Q36 | Component mix-up controls — MVP or later? | scope | later |
| Q37 | Material issue / SAP 261 — MVP or later? | scope | later |
| Q38 | Plating / SAP 541 loop — MVP or later? | scope | later |
| Q39 | Are the 19 DFD steps final numbering, or merged/renumbered? | engine config | treat P6/P17/P18 codes as stable |
| Q40 | Exact acceptance boundary of Process 6 / 17 / 18 (where each starts/ends) | P8/P11/P12 | boundaries per §16/§18/§19 |
| Q41 | Contractual timeline baseline (3 months vs 13–14 weeks) | plan | ~16–18 wk estimate |
| Q42 | On-prem secret store choice (Docker secrets / Vault) | §33 | Docker secrets default |
| Q43 | Master data delivery (vendor/material/location extracts) format + timing | P2/P4/P10 | CSV import + SAP sync |
| Q44 | Shared operator-PC session policy (idle timeout, switch-user) | P3 | 15-min idle, explicit switch-user |
| Q45 | ClamAV / AV scanning available on-prem for uploads? | P6 | `scan_status=skipped` if absent |

## 43. Future Extensibility Plan

**The foundation is built once; everything below is configuration or an additive module.**

| Future need | How it's added (no re-architecture) |
|---|---|
| **DFD Processes 1–5, 7–16, 19** | Seed `process_definition` + fields + rules + doc reqs + statuses + transitions + role bindings + prerequisites. They appear in the worklist and render via `DynamicForm`. Prereq rows chain them (e.g. P8 requires P6). |
| **SAP 101 / 321 / 313 posting** | Set `SAP_CAN_POST=true`, implement `RestSapProvider.post_movement` against the Titan contract, add a transition hook `on_enter:SAP_101_POSTED → sap.post_movement`. `sap_movement_ref` already models it. |
| **Real SAP provider** | Implement one `SapProvider` subclass, fill `sap_field_mapping`, flip `SAP_PROVIDER`. Zero business-code change. |
| **Plating / SAP 541 loop** | New `process_definition` set + a `plating_job` table in `catalog`; `/R` suffix handling already in the mapping transforms. Its own state machine via the same engine. |
| **Material issue / SAP 261** | New process(es) + a `catalog.issue` transaction; assembly-gate scanner uses the same `/scan/resolve` + workflow APIs. |
| **Quantity counting / Vision System** | New `inspection` module exposing a contract; a P-config field `source=derived` pulls the count; rules compare it. No engine change. |
| **Component mix-up / FIFO enforcement** | New blocking `validation_rule` types (`custom` fn `fifo_order_ok`, `single_lot_per_bin`) registered and selected by config. |
| **Smart put-away suggestion** | Implement `warehouse.putaway.suggest_bin`; P18 field `suggested_bin` (`source=derived`) pre-fills the selector. |
| **Multi-plant rollout** | Add `plant_id` scoping to master + config tables + a plant claim in the JWT; process config becomes per-plant rows. |
| **New microservice extraction** | Point the registry binding for a module at an HTTP client; move `modules/X/` to `services/X/` with its own Dockerfile. Schema already isolated; contracts already defined. |
| **New document type** | Insert a `document_type` row; reference it in `process_document_req`. |
| **New role / permission** | Insert `roles` / `permissions` / `role_permissions` rows. |
| **New warehouse layout / new site** | CRUD in `wh.*` + mint QRs. No deploy. |
| **New dashboard / report** | New read-only query + component against existing `trace_event` / `audit_log` / projections. |
| **Events / message bus** | Replace the in-process transition-hook registry with an outbox → broker (Kafka/RabbitMQ) publisher; consumers become services. The hook interface is unchanged. |
| **MES / IoT consumption postings** | Consume `trace_event` outbox; no change to the workflow engine. |

**Guardrails that keep it extensible (enforced in CI + review):**
- No `if processCode ==` / `if process == N` in frontend or backend business logic (grep gate).
- Modules import only `core`, `db`, and other modules' `contracts.py` (import-linter).
- Process behaviour lives in `wf.*` config, not code.
- SAP specifics live in `sap_field_mapping` + env, not code.
- Rack/Row/Bin lives in `wh.*` data, not code.
- Audit/history tables are append-only (DB triggers).
- Every new feature meets the §71 Definition of Done from `requirements.md`.

---

## Appendix A — Process Configuration Seed (P6 / P17 / P18)

> Lives in `backend/app/db/seed/processes/`. Illustrative JSON; exact rule operands finalised after Q1/Q40.

### A.1 Process 6 (`p6.json`)
```jsonc
{
  "code": "P6", "name": "Refer DC Doc and Mail Reference Verification", "sequenceNo": 6,
  "entityType": "BOX", "isActive": true, "version": 1,
  "roles": [ {"role": "PPC", "canExecute": true, "canView": true},
             {"role": "QA",  "canExecute": true, "canView": true},
             {"role": "ADMIN","canExecute": true, "canView": true} ],
  "prerequisites": [],
  "statuses": [
    {"code": "PENDING", "label": "Pending", "isInitial": true},
    {"code": "IN_REVIEW", "label": "In Review"},
    {"code": "DEVIATION_RAISED", "label": "Deviation Raised"},
    {"code": "DEVIATION_RESOLVED", "label": "Deviation Resolved", "isTerminal": true, "isSuccess": true},
    {"code": "DOCUMENT_VERIFIED", "label": "Verified", "isTerminal": true, "isSuccess": true}
  ],
  "transitions": [
    {"from": "PENDING", "to": "IN_REVIEW", "action": "START_REVIEW", "label": "Start Review"},
    {"from": "IN_REVIEW", "to": "DOCUMENT_VERIFIED", "action": "COMPLETE_VERIFICATION",
     "label": "Complete Verification", "requiredPermission": "process6:verify"},
    {"from": "IN_REVIEW", "to": "DEVIATION_RAISED", "action": "RAISE_DEVIATION",
     "label": "Raise Deviation", "requiredPermission": "process6:verify"},
    {"from": "DEVIATION_RAISED", "to": "DEVIATION_RESOLVED", "action": "RESOLVE_DEVIATION",
     "label": "Resolve", "requiredPermission": "deviation:resolve", "guard": {"type":"custom","fn":"deviation_is_resolved"}}
  ],
  "fields": [
    {"key": "box_uid", "label": "Box UID", "dataType": "string", "uiComponent": "scanner-input", "source": "input", "required": true, "group": "Identify", "displayOrder": 10},
    {"key": "sap_po_no", "label": "SAP PO No", "dataType": "string", "source": "sap", "sourcePath": "po.po_number", "readOnly": true, "group": "SAP", "displayOrder": 20},
    {"key": "sap_material_no", "label": "SAP Material", "dataType": "string", "source": "sap", "sourcePath": "material.material_no", "readOnly": true, "group": "SAP", "displayOrder": 21},
    {"key": "sap_vendor", "label": "SAP Vendor", "dataType": "string", "source": "sap", "sourcePath": "vendor.vendor_name", "readOnly": true, "group": "SAP", "displayOrder": 22},
    {"key": "sap_qty", "label": "SAP Qty", "dataType": "number", "source": "sap", "sourcePath": "po_item.ordered_qty", "readOnly": true, "group": "SAP", "displayOrder": 23},
    {"key": "titan_dc_no", "label": "Titan DC No", "dataType": "string", "source": "dc", "sourcePath": "titan_dc_no", "readOnly": true, "group": "Delivery Challan", "displayOrder": 30},
    {"key": "vendor_dc_no", "label": "Vendor DC No", "dataType": "string", "source": "dc", "sourcePath": "vendor_dc_no", "readOnly": true, "group": "Delivery Challan", "displayOrder": 31},
    {"key": "dc_qty", "label": "DC Qty", "dataType": "number", "source": "dc", "sourcePath": "item.qty", "readOnly": true, "group": "Delivery Challan", "displayOrder": 32},
    {"key": "dc_vendor", "label": "DC Vendor", "dataType": "string", "source": "dc", "sourcePath": "vendor.name", "readOnly": true, "group": "Delivery Challan", "displayOrder": 33},
    {"key": "qed_model_no", "label": "QED Model", "dataType": "string", "source": "qed", "sourcePath": "item.model_no", "readOnly": true, "group": "QED Audit", "displayOrder": 40},
    {"key": "qed_inspected_qty", "label": "QED Inspected", "dataType": "number", "source": "qed", "sourcePath": "item.inspected_qty", "readOnly": true, "group": "QED Audit", "displayOrder": 41},
    {"key": "qed_accepted_qty", "label": "QED Accepted", "dataType": "number", "source": "qed", "sourcePath": "item.accepted_qty", "readOnly": true, "group": "QED Audit", "displayOrder": 42},
    {"key": "qed_rework_qty", "label": "QED Rework", "dataType": "number", "source": "qed", "sourcePath": "item.rework_qty", "readOnly": true, "group": "QED Audit", "displayOrder": 43},
    {"key": "qed_verdict", "label": "QED Verdict", "dataType": "string", "source": "qed", "sourcePath": "item.verdict", "readOnly": true, "group": "QED Audit", "displayOrder": 44},
    {"key": "mail_ref", "label": "Dispatch Mail Ref", "dataType": "string", "source": "mail", "sourcePath": "dispatch.external_ref", "readOnly": true, "group": "Mail", "displayOrder": 50},
    {"key": "verification_remarks", "label": "Remarks", "dataType": "string", "uiComponent": "textarea", "source": "input", "editable": true, "group": "Outcome", "displayOrder": 90}
  ],
  "documents": [
    {"documentTypeCode": "DELIVERY_CHALLAN", "required": true, "minCount": 1},
    {"documentTypeCode": "QED_AUDIT_SHEET", "required": true, "minCount": 1},
    {"documentTypeCode": "DISPATCH_MAIL", "required": false},
    {"documentTypeCode": "JOB_CARD", "required": false}
  ],
  "validationRules": [
    {"code": "BOX_EXISTS", "ruleType": "exists", "expression": {"type": "exists", "target": "reference:box_uid"}, "severity": "error", "blocking": true, "message": "Box UID not found in the system"},
    {"code": "DC_LINKED", "ruleType": "exists", "expression": {"type": "exists", "target": "field:titan_dc_no"}, "severity": "error", "blocking": true, "message": "No Delivery Challan linked to this box"},
    {"code": "QED_LINKED", "ruleType": "exists", "expression": {"type": "exists", "target": "field:qed_accepted_qty"}, "severity": "error", "blocking": true, "message": "No QED Audit record linked to this box"},
    {"code": "SAP_PO_LINKED", "ruleType": "exists", "expression": {"type": "exists", "target": "field:sap_po_no"}, "severity": "error", "blocking": true, "message": "No SAP PO linked — run SAP sync"},
    {"code": "MAIL_REF_PRESENT", "ruleType": "exists", "expression": {"type": "exists", "target": "field:mail_ref"}, "severity": "warning", "blocking": false, "message": "No dispatch mail reference recorded"},
    {"code": "DC_QTY_EQ_QED_ACCEPTED", "ruleType": "compare", "expression": {"type": "compare", "left": "field:dc_qty", "op": "eq", "right": "field:qed_accepted_qty", "tolerance": 0}, "severity": "error", "blocking": true, "message": "Delivery Challan quantity does not match QED accepted quantity"},
    {"code": "SAP_MATERIAL_EQ_QED_MODEL", "ruleType": "compare", "expression": {"type": "compare", "left": "field:sap_material_no", "op": "eq", "right": "field:qed_model_no"}, "severity": "error", "blocking": true, "message": "SAP material does not match QED model"},
    {"code": "SAP_VENDOR_EQ_DC_VENDOR", "ruleType": "compare", "expression": {"type": "compare", "left": "field:sap_vendor", "op": "eq", "right": "field:dc_vendor"}, "severity": "error", "blocking": true, "message": "SAP vendor does not match Delivery Challan vendor"},
    {"code": "DC_DOC_ATTACHED", "ruleType": "exists", "expression": {"type": "exists", "target": "document:DELIVERY_CHALLAN", "minCount": 1}, "severity": "error", "blocking": true, "message": "Attach the Delivery Challan document"},
    {"code": "QED_DOC_ATTACHED", "ruleType": "exists", "expression": {"type": "exists", "target": "document:QED_AUDIT_SHEET", "minCount": 1}, "severity": "error", "blocking": true, "message": "Attach the QED Audit Sheet"},
    {"code": "VERDICT_ACCEPTED", "ruleType": "custom", "expression": {"type": "custom", "fn": "verdict_is_accepted"}, "severity": "warning", "blocking": false, "message": "QED verdict is not 'Accepted' — a deviation may be required"}
  ]
}
```

### A.2 Process 17 (`p17.json`)
```jsonc
{
  "code": "P17", "name": "Move to CBFC Rack", "sequenceNo": 17, "entityType": "BOX", "version": 1,
  "roles": [ {"role": "STORE", "canExecute": true, "canView": true}, {"role": "ADMIN", "canExecute": true, "canView": true},
             {"role": "CBFC", "canExecute": false, "canView": true} ],
  "prerequisites": [ {"requiresProcessCode": "P6", "requiresStatusCode": "DOCUMENT_VERIFIED|DEVIATION_RESOLVED", "appliesTo": "same_box"} ],
  "statuses": [
    {"code": "PENDING", "label": "Pending", "isInitial": true},
    {"code": "READY_TO_MOVE", "label": "Ready to Move"},
    {"code": "MOVED_TO_RACK", "label": "Moved to CBFC Rack", "isTerminal": true, "isSuccess": true}
  ],
  "transitions": [
    {"from": "PENDING", "to": "READY_TO_MOVE", "action": "CHECK_ELIGIBILITY", "label": "Check Eligibility"},
    {"from": "READY_TO_MOVE", "to": "MOVED_TO_RACK", "action": "CONFIRM_MOVE", "label": "Confirm Move", "requiredPermission": "movement:create"}
  ],
  "fields": [
    {"key": "box_uid", "label": "Box UID", "uiComponent": "scanner-input", "dataType": "string", "source": "input", "required": true, "group": "Identify", "displayOrder": 10},
    {"key": "current_material", "label": "Material", "dataType": "string", "source": "derived", "sourcePath": "box.material_no", "readOnly": true, "group": "Current", "displayOrder": 20},
    {"key": "current_status", "label": "Current Status", "dataType": "string", "source": "derived", "sourcePath": "box.current_status", "readOnly": true, "group": "Current", "displayOrder": 21},
    {"key": "current_location", "label": "Current Location", "dataType": "string", "source": "derived", "sourcePath": "box.current_location_label", "readOnly": true, "group": "Current", "displayOrder": 22},
    {"key": "dest_rack_id", "label": "Destination CBFC Rack", "dataType": "reference", "uiComponent": "rack-selector", "source": "input", "required": true, "editable": true, "group": "Destination", "displayOrder": 30},
    {"key": "move_remarks", "label": "Remarks", "uiComponent": "textarea", "dataType": "string", "source": "input", "editable": true, "group": "Destination", "displayOrder": 40}
  ],
  "documents": [],
  "validationRules": [
    {"code": "P6_COMPLETED", "ruleType": "prerequisite", "expression": {"type": "prerequisite", "process": "P6", "status": "DOCUMENT_VERIFIED|DEVIATION_RESOLVED"}, "severity": "error", "blocking": true, "message": "Process 6 verification must be completed first"},
    {"code": "BOX_NOT_ALREADY_STORED", "ruleType": "custom", "expression": {"type": "custom", "fn": "box_not_stored"}, "severity": "error", "blocking": true, "message": "This box is already stored in a bin"},
    {"code": "DEST_RACK_ACTIVE", "ruleType": "location_available", "expression": {"type": "location_available", "target": "field:dest_rack_id"}, "severity": "error", "blocking": true, "message": "Selected rack is not active"},
    {"code": "DEST_RACK_IN_CBFC", "ruleType": "custom", "expression": {"type": "custom", "fn": "rack_in_cbfc"}, "severity": "error", "blocking": true, "message": "Selected rack is not in the CBFC zone"}
  ],
  "hooks": [ {"trigger": "on_enter:MOVED_TO_RACK", "fn": "warehouse.create_movement", "args": {"movementType": "MOVE_TO_CBFC_RACK"}} ]
}
```

### A.3 Process 18 (`p18.json`)
```jsonc
{
  "code": "P18", "name": "Rack Row Bin Mapping", "sequenceNo": 18, "entityType": "BOX", "version": 1,
  "roles": [ {"role": "STORE", "canExecute": true, "canView": true}, {"role": "ADMIN", "canExecute": true, "canView": true} ],
  "prerequisites": [ {"requiresProcessCode": "P17", "requiresStatusCode": "MOVED_TO_RACK", "appliesTo": "same_box"} ],
  "statuses": [
    {"code": "PENDING", "label": "Pending", "isInitial": true},
    {"code": "LOCATION_SELECTED", "label": "Location Selected"},
    {"code": "STORED", "label": "Stored", "isTerminal": true, "isSuccess": true}
  ],
  "transitions": [
    {"from": "PENDING", "to": "LOCATION_SELECTED", "action": "SELECT_LOCATION", "label": "Select Location"},
    {"from": "LOCATION_SELECTED", "to": "STORED", "action": "CONFIRM_MAPPING", "label": "Confirm Mapping", "requiredPermission": "location:map"}
  ],
  "fields": [
    {"key": "box_uid", "label": "Box UID", "uiComponent": "scanner-input", "dataType": "string", "source": "input", "required": true, "group": "Identify", "displayOrder": 10},
    {"key": "rack_id", "label": "Rack", "dataType": "reference", "uiComponent": "rack-selector", "source": "input", "required": true, "editable": true, "defaultValue": "derived:p17_rack", "group": "Location", "displayOrder": 20},
    {"key": "row_id", "label": "Row", "dataType": "reference", "uiComponent": "row-selector", "source": "input", "required": true, "editable": true, "group": "Location", "displayOrder": 21},
    {"key": "bin_id", "label": "Bin", "dataType": "reference", "uiComponent": "bin-selector", "source": "input", "required": true, "editable": true, "group": "Location", "displayOrder": 22},
    {"key": "map_remarks", "label": "Remarks", "uiComponent": "textarea", "dataType": "string", "source": "input", "editable": true, "group": "Location", "displayOrder": 30}
  ],
  "documents": [],
  "validationRules": [
    {"code": "P17_COMPLETED", "ruleType": "prerequisite", "expression": {"type": "prerequisite", "process": "P17", "status": "MOVED_TO_RACK"}, "severity": "error", "blocking": true, "message": "Process 17 (move to CBFC rack) must be completed first"},
    {"code": "BIN_BELONGS_TO_ROW_RACK", "ruleType": "custom", "expression": {"type": "custom", "fn": "bin_in_row_and_rack"}, "severity": "error", "blocking": true, "message": "Selected bin is not in the chosen row/rack"},
    {"code": "BIN_ACTIVE", "ruleType": "custom", "expression": {"type": "custom", "fn": "bin_active"}, "severity": "error", "blocking": true, "message": "Selected bin is not active"},
    {"code": "BIN_OCCUPANCY_OK", "ruleType": "bin_free", "expression": {"type": "bin_free", "target": "field:bin_id", "rule": "respect_occupancy"}, "severity": "error", "blocking": true, "message": "Selected bin cannot accept this box (occupancy rule)"},
    {"code": "RRB_NOT_DUPLICATE", "ruleType": "custom", "expression": {"type": "custom", "fn": "not_already_mapped_here"}, "severity": "error", "blocking": true, "message": "This box is already mapped to this bin"}
  ],
  "hooks": [ {"trigger": "on_enter:STORED", "fn": "warehouse.map_rrb", "args": {"movementType": "RRB_MAP"}} ]
}
```

### A.4 Adding a future Process 19 — worked example
To add **Process 19 – Data Stored in DB** (or any real step) with **no source-code change**:
1. `POST /workflow/processes/config` (or add `p19.json` to the seed) with: `code:"P19"`, fields (each with `source`), `validationRules`, `documents`, `statuses`, `transitions`, `roles`, `prerequisites: [{requiresProcessCode:"P18", requiresStatusCode:"STORED"}]`.
2. If it needs a side-effect, register a hook name that already exists, or add a hook fn in a module and reference it by name (the only case needing a backend deploy — and it's additive, not a redesign).
3. Seed any new `document_type` / `permission` / `role` rows it references.
4. Result: P19 appears in `/workflow/processes`, renders in `DynamicForm`, enforces its prerequisite on P18, validates, transitions, audits — identically to P6/P17/P18.

---
*End of blueprint. Treat every **[OPEN-Qnn]** as a gating dependency on Titan per `requirements.md` §67 and the source-of-truth rule.*

