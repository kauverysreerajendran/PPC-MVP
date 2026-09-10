# PPC-WIM / CBE PPC Inventory Traceability System --- Project Requirements & Knowledge Base

> **Purpose:** This document is the consolidated project knowledge base
> for development of the Titan CBE PPC-WIM (Production Planning &
> Control --- Warehouse Inward Management) system. It consolidates the
> supplied RFQ/project-premises document, business workflow/proposal,
> project overview PPT, inward DFD, architecture diagram, workflow
> spreadsheet, delivery challan samples, QED audit report sample, and
> operational emails.
>
> **Important source rule:** Where the supplied documents differ or are
> ambiguous, this document preserves the source terminology and records
> the difference rather than silently inventing a resolution. SAP
> field/API mappings, exact interfaces, and final workflow decisions
> must be confirmed with Titan.

------------------------------------------------------------------------

## 1. Project Identity

-   Organization: Titan Company Limited
-   Location/context: CBE / Coimbatore Manufacturing Division / CBE Case
    Plant / SS Case Plant context as shown in the supplied documents.
-   Project number: **26012**
-   Project title: **CBE- PPC Inventory Traceability System**
-   Functional/system name used in project material: **PPC-WIM / PPC
    Warehouse Inward Management**
-   RFQ/project-premises edition: **00**
-   Project-premises publication date: **22-05-2026**
-   RFQ prepared by: **Santhosh Raj V**
-   Workflow/proposal document: **Business Workflow & Project Proposal
    Document**
-   Proposal version: **1**
-   Proposal prepared by: **Pinesphere Team**
-   Project overview PPT title: **PPC Whare House Management**
-   Project manager in PPT: **Kumarvel P**
-   Execution in PPT: **Santhosh Raj V**

The project-premises document states that the objective is to digitize
the PPC & Stores workflow currently executed manually using DC
documents, SAP transactions and physical verification.

------------------------------------------------------------------------

# 2. Business Background

Titan Company Limited's Coimbatore Manufacturing Division follows a
subcontracting model for watch component processing.

Current high-level business flow:

1.  Semi-finished material is sent to approved external vendors.
2.  Vendor processes the material.
3.  Processed material returns to Titan's warehouse.
4.  Material undergoes quality inspection.
5.  Inward entry is performed.
6.  SAP goods receipt / quality / transfer transactions are performed.
7.  Material is stored in the warehouse.
8.  Material is later issued toward production/assembly.

The current process uses: - Paper delivery challans. - Manual Excel
audit sheets. - Physical counting. - Manual SAP entries. - Manual
rack/location searching. - Email-based communication and verification.

The stated impacts are: - Lack of traceability in storage. - Frequent
errors. - Delayed SAP updates. - Misplaced material. - Reconciliation
delays. - Difficulty identifying component location. - Quantity
mismatch. - Component mix-up.

The PPC-WIM application is intended to bring the process into a digital,
traceable workflow.

------------------------------------------------------------------------

# 3. Project Objectives

The supplied project-premises document specifies the following
objectives:

-   QR code-based tracking.
-   Real-time dashboard visibility.
-   SAP integration for movements 101, 321 and 313.
-   Elimination/reduction of:
    -   Rack searching.
    -   Manual counting.
    -   Excel tracking.
    -   Physical document matching.
-   Improve accuracy.
-   Reduce component search time.
-   Avoid mix-ups.
-   Enable real-time inventory visibility by location.
-   Provide 100% material traceability.
-   Keep physical and system records aligned.

The project overview also identifies: - Component-location
identification. - Manual-documentation replacement. - Quantity mismatch
in tray. - Component mix-up identification.

Quantity mismatch and component mix-up are explicitly described as
planned for a later phase in the proposal document; they should not be
assumed to be part of the initial MVP unless Titan confirms otherwise.

------------------------------------------------------------------------

# 4. Problem Statements

## PS-01 --- Identifying component in CBFC location

### Current problem

It is difficult to track dispatched quantity versus received quantity.

### Current impact

-   Manual Excel tracking.
-   Reconciliation delays.

### Proposed solution

-   Assign a barcode-based Box UID to each box.
-   Track batch, lot, model, quantity and vendor from dispatch through
    storage.
-   Capture split quantity and storage location against the delivery
    challan.

## PS-02 --- Manual document verification

### Current problem

-   Job card may be missing.
-   Human error in matching.
-   Missing shortage flags.
-   Duplicate verification effort.
-   Delayed inward processing.

### Proposed solution

Auto-match: - Delivery Challan. - Job Card. - QED Audit Sheet. - SAP
data.

The match is initiated through barcode/Box UID scanning.

The system must generate an alert when a mismatch is detected.

Document list identified by the proposal: - DC. - Job Card. - QED Audit
Sheet. - Vendor Dispatch Mail. - Input to Polishing / Plating Stock
Mail. - SAP PO / Stock Movement Data.

## PS-03 --- Quantity mismatch in tray

### Impact

-   Incorrect shortage reporting.
-   Wrong vendor accountability.
-   No FIFO-based shortage view.

### Source status

**Planned for next phase.**

## PS-04 --- Component mix-up

### Impact

-   Mixed components across lots.
-   Incorrect assembly risk.
-   Loss of traceability.

### Source status

**Planned for next phase.**

------------------------------------------------------------------------

# 5. Core Digital Principle

## Single White Box Scan → Auto Fetch → Auto Validate → Material Inward

The vendor continues its existing manual process and does not require
new vendor-side software.

The proposal states that the only vendor-side change is the addition of
two new columns to the existing QED Audit Sheet:

1.  White Box QR / Box UID.
2.  Number of Trays.

The **Box UID is the common key** linking: - White Box. - QED Audit
Sheet. - Delivery Challan. - SAP PO / SAP-related records. -
Inventory/storage record.

The receiving operator should be able to scan the White Box barcode once
and retrieve the related business information on one screen.

------------------------------------------------------------------------

# 6. Vendor / External Process

## Existing process

1.  Titan dispatches material to the vendor with the Delivery Challan /
    Titan Challan No.
2.  Vendor performs the external processing such as polishing/plating.
3.  After Titan QC / relevant quality process, material is packed into
    White Boxes.
4.  A printed barcode label containing the Box UID is pasted on each
    White Box.
5.  Vendor fills the QED Audit Sheet.
6.  Vendor provides dispatch details through email.
7.  Vendor sends the material to Titan/Sub-Con receiving.

## Vendor-side system principle

-   No new vendor software is required.
-   Existing manual vendor processes continue.
-   The White Box UID becomes the digital linkage key.
-   Dispatch email can contain the Box UID and Titan Delivery Challan
    mapping.

------------------------------------------------------------------------

# 7. White Box UID / Barcode Requirements

## 7.1 Barcode design principle

Each White Box carries one barcode label.

The barcode encodes **only the Box UID**.

The barcode must NOT directly encode: - Vendor name. - Material
number. - Quantity. - SAP PO. - DC number. - Dates. - Other business
information.

Business information is retrieved from the application database after
the Box UID is scanned.

## 7.2 Why only Box UID is encoded

This keeps the barcode: - Compact. - Easy to print. - Easy to scan with
industrial handheld scanners. - Independent of business-data changes.

A change in quantity, verdict, or storage location must not require the
barcode label to be reprinted.

One Box UID uniquely identifies one White Box.

------------------------------------------------------------------------

# 8. Auto-Retrieved Information After Box UID Scan

The proposal provides the following sample structure:

  \#   Field              Sample
  ---- ------------------ ----------------------
  01   Box UID            BX-260615-01
  02   Titan Challan No   3003064602
  03   Vendor             KALAI Industries
  04   Vendor DC No       KRCC-144
  05   SAP PO No          4500067891
  06   Material No        2777SAA02
  07   Model              2777SAA02
  08   Part               CC
  09   Description        Watch Case Component
  10   Batch No           B240615001
  11   Lot No             LOT-01
  12   Quantity           74
  13   Accepted Qty       74
  14   Rework Qty         0
  15   Verdict            Accepted
  16   SAP Movement       101
  17   Storage Rack       Rack-A12
  18   Shelf              S03
  19   Bin                BIN-07
  20   QC Inspector       Manivasagam
  21   Packing Date       15-Jun-2026

These are proposal/sample values and must not be treated as the final
Titan SAP/API schema without confirmation.

------------------------------------------------------------------------

# 9. Documents That Must Be Linked

The system must be capable of linking, at minimum:

-   Delivery Challan.
-   Job Card.
-   QED Audit Sheet / QED Audit Confirmation Report.
-   Vendor Dispatch Mail.
-   Input to Polishing / Plating Stock Mail.
-   SAP Purchase Order data.
-   SAP stock movement data.
-   Box UID.
-   Storage location.
-   Inward/QC/posting records.

The proposal explicitly describes the Box UID as the single common key
connecting the White Box, Audit Sheet, Delivery Challan and SAP PO.

------------------------------------------------------------------------

# 10. Inward DFD --- Process Definition

The supplied inward DFD contains **19 numbered processes** and data
stores D1--D14.

## Main inward flow

### Process 1 --- Input Form (Polishing Vendor)

External entity: Polishing Vendor\
Data store: D1 --- PPC Application Database

Purpose: - Receive/input vendor-side information into the application.

### Process 2 --- Titan Gate Security Check

External entity: Titan Gate Security

Purpose: - Gate/security verification.

### Process 3 --- Reach to Subcon

External entity: Sub-Con / Titan (All Sub-Con)

Purpose: - Material reaches subcontractor receiving area.

### Process 4 --- Unloading

Purpose: - Unload incoming material.

### Process 5 --- Security Check / Seal

External entity: Titan Gate Security\
Data store: D2 --- PPC Application Database

Purpose: - Security/seal verification.

### Process 6 --- Refer DC Doc and Mail Reference Verification

Data store: D3 --- PPC Application Database

Purpose: - Verify delivery-challan document and mail references. - This
is one of the explicitly selected MVP processes.

### Process 7 --- Mail Reply to Vendor

Purpose: - Send/reply to vendor regarding verification/deviation. -
Conditional linkage to deviation handling.

### Process 8 --- SAP Inward 101

Purpose: - Perform SAP inward / goods receipt transaction 101.

### Process 9 --- Mail Communication to QA

External entity: QA Team

Purpose: - Communicate material/document status to QA.

### Process 10 --- QD Posting by QA (321)

External entity: QA Team\
Data store: D4 --- PPC Application Database

Purpose: - QA performs QD / quality decision posting using SAP movement
321.

### Process 11 --- Bin Transfer CBSC to CBFC

External entity: Store Team\
Data store: D5 --- PPC Application Database

Purpose: - Initiate/record bin transfer from CBSC to CBFC.

### Process 12 --- Inward SAP 313

Data store: D6 --- PPC Application Database

Purpose: - SAP 313 stock transfer.

### Process 13 --- SAP 313 Print Out, Attach with Box

Data store: D7 --- PPC Application Database

Purpose: - Generate/record SAP 313 printout and attach it with the box.

### Process 14 --- Communication to CBFC Team

Purpose: - Communicate material transfer to CBFC team.

### Process 15 --- CBFC Team Verification at CBSC

External entity: CBFC Team\
Data store: D8 --- PPC Application Database

Purpose: - CBFC team verifies material at CBSC.

### Process 16 --- Signature by CBFC and CBSC

Data store: D9 --- PPC Application Database

Purpose: - Capture/record confirmation/signature.

### Process 17 --- Move to CBFC Rack

External entity: Store Team

Purpose: - Physically move material to CBFC rack. - Explicit MVP
process.

### Process 18 --- Rack Row Bin Mapping

External entity: Store Team\
Data store: D10 --- PPC Application Database

Purpose: - Record exact rack/row/bin mapping. - Explicit MVP process.

### Process 19 --- Data Stored in DB

Data store: D11 --- PPC Application Database

Purpose: - Persist final traceability data.

------------------------------------------------------------------------

# 11. DFD Conditional Sub-Process A --- Deviation Handling

The DFD shows a conditional deviation loop triggered around Process 6.

Flow:

**Mark in the DC → Mail to Vendor → Vendor Response / Accept the
Deviation → Revised DC Validation**

Data store: - D12 --- PPC Application Database.

Expected business use: - Mismatch or deviation is identified. -
Deviation is marked. - Vendor is contacted. - Vendor responds/accepts. -
Revised DC is validated. - The outcome is recorded.

Deviation types identified elsewhere in the supplied documents
include: - Shortage. - Excess. - Wrong model.

------------------------------------------------------------------------

# 12. DFD Conditional Sub-Process B --- Plating Loop

The DFD shows a plating loop:

**Splitting for Plating Process → To Plating Vendor SAP 541 → Plating
Process**

External entity: - Plating Vendor.

Data store shown: - D14 --- PPC Application Database.

The proposal further explains: - Accepted polished material may become
eligible for plating. - Sub-Con team generates the DC and dispatches
material to plating vendor. - Original stock number is used when sent
for plating. - Material returns with an `/R` version after plating. -
Plating receipt must be scanned/recorded for traceability.

Example: - Original: `10017WCB02` - Returned: `10017WCB02/R`

------------------------------------------------------------------------

# 13. MVP Scope

For the initial MVP, the explicitly selected DFD processes are:

## MVP Process 6 --- Refer DC Doc and Mail Reference Verification

The MVP should support:

1.  Receive/identify the incoming box/transaction.
2.  Scan/read the Box UID where applicable.
3.  Fetch linked delivery-challan information.
4.  Fetch mail reference information.
5.  Fetch linked SAP PO / SAP material data.
6.  Display relevant documents/data together.
7.  Validate document relationships.
8.  Detect mismatch.
9.  Raise deviation when required.
10. Persist the verification result.
11. Support the deviation loop:

-   Mark in DC.
-   Mail vendor.
-   Vendor response/acceptance.
-   Revised DC validation.

## MVP Process 17 --- Move to CBFC Rack

The MVP should support:

1.  Identify the box/material.
2.  Verify that it is eligible for storage movement.
3.  Identify target CBFC rack.
4.  Record the movement.
5.  Maintain timestamp/user traceability.
6.  Prevent/flag movement if prerequisites are not satisfied.
7.  Update the current material status/location.

## MVP Process 18 --- Rack Row Bin Mapping

The MVP should support:

1.  Define rack/row/bin master data.
2.  Identify the box/material using Box UID.
3.  Scan/identify target rack/row/bin.
4.  Validate location.
5.  Assign the box/material to the location.
6.  Persist exact location.
7.  Make the location searchable.
8.  Provide location visibility on the dashboard.
9.  Maintain audit history for location changes.

------------------------------------------------------------------------

# 14. Current Process Flow From Project Overview Spreadsheet

The supplied workflow spreadsheet identifies:

-   Plant: CBE case plant.
-   Locations: PPC, Polishing Vendor.
-   Finished-good/component categories include:
    -   Case center.
    -   Bezzle Ring.
    -   Back cover.
    -   Oring.
    -   Gasket.
    -   Pushbutton.
    -   Screws.
    -   Pin & bar.
-   Process/source categories include:
    -   IND.
    -   IMP.
    -   Polishing.
    -   Machining.
    -   Plating.

The spreadsheet describes the operational sequence including:

1.  Input from vendor.
2.  Mail document to SC / PPC.
3.  Gate/security check.
4.  Box/bundle handling.
5.  Security seal.
6.  Vehicle travel.
7.  Audit sheet copy.
8.  Physical verification.
9.  Component variant-wise verification.
10. Compare against DC document.
11. Identify abnormal conditions:
    -   Shortage.
    -   Excess.
    -   Wrong model.
12. Manual verification.
13. Document matching.
14. Mail to vendor.
15. Vendor response.
16. Revised document/reply.
17. Inward --- 101 in SAP.
18. QD posting by QA --- SAP 321.
19. Bin-to-bin transfer --- CBSC to CBFC --- SAP 313.
20. Printout from SAP after SAP 313.
21. Attach document with box.
22. Communicate to CBFC team, including over phone.
23. CBFC team verification at CBSC.
24. Signature by CBFC + CBSC.
25. Move to CBFC location by hand.
26. Placing at input area.
27. Check document against model/variant.
28. Physically verify space availability.
29. If space is unavailable, material may be kept outside the rolling
    rack according to the current manual process.
30. If space is available, take/put material by hand.
31. Manual rack-location checking for put list/pick list using sheet
    reference.
32. Manual component-location search.
33. No current visibility for component availability versus location.
34. Manual physical storage-location verification.
35. Wrong-location risk and high search time.
36. Mix-up risk.
37. Search model/variant.
38. Roll the rack.
39. Go to particular location.
40. Pick material.
41. Set matching.
42. Handover to CA.

The spreadsheet also records input timing examples: - Morning: 12:00. -
Evening: 17:00.

These timings should be treated as source operational examples and not
hard-coded until Titan confirms the production schedule.

------------------------------------------------------------------------

# 15. Storage / Location Management Requirements

## RRB model

The proposal requires a **Rack--Row--Bin (RRB)** mapping system.

The system should: - Define rack master. - Define row/shelf structure
where applicable. - Define bin master. - Assign QR codes to bins. -
Assign QR codes to rack/storage zones where required. - Record exact
material location. - Provide location visibility. - Support
system-suggested put-away. - Avoid manual searching.

The project overview specifically describes: - Assign QR to each bin,
rack and storage zone. - System suggests auto put-away. - Exact location
is stored digitally.

------------------------------------------------------------------------

# 16. Poka-Yoke / Error-Proofing Requirements

The RFQ states that the system must prevent or flag:

-   Wrong material inward.
-   Wrong location storage.
-   DC versus physical mismatch.
-   Incorrect picking.
-   Duplicate entries.

Additional Poka-Yoke requirements: - Alert on mismatch. - Block
incorrect SAP posting. - Restrict wrong-location storage.

Quality/system objectives: - 100% traceability of material. - Zero
mismatch between physical and system records. - Real-time updates.

------------------------------------------------------------------------

# 17. Document Verification Requirements

At receiving, the application should make it possible to retrieve and
compare:

-   Box UID.
-   Titan DC number.
-   Vendor DC number.
-   Vendor.
-   Material.
-   Model.
-   Batch.
-   Lot.
-   Quantity.
-   Accepted quantity.
-   Rework quantity.
-   Verdict.
-   SAP PO.
-   SAP movement.
-   Relevant mail reference.
-   QED audit information.

The application should show linked records in one screen where the
relationship is available.

Example from the proposal:

### Box

`BX-260615-01`

### Audit

-   Vendor: KALAI
-   Model: 2777SAA02
-   Accepted: 74
-   Rework: 0
-   Verdict: Accepted

### Delivery Challan

-   Vendor DC: KRCC-144
-   Titan DC: 3003064602
-   Qty: 74
-   Output Stock: WB-2777
-   Remarks: NIL

### SAP

-   PO: 4500067891
-   Material: 2777SAA02
-   Description/part context: CC
-   Vendor: KALAI
-   SAP Qty: 74

Expected result: **One screen → auto validation → material inward.**

------------------------------------------------------------------------

# 18. SAP Integration Requirements

The supplied documents identify SAP movements:

-   **101** --- SAP inward / Goods Receipt against PO.
-   **321** --- Quality decision / QD posting.
-   **313** --- Bin-to-bin / stock transfer from CBSC to CBFC in the
    stated workflow.
-   **261** --- Assembly issue in the proposal.
-   **541** --- Plating vendor flow in the DFD/proposal.

The proposal describes SAP integration as a FastAPI integration layer.

## SAP information identified by the project material

The proposal explicitly identifies data flowing from SAP to the
application, including:

-   PO.
-   Material.
-   Batch.
-   Model.
-   Quantity.
-   Vendor.
-   Titan DC No.
-   Stock movement information.

The sample auto-retrieval table additionally identifies: - SAP PO No. -
SAP Movement. - Material No. - Batch No. - Quantity.

## Important implementation rule

Do **not** assume that the sample business fields are the exact Titan
SAP technical fields.

The application must use a configurable SAP mapping layer so that: -
Titan's actual API field names can be mapped to application field
names. - Custom SAP fields can be supported. - SAP
API/version/configuration changes do not require changes throughout the
business layer.

Titan is responsible in the supplied proposal/RFQ for providing: - SAP
access. - SAP process details. - Current workflow. - Master data. - SAP
integration details/support.

------------------------------------------------------------------------

# 19. SAP ↔ Application Integration Pattern

The supplied architecture diagram specifies:

## Layer 1 --- Application & Integration

**PPC-WIM Application** - On-premise VM. - Next.js. - FastAPI. -
PostgreSQL.

Connected to:

**Titan SAP System (ERP)**

Integration: - SAP API / Integration.

## Layer 2 --- Service Layer

**FastAPI Validation / Processing** - DC / PO Match. - Deviation
Check. - Business Rules.

**Firewall** - Restricts unauthorized network access.

**PostgreSQL** - Traceability DB. - Installed in Titan VM.

## Layer 3 --- API Gateway

**API Gateway** - Single entry point for all field scans.

## Layer 4 --- Field / Scan Layer

-   Mobile Handheld Scanner:
    -   With display.
    -   Wi-Fi (Titan network).
-   Bluetooth Scanner:
    -   No display.
    -   Connects via Bluetooth.
-   Operator Stations:
    -   Windows PC.
-   Barcode Printer:
    -   Box UID labels.

## Shop Floor / OT

The architecture identifies the shop-floor / OT environment as the
physical operating environment containing scanners, operator stations
and other field devices used by operators, QA, Stores and other teams.

------------------------------------------------------------------------

# 20. Technology Stack

The proposal states:

  Layer             Technology
  ----------------- ---------------------------
  Architecture      Microservice Architecture
  Frontend          Next.js
  Backend / API     FastAPI (Python)
  Database          PostgreSQL
  SAP Integration   FastAPI
  Authentication    JWT (Role-based)
  Hosting           On-premise

The architecture diagram also shows: - On-premise VM. - API Gateway. -
FastAPI validation/processing. - PostgreSQL traceability DB. -
Firewall. - SAP ERP integration. - Field scanners. - Windows operator
stations. - Barcode printer.

------------------------------------------------------------------------

# 21. Recommended Logical Microservices

The source documents require microservice architecture but do not define
a final service decomposition. The following is an implementation
organization derived from the documented responsibilities; it should be
confirmed during detailed architecture design.

Suggested services:

1.  **API Gateway**
    -   Single entry point.
    -   Authentication/token validation.
    -   Routing.
2.  **Authentication / User Service**
    -   JWT.
    -   Role-based permissions.
    -   User management.
3.  **SAP Integration Service**
    -   SAP API calls.
    -   SAP field mapping.
    -   Read/write transaction orchestration.
    -   SAP error handling.
    -   Integration audit.
4.  **Material / Traceability Service**
    -   Material.
    -   Box UID.
    -   Batch.
    -   Lot.
    -   Quantity.
    -   Vendor.
    -   Trace history.
5.  **Document Verification Service**
    -   DC. 
    -   PO.
    -   QED.
    -   Mail references.
    -   Document matching.
    -   Mismatch detection.
6.  **Deviation Service**
    -   Shortage.
    -   Excess.
    -   Wrong model.
    -   Vendor response.
    -   Revised DC validation.
    -   Deviation history.
7.  **QC / Quality Service**
    -   QED.
    -   Accepted quantity.
    -   Rework quantity.
    -   Verdict.
    -   Inspector.
    -   QA status.
8.  **Location / Warehouse Service**
    -   Rack.
    -   Row.
    -   Bin.
    -   Storage zones.
    -   QR location mapping.
    -   Occupancy.
    -   Current location.
9.  **Movement / Workflow Service**
    -   Inward.
    -   313 transfer.
    -   Rack movement.
    -   Workflow state transitions.
10. **Notification Service**
    -   Vendor email.
    -   Internal notifications.
    -   QA/Store/CBFC communication.
    -   Notification history.
11. **Reporting / Dashboard Service**
    -   Inventory by location.
    -   Inward/outward.
    -   Pending verification.
    -   Deviations.
    -   Vendor responses.
    -   Traceability reports.

------------------------------------------------------------------------

# 22. Suggested Core Data Model

The documents do not prescribe exact PostgreSQL table names. A logical
model should cover at least:

## Vendor

-   vendor_id
-   vendor_code
-   vendor_name
-   contact details
-   status

## Material

-   material_id
-   material_no
-   model_no
-   part
-   description
-   batch_no
-   lot_no
-   UOM
-   material status

## Purchase Order

-   po_id
-   sap_po_no
-   vendor
-   plant
-   PO item
-   material
-   ordered quantity
-   status

## Delivery Challan

-   dc_id
-   titan_challan_no
-   vendor_dc_no
-   dc_date
-   vendor
-   PO
-   material
-   quantity
-   reference document
-   status

## Box

-   box_id
-   box_uid
-   DC
-   material
-   batch
-   lot
-   quantity
-   packing date
-   current status

## QED Audit

-   audit_id
-   box_uid
-   vendor
-   audit date
-   inspector/audit incharge
-   model
-   part
-   inspected quantity
-   accepted quantity
-   rework quantity
-   OD
-   PD
-   verdict
-   tray count

## Deviation

-   deviation_id
-   box_uid
-   DC
-   deviation type
-   expected quantity
-   received quantity
-   difference
-   remarks
-   vendor response
-   acceptance
-   revised document reference
-   status
-   timestamps

## SAP Transaction

-   transaction_id
-   box_uid
-   SAP document reference
-   movement type
-   PO
-   material
-   quantity
-   posting date
-   status
-   request/response reference
-   error message
-   timestamps

## Location Master

-   location_id
-   storage zone
-   rack
-   row
-   shelf
-   bin
-   QR identifier
-   occupancy status
-   capacity if confirmed

## Box Location History

-   history_id
-   box_uid
-   from_location
-   to_location
-   movement type
-   scanned_by
-   timestamp

## Workflow Event / Audit Trail

-   event_id
-   box_uid
-   process number
-   event type
-   previous status
-   new status
-   user
-   device
-   timestamp
-   remarks

## Notification

-   notification_id
-   type
-   recipient
-   reference
-   message/status
-   sent timestamp
-   delivery status

------------------------------------------------------------------------

# 23. Workflow State Model

The final application should maintain a traceable status rather than
relying only on individual screen flags.

Possible source-aligned states include:

-   CREATED / INPUT
-   GATE_CHECKED
-   UNLOADED
-   SECURITY_VERIFIED
-   DOCUMENT_VERIFICATION_PENDING
-   DOCUMENT_VERIFIED
-   DEVIATION_RAISED
-   VENDOR_RESPONSE_PENDING
-   DEVIATION_ACCEPTED
-   REVISED_DOCUMENT_PENDING
-   REVISED_DOCUMENT_VALIDATED
-   SAP_101_POSTED
-   QA_PENDING
-   SAP_321_POSTED
-   BIN_TRANSFER_PENDING
-   SAP_313_POSTED
-   CBFC_VERIFICATION_PENDING
-   CBFC_VERIFIED
-   SIGNATURE_COMPLETED
-   MOVING_TO_RACK
-   LOCATION_ASSIGNED
-   STORED
-   ISSUED

These are logical application states; Titan must confirm the final
business status names.

------------------------------------------------------------------------

# 24. Physical Scanning Requirements

The system must support scanning at: - Inward. - Transfer. - Material
issue. - Rack/bin mapping. - Other field points defined in the final
workflow.

Scanner options in the proposal: - TVSE BS512 Series Wireless Scanner: -
Quick barcode scanning at inward, transfer and material issue points. -
TVSE K8 Scanner with Display: - Scan, view, verify and update
application data directly on device. - TVSE DT48 Barcode Label
Printer: - Print Box UID and material-identification labels.

The architecture diagram also describes: - Mobile handheld scanner with
display. - Bluetooth scanner without display. - Windows operator
stations. - Barcode printer.

------------------------------------------------------------------------

# 25. Dashboard Requirements

The RFQ explicitly requires visibility for:

-   Material availability by location.
-   Inward / outward status.
-   Pending verification.
-   Deviation tracking.
-   Vendor response logs.

The dashboard should also support the core traceability objective: -
Search by Box UID. - Search by material/model. - Search by vendor. -
Search by DC. - Search by PO. - Search by rack/row/bin. - View material
movement history.

Additional analytics must be confirmed during detailed requirements.

------------------------------------------------------------------------

# 26. User Interface Requirements

The RFQ requires: - Simple UI for operators. - Multi-user access. -
Role-based permissions.

The system is intended for: - Operators. - QA. - Stores. - PPC. - CBFC
team. - Admin/users as required.

Role names and exact permissions must be confirmed with Titan.

------------------------------------------------------------------------

# 27. Role / Responsibility Model

Source-defined or source-implied actors:

## Vendor / Supplier

-   Vendor processing.
-   Packing.
-   Box UID labeling.
-   QED Audit Sheet.
-   Dispatch details.
-   Vendor response to deviations.

## Titan Gate Security

-   Gate/security check.
-   Security/seal verification.

## PPC

-   Process coordination.
-   Document verification.
-   Vendor communication.
-   Workflow monitoring.

## QA / QED

-   Quality verification.
-   QED audit.
-   Quality decision.
-   SAP 321 posting.

## Store Team

-   Bin transfer.
-   CBFC movement.
-   Rack allocation.
-   Location mapping.

## CBFC Team

-   Verification at CBSC.
-   Confirmation/signature.

## Admin

-   User management.
-   Master data/configuration.
-   Access management.

------------------------------------------------------------------------

# 28. Notification / Email Requirements

The current process uses email heavily.

The application should support integration with the mail system for: -
Vendor deviation notification. - Vendor response tracking. - Dispatch
reference. - Internal QA communication. - Store/CBFC communication where
applicable.

The RFQ explicitly lists **mail system integration** as an interfacing
requirement.

All important outgoing/incoming application-linked communications should
be auditable.

------------------------------------------------------------------------

# 29. Traceability Requirements

The system must provide end-to-end traceability across:

**PPC → Vendor/Sub-Con → Receiving → QC → SAP → CBSC → CBFC → Rack/Bin →
Production/Assembly**

The proposal explicitly requires tracking: - Box UID. - DC. - PO. -
Audit. - Inward. - QC. - Posting. - Rack.

The material trace should allow a user to answer: - Which vendor sent
it? - Which DC? - Which PO? - Which material/model? - Which batch/lot? -
What quantity was expected? - What quantity was accepted? - What was the
verdict? - Which SAP movement was posted? - Where is the material now? -
Who performed the action? - When was it performed? - What was the
previous location/status?

------------------------------------------------------------------------

# 30. FIFO Requirements

The proposal states that FIFO order is maintained based on the Titan DC
No.

The application should therefore retain: - DC date/sequence. - Receipt
date/time. - Storage date/time. - Location. - Quantity.

FIFO rules should be configurable/confirmed with Titan before
implementation.

------------------------------------------------------------------------

# 31. Physical Verification

Current process: - Physical verification against DC. -
Component/model/variant-wise checking. - Quantity verification. -
Mismatch identification.

The digital process should: - Retrieve expected information. - Allow
operator to scan material/box. - Compare expected and received
information. - Highlight mismatch immediately. - Record verification
result. - Require appropriate action when mismatch exists.

The project overview also mentions a future/possible Vision System
for: - Component counting. - Document scanning.

This must not be assumed as an MVP dependency unless separately
approved.

------------------------------------------------------------------------

# 32. Delivery Challan Data --- Sample Observed Fields

The supplied scanned Delivery Challans show fields including:

Header: - Delivery Challan. - Original Copy. - Vendor / supplier name. -
Vendor GST No. - Vendor PAN No. - SLA/PO Number. - DC No. - Date. -
State Code. - Contact No. - SAC Code. - Recipient / Titan destination. -
Mode of Dispatch. - Date & Time of Issue. - Reference No. - Nature of
Process.

Line-level fields: - S.No. - Stock No. - Batch. - HSN Code. -
Description of Goods. - Quantity. - Unit. - Value. - Tax.

Footer: - Total Qty. - Total Value. - Prepared By. - Checked By. -
Received By. - Authorised Signatory. - Place. - Date. - Processing
duration. - Part-II process/return information.

### Sample scanned challan 1

Vendor: - KALAI INDUSTRIES.

Titan destination: - M/S. TITAN COMPANY LIMITED SS CASE PLANT,
KALLAPALAYAM, SULUR (TK), COIMBATORE.

Observed values include: - Vendor Code: 6001314. - SLA/PO Number:
801005439. - DC No: KRCC-144. - Date: 2026-06-15. - State Code: 33.

Line examples include output stock numbers, HSN code 9111, challan
numbers, challan dates, quantities, remarks and total prices.

The total shown on this scanned challan is: - Total quantity: 2140. -
Total value: 708986.71.

These scanned values are sample source data, not master data.

### Sample scanned challan 2

Observed: - Vendor Code: 6001314. - SLA/PO Number: 801005522. - DC No:
KPL-0046. - Date: 2026-06-15. - State Code: 33.

Line example: - Output Stock No: 1043SBD02/R. - HSN Code: 9111. -
Challan No: 3003062832. - Challan Date: 2026-05-08. - Quantity: 9. -
Remark: PLATING REWORK COMPLETED.

Total: - Quantity: 9. - Value: 2581.29.

------------------------------------------------------------------------

# 33. QED Audit Report --- Sample Observed Structure

The supplied QED Audit Confirmation Report is titled:

**TCL --- QED Audit Confirmation Report --- SS Plant**

Observed fields:

Header: - Vendor. - Date. - Audit Incharge. - Function: QED.

Table: - S.No. - Model No. - Part. - Inspected. - Accepted. - Rework. -
OD. - PD. - Verdict.

The proposal adds/uses: - Box UID. - Number of Trays.

The source proposal explicitly states that grey-shaded columns are
existing and that Box UID is the White Box barcode linking the audit
record to the Delivery Challan and SAP.

The scanned sample contains handwritten model numbers/parts and accepted
quantities, along with QED stamps/signatures.

------------------------------------------------------------------------

# 34. Operational Email --- Dispatch Details

A supplied email titled:

**Dispatch Details as on 16-06-2026 Evening**

states that as of 16-06-2026, models and quantities had been dispatched
and requests the receiver to acknowledge receipt and confirm whether
quantities are correct or whether there is shortage/excess.

The dispatch email table fields are:

-   DC Date.
-   DC No.
-   OUTPUT STOCK No.
-   Challan No.
-   Challan Input Date.
-   Delivery Qty.
-   Input Stock No.
-   PO No.
-   Remarks.

Sample dispatch groups include:

### Total Qty 552

Examples: - 16-06-2026 \| KRCC-152 \| 10017SCB02 \| 3003063702 \|
13-05-2026 \| 9 \| 10017XXB02/20 \| 801005439 \| POLISHING COMPLETED -
16-06-2026 \| KRCC-153 \| 1829SDE02 \| 3003065223 \| 22-05-2026 \| 2 \|
1829XXE02/20 \| 801005439 \| POLISHING COMPLETED - 16-06-2026 \|
KRCC-154 \| 2777SAA02 \| 3003064602 \| 19-05-2026 \| 1 \| 2777XXA02/20
\| 801005439 \| POLISHING COMPLETED - 16-06-2026 \| KRCC-156 \|
1595SAG02 \| 3003056794 \| 02-04-2026 \| 129 \| 1595XXG02/20 \|
801005439 \| POLISHING COMPLETED - 16-06-2026 \| KRCC-156 \| 1595SAG02
\| 3003067715 \| 08-06-2026 \| 377 \| 1595XXG02/20 \| 801005439 \|
POLISHING COMPLETED

### Total Qty 1072

Examples: - 16-06-2026 \| KRCC-155 \| 2819XXA02/20 \| 3003056794 \|
02-04-2026 \| 46 \| 2819XXA02/20 \| 801005439 \| WITHOUT PROCESS -
16-06-2026 \| KRCC-155 \| 2819XXA02/20 \| 3003067968 \| 09-06-2026 \| 25
\| 2819XXA02/20 \| 801005439 \| WITHOUT PROCESS - 16-06-2026 \| KRCC-155
\| 2819XXA02/20 \| 3003069064 \| 15-06-2026 \| 1001 \| 2819XXA02/20 \|
801005439 \| WITHOUT PROCESS

### Total Qty 2

-   16-06-2026 \| KPL-0047 \| 10011SCD02/R \| 3003061021 \| 27-04-2026
    \| 2 \| 10011SCD02/R \| 801005522 \| PLATING REWORK COMPLETED

The operational email demonstrates that the application needs to handle
multiple rows under a DC and multiple stock/challan references.

------------------------------------------------------------------------

# 35. Operational Email --- Input to Polishing

A supplied email titled:

**INPUT TO POLISHING**

asks the team to send input to the polishing vendor.

Part-level summary fields: - PART. - KALAI. - STI. - IYAL. - TOTAL.

Examples: - CASE CENTER: KALAI 2383, STI 455, IYAL 0, TOTAL 2838. -
BEZEL RING: KALAI 2852, STI 0, IYAL 69, TOTAL 2921. - BACK COVER: KALAI
0, STI 0, IYAL 3958, TOTAL 3958.

The operational planning table fields are: - SI.NO. - POLISHING STOCK. -
INPUT STOCK. - VENDOR. - VENDOR WIP. - REQ INPUT TILL OPEN. - INPUT NEED
(Bin WIP). - REMARKS.

The supplied sample contains 19 planning rows, including examples such
as: - 1584SAG02 → 1584XXG02/20 → vendor 6001364. - 10017SDB12/30 →
10017XXB12/20 → vendor 6001362. - 1043SAD12/30 → 1043XXD12/20 → vendor
6001362. - 1830SAA12/30 → 1830XXA12/20 → vendor 6001362. - 2819SAA02 →
2819XXA02/20 → vendor 6001314. - 1828SDB02 → 1828XXB02/20 → vendor
6001314. - 10076SAD04 → 10076XXD04/20 → vendor 6001314.

The sample totals shown are: - Vendor WIP total: 53,930. - Required
input till open total: 162,201. - Input need (Bin WIP) total: 9,717.

A further "Move to bin" section contains: - 10011XXC12/20 --- 14. -
1793XXD02/20 --- 45. - 1828XXB02/20 --- 400.

This email demonstrates that stock planning/input-to-process data is a
real operational source that may need to be integrated or represented in
later modules.

------------------------------------------------------------------------

# 36. Current Manual Warehouse Problems From Spreadsheet

The current warehouse process contains several manual activities:

-   Manual rack location check for put list/pick list.
-   Sheet references.
-   Keeping material wherever space is available outside rolling rack.
-   Manual movement by hand.
-   Manual searching for component location.
-   No visibility of component availability versus location.
-   Manual verification of physical storage location.
-   Wrong-location risk.
-   High searching time.
-   Model/variant searching.
-   Rolling racks to find components.
-   Manual picking.
-   Manual matching.
-   Handover to CA.

Digital solution goals: - Replace paper/DC/checklists where feasible. -
QR-based document linking. - RRB mapping. - Exact location visibility. -
System-assisted put-away. - Variant consistency. - End-to-end material
movement tracking.

------------------------------------------------------------------------

# 37. Security Requirements

The RFQ requires:

-   Secure access control.
-   User roles.
-   User authentication.
-   No unauthorized network access.
-   Firewall controls.
-   Confidentiality of SAP credentials and process flow.
-   NDA compliance.
-   No data sharing outside the organization.

Architecture: - On-premise deployment. - Titan network. - Firewall. -
JWT role-based authentication.

Security testing/vulnerability testing is part of the stated project
responsibilities.

------------------------------------------------------------------------

# 38. Non-Functional Requirements

## Quality

-   100% material traceability.
-   Zero mismatch between physical and system records as the stated
    target.
-   Real-time updates.

## Performance

The RFQ requires real-time updates and operational responsiveness, but
no numeric response-time SLA is defined in the supplied RFQ.

Therefore: - Do not hard-code an unapproved response-time target. -
Define measurable performance SLAs during detailed design/UAT.

## Scalability

-   Scalable architecture.
-   Proposal highlights potential multi-plant rollout.
-   Future MES/IoT consumption postings are identified as possible
    extension.

## Availability

Exact uptime SLA is not specified in the supplied documents and must be
confirmed.

## Auditability

-   Audit trail.
-   Historical data tracking.
-   User/action/timestamp history.
-   SAP integration history.
-   Deviation history.
-   Location history.

------------------------------------------------------------------------

# 39. API Requirements

The architecture requires APIs for:

## Scan

-   Resolve Box UID.
-   Resolve location QR.
-   Resolve material/barcode.

## Document

-   Fetch DC.
-   Fetch PO.
-   Fetch QED.
-   Fetch mail references.

## Validation

-   DC vs PO.
-   DC vs audit.
-   Material vs expected material.
-   Quantity vs expected quantity.
-   Model/variant.
-   Box UID linkage.
-   Duplicate scan/entry detection.

## SAP

-   Read SAP PO/stock information.
-   Post/assist 101.
-   Post/assist 321.
-   Execute/assist 313.
-   Support other confirmed movements.

## Warehouse

-   Assign location.
-   Move location.
-   Validate rack/row/bin.
-   Retrieve current location.
-   Retrieve location history.

## Dashboard

-   Current inventory.
-   Pending items.
-   Deviations.
-   Vendor responses.
-   Storage occupancy/location.

------------------------------------------------------------------------

# 40. API Gateway Requirements

The architecture diagram explicitly identifies the API Gateway as the:

**Single entry point for all field scans.**

Therefore: - Field devices should not directly call multiple internal
services. - Scan requests should enter through the gateway. -
Authentication and authorization should be applied. - The gateway should
route requests to the appropriate service. - Internal services should
remain protected from direct shop-floor access where practical.

------------------------------------------------------------------------

# 41. SAP Data Ownership Principle

The system should distinguish:

### SAP-owned master/transaction data

Examples: - PO. - SAP material. - SAP quantity. - SAP vendor. - SAP
movement/document data.

### PPC-WIM-owned traceability data

Examples: - Box UID. - Box-to-DC linkage. - Scan events. - Rack/row/bin
mapping. - Workflow status. - Deviation history. - User/device audit. -
Notification history.

### Document-source data

Examples: - QED Audit Sheet. - Delivery Challan. - Vendor dispatch
email. - Input-to-polishing email.

The integration layer should reconcile these sources without creating
uncontrolled duplicate master data.

------------------------------------------------------------------------

# 42. Duplicate / Idempotency Requirements

Because the system uses repeated scans and SAP posting, duplicate
protection is required.

The application must: - Detect duplicate Box UID creation. - Detect
duplicate scan events where the workflow does not permit repeat
scanning. - Prevent duplicate inward transactions. - Prevent duplicate
location assignment where prohibited. - Use idempotency/reference keys
for SAP write operations. - Maintain an audit record for rejected
duplicate operations.

------------------------------------------------------------------------

# 43. Exception Handling

The system should explicitly support:

-   Missing Box UID.
-   Unknown Box UID.
-   Missing DC.
-   Missing PO.
-   Missing QED record.
-   Missing mail reference.
-   DC/PO mismatch.
-   Model mismatch.
-   Quantity shortage.
-   Quantity excess.
-   Wrong model.
-   Vendor response pending.
-   Revised document required.
-   SAP API unavailable.
-   SAP posting failure.
-   Duplicate posting.
-   Location unavailable.
-   Invalid rack/row/bin.
-   Box already assigned to another location.
-   Scanner/network unavailable.

Each exception should produce: - User-facing message. - Status. - Audit
event. - Retry/action path where applicable.

------------------------------------------------------------------------

# 44. Master Data Requirements

Titan is expected to provide current master data.

Likely masters include: - Vendor. - Material. - Model. - Part. -
Batch/lot where applicable. - Plant. - Storage location. - Rack. -
Row. - Shelf. - Bin. - Storage zone. - Movement type/configuration. -
User/role. - Process/workflow configuration.

Do not hard-code Titan master values into the application.

------------------------------------------------------------------------

# 45. Reporting Requirements

The source documents identify: - Dashboard analytics. - Material
availability by location. - Inward/outward status. - Pending
verification. - Deviation tracking. - Vendor response logs. - Historical
data tracking.

Suggested reports based on these requirements: - Inward status report. -
Box traceability report. - Location inventory report. - DC vs received
quantity report. - Deviation report. - Vendor response report. - SAP
posting status report. - Rack/row/bin occupancy report. - Material
movement history. - FIFO view.

Final report list must be approved.

------------------------------------------------------------------------

# 46. Proposed Screen/Module Structure

The application can be organized as:

1.  Login.
2.  Dashboard.
3.  **SAP Upload / SAP Data** --- UI naming can be finalized according
    to business preference.
4.  Vendor Outward.
5.  Vendor Notification.
6.  Material Inward.
7.  Box UID Scan.
8.  Document Verification.
9.  Physical Verification.
10. Deviation Management.
11. Vendor Acceptance / Response.
12. SAP GRN 101.
13. Quality Inspection / QD 321.
14. Bin Transfer / SAP 313.
15. Rack Management.
16. Rack Occupancy.
17. Smart Rack Space Suggestion.
18. Material Search.
19. Material Issue.
20. Finished Goods Confirmation.
21. Reports.
22. Notifications.
23. Master Data.
24. User & Role Management.
25. Audit Trail.

The proposal's development phases specifically list: - User
Management. - Vendor Outward. - Vendor Notification. - Material
Inward. - Physical Verification. - Deviation Management. - Vendor
Acceptance. - SAP GRN 101. - Quality Inspection 321. - Bin Transfer
313. - Rack Management. - Rack Occupancy. - Smart Rack Space
Suggestion. - Material Search. - Material Issue. - Finished Goods
Confirmation. - Reports & Dashboard. - Notification Engine.

------------------------------------------------------------------------

# 47. Project Lifecycle From Proposal

## Phase 1 --- Planning & Design

Weeks 1--2: - Project kick-off. - Requirement gathering. - Business
process analysis. - UI/UX design. - Database design. - System
architecture. - Development environment setup.

## Phase 2 --- Core Development

Weeks 3--7: - User Management. - Vendor Outward. - Vendor
Notification. - Material Inward. - Physical Verification. - Deviation
Management. - Vendor Acceptance. - SAP GRN 101. - Quality Inspection
321.

## Phase 3 --- Warehouse Management

Weeks 8--10: - Bin Transfer 313. - Rack Management. - Rack Occupancy. -
Smart Rack Space Suggestion. - Material Search.

## Phase 4 --- Inventory & Reporting

Weeks 11--12: - Material Issue. - Finished Goods Confirmation. - Reports
& Dashboard. - Notification Engine.

## Phase 5 --- Testing & Deployment & User Training

Weeks 13--14: - Integration Testing. - Performance Optimization. -
Security Testing. - UAT. - Production Deployment. - User Training.

The proposal also states a project duration of 3 months and separately
provides a 13--14 week phase timeline. The exact contractual baseline
should be confirmed.

------------------------------------------------------------------------

# 48. Supplier Scope

The RFQ states supplier scope includes:

-   Software.
-   Dashboard.
-   Database.
-   SAP integration API/interface.
-   Location mapping system for racks.
-   Validation logic / Poka-Yoke.
-   Training.
-   Documentation.

The proposal additionally lists: - Requirement analysis. - UI
development. - Backend development. - Barcode scanner/printer
procurement. - Hardware integration. - Application testing and
implementation. - Server configuration recommendations for
UAT/production. - Software prerequisites list. - Document deliverables.

------------------------------------------------------------------------

# 49. Titan Scope / Dependencies

Titan scope in the RFQ/proposal includes:

-   Provide SAP access.
-   Provide SAP process details.
-   Provide current workflow.
-   Provide master data.
-   Allocate infrastructure/network/system.
-   Support testing and validation.
-   Requirement document confirmation.
-   Design approval.
-   UI confirmation.
-   SAP integration details and support.
-   UAT and production server procurement.
-   VPN access.
-   Server port openings.
-   Internet connectivity as applicable.
-   Vulnerability/security testing.

------------------------------------------------------------------------

# 50. Installation Locations

The RFQ identifies: - Stores --- CBSC & CBFC. - QA section. - PPC
office.

The architecture additionally covers: - Shop Floor / OT. - Mobile
scanners. - Bluetooth scanners. - Operator stations. - Barcode printer.

------------------------------------------------------------------------

# 51. Hardware

Proposal-listed hardware:

  Item                                               Quantity   Approx. unit cost in proposal
  ------------------------------------------------ ---------- -------------------------------
  Wireless barcode scanner --- TVSE BS512 Series            6                         ₹25,000
  Barcode scanner with display --- TVSE K8                  6                         ₹55,000
  Barcode printer --- TVSE DT48                             1                         ₹17,000
  Label rolls                                              10                            ₹400
  Wax ribbon rolls                                         10                            ₹500

The proposal gives an approximate hardware cost of INR 5.06 lakhs.

Hardware availability and final model selection must be confirmed before
procurement.

------------------------------------------------------------------------

# 52. Documentation Deliverables

The RFQ requires: - Software design document. - User manual. - SAP
integration document. - QR labelling standard. - Training materials.

The proposal also includes: - Requirement analysis/design. -
Database/system architecture documentation. - Deployment
prerequisites. - User training. - Project documentation.

------------------------------------------------------------------------

# 53. Testing & Validation

Required: - Pilot testing with real data. - Accuracy check against
manual process. - Approval before full deployment. - Integration
testing. - Performance optimization. - Security testing. - UAT. -
Production deployment.

Test scenarios must include: - Valid Box UID. - Unknown Box UID. -
Correct DC/PO/material. - Wrong material. - Quantity mismatch. -
Shortage. - Excess. - Wrong model. - Vendor deviation acceptance. -
Revised DC. - SAP posting success. - SAP posting failure. - Duplicate
scan. - Valid rack/bin. - Invalid rack/bin. - Location already occupied
where applicable. - Movement history. - Role-based access.

------------------------------------------------------------------------

# 54. Audit Trail

The system must retain historical tracking.

At minimum capture: - User. - Role. - Device. - Action. - Process
number. - Box UID. - Material. - Previous status. - New status. -
Previous location. - New location. - SAP reference. - Timestamp. -
Remarks. - Error/exception information.

No critical workflow event should be silently overwritten.

------------------------------------------------------------------------

# 55. Search Requirements

The project goal of eliminating manual rack searching requires fast
search.

Search dimensions should include: - Box UID. - Material number. -
Model. - Part. - Batch. - Lot. - Vendor. - Titan DC. - Vendor DC. - SAP
PO. - Rack. - Row. - Shelf. - Bin. - Status.

Final search filters should be confirmed during UI/UX requirements.

------------------------------------------------------------------------

# 56. Location QR Requirements

The project overview requires QR assignment to: - Bin. - Rack. - Storage
zone.

A location QR should resolve to a unique location master record.

A storage scan should validate: - User authorization. - Box status. -
Material eligibility. - Location validity. - Location occupancy/capacity
rules where configured.

------------------------------------------------------------------------

# 57. Material Movement Trace

A material's movement should be traceable across:

1.  Titan outward / vendor issue.
2.  Vendor processing.
3.  Vendor dispatch.
4.  Titan gate.
5.  Receiving.
6.  Document verification.
7.  SAP 101.
8.  QA / 321.
9.  CBSC.
10. SAP 313.
11. CBFC verification.
12. Rack movement.
13. Rack/row/bin assignment.
14. Storage.
15. Later material issue / assembly where implemented.

The proposal specifically states end-to-end tracking across: **PPC →
CBSC → CBFC.**

------------------------------------------------------------------------

# 58. Material Issue / Future Flow

The RFQ includes a material-issue concept:

**Scan → locate → pick → confirm issue**

The proposal states: - Assembly gate scans the Box UID. - Issue is
confirmed. - SAP Movement 261 is posted. - Traceability record is
closed.

This is a later/full-scope module unless explicitly pulled into the MVP.

------------------------------------------------------------------------

# 59. Plating Flow / Future Loop

The proposal states: - Accepted polished material can become eligible
for plating. - Sub-Con team generates the DC. - Material is dispatched
to plating vendor. - Original stock number is used for outgoing
material. - Returned plated material uses `/R` version. - Plating
receipt is scanned and recorded.

The DFD represents a conditional plating loop with: - Splitting for
Plating Process. - To Plating Vendor SAP 541. - Plating Process.

This loop should be implemented as a separate workflow with its own
state transitions and traceability.

------------------------------------------------------------------------

# 60. Current vs Target State

## AS-IS

-   Paper DC.
-   Manual audit sheet.
-   Manual physical verification.
-   Email references.
-   Manual SAP transactions.
-   Manual Excel tracking.
-   Manual rack searching.
-   Manual location verification.
-   Phone communication.
-   Manual signatures.
-   Physical document attachment.
-   High search time.
-   Mix-up/misplacement risk.

## TO-BE

-   Box UID.
-   QR/barcode scan.
-   Auto-fetch.
-   Auto-validation.
-   Digital document linkage.
-   SAP integration.
-   Digital deviation management.
-   Digital QA/QD status.
-   Scan-based transfer.
-   RRB location mapping.
-   Digital storage location.
-   Searchable inventory.
-   Audit trail.
-   Dashboard.
-   Notification integration.
-   End-to-end traceability.

------------------------------------------------------------------------

# 61. Architecture Principles

1.  On-premise deployment.
2.  Microservice architecture.
3.  Next.js frontend.
4.  FastAPI/Python backend.
5.  PostgreSQL traceability database.
6.  FastAPI SAP integration.
7.  JWT role-based authentication.
8.  API Gateway as scan entry point.
9.  Firewall-protected environment.
10. Shop-floor scanners connect through Titan network.
11. Barcode contains only Box UID.
12. Business data remains in the application/database.
13. SAP remains the source for SAP transaction/master information.
14. Application maintains traceability and workflow records.
15. All important events are auditable.

------------------------------------------------------------------------

# 62. Data Flow Summary

## SAP → PPC-WIM

-   PO.
-   Material.
-   Batch.
-   Model.
-   Quantity.
-   Vendor.
-   Titan DC.
-   Stock movement information.

## Vendor → PPC-WIM

-   QED Audit Sheet.
-   Box UID.
-   Titan DC mapping.
-   Dispatch details.
-   Vendor DC references.

## Box UID → PPC-WIM

-   Scan event.
-   Primary lookup key.

## PPC-WIM → SAP

-   Confirmed/approved SAP transaction requests according to final
    integration design:
    -   101. 
    -   321. 
    -   313. 
    -   Other approved transactions.

## PPC-WIM → Vendor

-   Deviation notifications.
-   Verification requests.
-   Vendor response workflow.

## PPC-WIM → Store

-   Location instructions.
-   Rack/row/bin mapping.
-   Movement validation.

------------------------------------------------------------------------

# 63. API / Integration Configuration Requirements

Create a configurable integration configuration layer containing,
subject to Titan confirmation:

-   SAP base URL.
-   SAP environment.
-   Authentication method.
-   API endpoint definitions.
-   Timeout.
-   Retry policy.
-   TLS/certificate settings.
-   Field mapping.
-   Movement-type mapping.
-   Plant mapping.
-   Storage-location mapping.

Do not place SAP credentials in source code.

Use secure deployment configuration/secrets management appropriate to
the on-premise environment.

------------------------------------------------------------------------

# 64. Database Principles

PostgreSQL should store the PPC-WIM traceability domain.

Requirements: - Relational integrity. - Unique Box UID. - Unique
location identifiers. - Foreign keys between box/DC/PO/QED/location. -
Timestamped history. - Transactional updates. - Indexes for scan/search
paths. - Audit/event history. - Soft-delete or archival strategy where
required. - Database backup/recovery plan to be confirmed.

The database is identified in the architecture as the **Traceability
DB**.

------------------------------------------------------------------------

# 65. MVP Development Sequence

Recommended sequence for the selected MVP:

### Step 1 --- Foundation

-   Project repository.
-   Next.js application.
-   FastAPI services.
-   PostgreSQL.
-   API Gateway.
-   JWT authentication.
-   Base logging/audit.

### Step 2 --- Master Data

-   Vendor.
-   Material.
-   PO/SAP references.
-   DC. 
-   Rack.
-   Row.
-   Bin.
-   User/role.

### Step 3 --- Box UID

-   Box creation/import.
-   UID validation.
-   QR/barcode generation.
-   Scan endpoint.
-   Box-to-DC mapping.

### Step 4 --- Process 6

-   DC reference.
-   Mail reference.
-   PO/SAP lookup.
-   QED lookup.
-   Document match.
-   Mismatch/deviation.
-   Vendor communication.
-   Revised DC validation.

### Step 5 --- Process 17

-   Eligible-for-movement validation.
-   Move-to-CBFC-Rack event.
-   User/device/timestamp audit.

### Step 6 --- Process 18

-   Rack/row/bin master.
-   Location QR.
-   Scan location.
-   Validate location.
-   Assign box to location.
-   Location history.

### Step 7 --- Dashboard

-   Current location.
-   Pending verification.
-   Deviation.
-   Storage status.
-   Search.

### Step 8 --- UAT

-   Real sample DC.
-   QED.
-   Dispatch email.
-   SAP data.
-   Real Box UID.
-   Real rack/bin.
-   Full audit trail.

------------------------------------------------------------------------

# 66. MVP Acceptance Criteria

## Process 6

A receiving user scans/identifies a Box UID and can retrieve the
linked: - DC. - PO/SAP information. - QED information. - Vendor
information. - Material/model/quantity. - Mail reference where
available.

The system: - Shows match/mismatch. - Prevents/flags invalid
progression. - Creates a deviation when required. - Records the
verification. - Supports vendor response/revised DC validation.

## Process 17

A valid box can be moved toward CBFC rack only when the workflow
prerequisites are satisfied.

The system: - Records the movement. - Records user/device/time. - Shows
current movement status.

## Process 18

A valid box can be assigned to a valid rack/row/bin.

The system: - Validates location. - Stores exact location. - Prevents
invalid/duplicate assignment according to configured rules. - Allows
later search by Box UID/material/location. - Maintains location history.

------------------------------------------------------------------------

# 67. Open Items / Titan Confirmation Required

The supplied documents do not define these items sufficiently for
implementation and they must be confirmed:

1.  Exact SAP system/version.
2.  Exact SAP API/OData/BAPI/interface mechanism.
3.  Exact SAP technical field names.
4.  SAP authentication method.
5.  Exact SAP movement implementation for 101/321/313.
6.  Whether application is allowed to post SAP transactions or only
    assist/manual-confirm.
7.  Exact PO/DC relationship in SAP.
8.  Exact Titan DC generation source.
9.  Exact Box UID generation ownership.
10. Exact QED Audit Sheet format after adding the two new columns.
11. Exact tray-count meaning and data type.
12. Whether QED is scanned/uploaded or entered digitally.
13. Whether vendor dispatch emails are manually uploaded or
    automatically ingested.
14. Mail server/API integration mechanism.
15. Final user roles.
16. Final role permissions.
17. Exact rack/row/bin hierarchy.
18. Rack/bin capacity rules.
19. Location QR format.
20. Exact FIFO rule.
21. Exact deviation approval authority.
22. Vendor response SLA.
23. Exact notification recipients.
24. Exact dashboard KPIs.
25. UAT acceptance criteria.
26. Production availability/uptime target.
27. Backup and disaster-recovery requirements.
28. Retention period for audit records.
29. Security/VAPT standards and tools.
30. Network/VPN/port details.
31. Scanner models actually approved for procurement.
32. Printer/label specification.
33. Label dimensions and printing standard.
34. Whether Vision System is in MVP or later phase.
35. Whether quantity counting is in MVP or later phase.
36. Whether component mix-up controls are in MVP or later phase.
37. Whether material issue/261 is part of MVP or later phase.
38. Whether plating/541 loop is part of MVP or later phase.
39. Whether 19 DFD steps are the final process numbering or whether any
    are merged/renumbered.
40. Exact definition of Process 6, 17 and 18 acceptance boundaries.

------------------------------------------------------------------------

# 68. Source Inventory

This knowledge base was created from the supplied project materials:

1.  **CBE PPC WIM RFQ** --- Project Premises Document, Project 26012,
    CBE PPC Inventory Traceability System.
2.  **PPC WHM PPT** --- Project overview/problem/process/solution
    presentation.
3.  **Titan PPC WIM Proposal** --- Business Workflow & Project Proposal
    / pre-functional specification.
4.  **PPC DFD** --- Inward DFD showing 19 processes, data stores and
    conditional loops.
5.  \*\*PPC Work Flow \_R1.xlsx\*\* --- operational workflow/source
    spreadsheet.
6.  **SKM_28726062513020.pdf** --- sample Delivery Challan.
7.  **SKM_28726062513030.pdf** --- sample Delivery Challan.
8.  **541 - delivery challan scan copy.pdf** --- sample Titan/vendor
    job-work delivery challan.
9.  **QED audit report sheet.pdf** --- sample QED Audit Confirmation
    Report.
10. **Dispatch Details as on 16-06-2026 Evening.eml** --- operational
    vendor dispatch email.
11. **INPUT TO POLISHING.eml** --- operational polishing-input planning
    email.
12. **PPC-WIM System Architecture image** --- layered architecture
    showing SAP integration, FastAPI, PostgreSQL, API Gateway and
    shop-floor devices.

------------------------------------------------------------------------

# 69. Source-Specific Notes

## RFQ / Project Premises

The RFQ is the principal source for: - Project scope. - Poka-Yoke. -
Quality requirements. - Design features. - Documentation. -
Validation. - Training.

## Business Workflow / Proposal

The proposal is the principal source for: - Detailed vendor workflow. -
Box UID principle. - QED linkage. - Auto-fetch/validation. - Detailed
DFD/business data flow. - Proposed technology stack. - Development
phases. - Hardware. - Scope and dependencies.

## PPT

The PPT is useful for: - Problem framing. - High-level current
process. - Box UID and RRB solution concept. - SAP interface concept. -
Business benefits.

## DFD

The DFD is the principal source for: - Numbered inward process
sequence. - External entities. - Data stores. - Deviation loop. -
Plating loop.

## Workflow Spreadsheet

The spreadsheet is the source for: - Current operational/manual
activities. - Material/process categories. - Timing examples. -
Storage/search activities. - Current verification and transfer steps.

## Scanned DC/QED documents

These are evidence/examples of: - Actual document structure. - Actual
business fields. - Actual line-item structure. - Actual
signatures/stamps. - Actual vendor/material/quantity information.

## Operational Emails

These demonstrate: - Real dispatch data structure. - Real
polishing-input planning structure. - Actual operational use of DC,
stock, PO, quantity and remarks. - Email as a current source of process
information.

------------------------------------------------------------------------

# 70. Implementation Guardrails

-   Do not hard-code sample vendor/material/DC values as master data.
-   Do not assume sample SAP fields are the final technical API fields.
-   Do not store business information inside the Box UID barcode.
-   Do not allow frontend clients to bypass API Gateway/service
    authorization.
-   Do not allow duplicate SAP posting.
-   Do not silently overwrite location history.
-   Do not delete audit history as part of normal correction.
-   Do not treat email/scan data as authoritative SAP master data
    without defined reconciliation.
-   Do not assume future-phase features are MVP features.
-   Do not change the business process based only on generic ERP
    assumptions; Titan must confirm.
-   Keep source-specific mappings/configuration outside core business
    logic.
-   Preserve document/reference provenance for every important
    traceability record.

------------------------------------------------------------------------

# 71. Development Definition of Done

A feature is complete only when:

-   UI is implemented.
-   API is implemented.
-   Database model/migration is implemented.
-   Validation/business rules are implemented.
-   Role permissions are enforced.
-   Audit trail is captured.
-   Error handling exists.
-   API documentation exists.
-   Relevant integration tests exist.
-   UAT scenario is defined.
-   Real/sample source data is tested.
-   No duplicate transaction path exists.
-   Logging/monitoring is available.
-   Deployment configuration is documented.

------------------------------------------------------------------------

# 72. Final Project Vision

The target PPC-WIM solution is a **single digital traceability layer
between Titan SAP, vendors, QA, Stores and shop-floor operations**.

The core user experience is:

**Scan Box UID → Fetch linked information → Validate → Handle deviation
if required → Complete SAP/quality workflow → Move material → Scan
rack/bin → Store exact location → Search/trace material later**

The key identifier is:

**Box UID**

The key enterprise integration is:

**Titan SAP**

The key traceability database is:

**PostgreSQL**

The key backend/service technology is:

**FastAPI / Python**

The key frontend technology is:

**Next.js**

The key physical interaction is:

**Industrial barcode/QR scanning**

The key MVP processes are:

**Process 6 --- Refer DC Doc and Mail Reference Verification**

**Process 17 --- Move to CBFC Rack**

**Process 18 --- Rack Row Bin Mapping**

The final implementation must remain grounded in Titan's confirmed SAP
interfaces, actual master data, final workflow approvals, and UAT
decisions.
