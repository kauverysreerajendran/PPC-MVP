import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { SapOutward } from "@/features/masterdata/types";

/**
 * SAP Inward's Main Table is scan-driven: nothing is listed for merely being
 * dispatched, a scanned Box UID adds its one line, and a line that becomes
 * fully placed leaves for the Complete Table.
 */

type Query = Record<string, string | number | boolean | undefined>;
const calls: { path: string; query: Query }[] = [];

/** The fake backend: outward lines by Box UID, and the rack status per ref. */
const db = {
  lines: new Map<string, SapOutward>(),
  rack: new Map<string, string>(),
};

function line(n: number, over: Partial<SapOutward> = {}): SapOutward {
  const box = `BUID-${String(n).padStart(4, "0")}`;
  return {
    id: `id-${n}`,
    sap_reference_id: `SAP-${n}`,
    sap_document_no: null,
    transaction_date: "2026-09-20",
    dc_no: `DC-${n}`,
    po_no: `PO-${n}`,
    material_no: null,
    model_no: "90086",
    vendor_code: null,
    box_uid: box,
    tray_id: null,
    tray_type: null,
    no_of_trays: null,
    front_case_trays: null,
    back_case_trays: null,
    outward_status: "DISPATCHED",
    batch_no: null,
    lot_no: null,
    quantity: 100,
    movement_type: "101",
    source_system: "SAP",
    parent_sap_reference_id: null,
    origin: "SAP",
    model_id: null,
    vendor_id: null,
    plating_color_id: null,
    location_id: null,
    received_pieces: 0,
    received_qty: null,
    inward_status: null,
    inward_last_scan_at: null,
    expected_pieces: 10,
    qty_per_piece: 10,
    extra_qty_pieces: 0,
    shortage_pieces: 0,
    shortage_qty: null,
    rejected_qty: 0,
    status: "active",
    created_at: "2026-09-20T00:00:00Z",
    updated_at: "2026-09-20T00:00:00Z",
    ...over,
  } as SapOutward;
}

const page = (items: unknown[]) => ({ items, total: items.length, page: 1, page_size: 50 });
const allLines = () => [...db.lines.values()];

function fakeGet(path: string, opts: { query?: Query } = {}) {
  const query = opts.query ?? {};
  calls.push({ path, query });
  if (path === "/masterdata/sap-inward/lines") {
    const placed = (l: SapOutward) => db.rack.get(l.sap_reference_id) === "PLACED";
    if (query.stage === "pending" && query.started) {
      return Promise.resolve(
        page(allLines().filter((l) => db.rack.get(l.sap_reference_id) === "PARTIALLY_PLACED")),
      );
    }
    if (query.stage === "pending") return Promise.resolve(page(allLines().filter((l) => !placed(l))));
    return Promise.resolve(page(allLines().filter(placed)));
  }
  if (path === "/masterdata/sap-outwards") {
    if (query.box_uid) {
      const hit = allLines().find((l) => l.box_uid === query.box_uid);
      return Promise.resolve(page(hit ? [hit] : []));
    }
    const refs = String(query.refs ?? "").split(",");
    return Promise.resolve(page(allLines().filter((l) => refs.includes(l.sap_reference_id))));
  }
  if (path === "/status/lines") {
    const refs = String(query.refs ?? "").split(",");
    return Promise.resolve(
      page(
        refs
          .filter((r) => db.rack.has(r))
          .map((r) => ({
            sap_reference_id: r,
            stage: "rack",
            code: db.rack.get(r),
            label: db.rack.get(r),
            tone: "success",
            note: null,
            actor: null,
            source: null,
            changed_at: "2026-09-21T00:00:00Z",
          })),
      ),
    );
  }
  if (path === "/status/definitions") return Promise.resolve([]);
  return Promise.resolve(page([]));
}

vi.mock("@/lib/api/client", () => ({
  api: {
    get: (path: string, opts?: { query?: Query }) => fakeGet(path, opts),
    post: vi.fn(),
  },
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/alert", () => ({ alertModal: vi.fn() }));

const { SapInwardView } = await import("@/features/sap-inward/components/SapInwardView");
const { useScannedInward } = await import("@/features/sap-inward/scanned");

let client: QueryClient;
function renderView() {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SapInwardView />
    </QueryClientProvider>,
  );
}

/** Body rows of the grid that carry a line (group headings excluded). */
function lineRows() {
  // The receiving panel a scan opens prints its documents as tables too.
  const table = screen
    .getAllByRole("table")
    .find((t) => within(t).queryByRole("columnheader", { name: "S.No" }));
  if (!table) throw new Error("inward grid not rendered");
  return within(table)
    .getAllByRole("row")
    .filter((r) => within(r).queryAllByRole("cell").length > 1);
}

async function scan(user: ReturnType<typeof userEvent.setup>, box: string) {
  const input = screen.getByPlaceholderText("e.g. BUID-0102");
  await user.clear(input);
  await user.type(input, `${box}{Enter}`);
}

beforeEach(() => {
  calls.length = 0;
  db.lines.clear();
  db.rack.clear();
  useScannedInward.setState({ lines: [] });
  for (const n of [16, 17, 18]) db.lines.set(`BUID-00${n}`, line(n));
});

describe("SAP Inward Main Table", { timeout: 30_000 }, () => {
  it("issues no worklist request on mount and renders empty", async () => {
    renderView();
    expect(await screen.findByText("Scan a Box UID to bring its line here")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("e.g. BUID-0102")).toHaveFocus();
    const worklist = calls.filter(
      (c) => c.path === "/masterdata/sap-inward/lines" && c.query.stage === "pending",
    );
    // Only the in-progress group is asked for — never the dispatched worklist.
    expect(worklist.length).toBeGreaterThan(0);
    expect(worklist.every((c) => c.query.started === true)).toBe(true);
    expect(screen.getByRole("tab", { name: /Main Table/ })).toHaveTextContent("0");
  });

  it("adds exactly one row per scanned Box UID, newest first, without duplicates", async () => {
    const user = userEvent.setup();
    renderView();
    await screen.findByText("Scan a Box UID to bring its line here");

    await scan(user, "buid-0016");
    await waitFor(() => expect(lineRows()).toHaveLength(1));
    expect(lineRows()[0]).toHaveTextContent("BUID-0016");

    await scan(user, "BUID-0017");
    await waitFor(() => expect(lineRows()).toHaveLength(2));
    expect(lineRows()[0]).toHaveTextContent("BUID-0017");

    // Scanning it again does not duplicate it.
    await scan(user, "BUID-0016");
    await waitFor(() => expect(lineRows()[0]).toHaveTextContent("BUID-0016"));
    expect(lineRows()).toHaveLength(2);
    expect(screen.getByRole("tab", { name: /Main Table/ })).toHaveTextContent("2");
  });

  it("refuses an unknown Box UID with the reason and adds nothing", async () => {
    const user = userEvent.setup();
    renderView();
    await screen.findByText("Scan a Box UID to bring its line here");

    await scan(user, "BUID-0031");
    expect(await screen.findByRole("alert")).toHaveTextContent("No dispatched line for 'BUID-0031'");
    expect(screen.getByText("Scan a Box UID to bring its line here")).toBeInTheDocument();
    expect(useScannedInward.getState().lines).toHaveLength(0);
  });

  it("refuses a Box UID that is already placed", async () => {
    db.rack.set("SAP-16", "PLACED");
    const user = userEvent.setup();
    renderView();
    await screen.findByText("Scan a Box UID to bring its line here");

    await scan(user, "BUID-0016");
    expect(await screen.findByRole("alert")).toHaveTextContent("BUID-0016 is already placed");
    expect(useScannedInward.getState().lines).toHaveLength(0);
  });

  it("moves a line that becomes fully placed to Complete and out of the scanned set", async () => {
    const user = userEvent.setup();
    renderView();
    await screen.findByText("Scan a Box UID to bring its line here");
    await scan(user, "BUID-0016");
    await waitFor(() => expect(lineRows()).toHaveLength(1));

    // Placed on the Rack Locator; the next poll sees it.
    db.rack.set("SAP-16", "PLACED");
    await act(() => client.invalidateQueries());

    await waitFor(() => expect(useScannedInward.getState().lines).toHaveLength(0));
    expect(await screen.findByText("Scan a Box UID to bring its line here")).toBeInTheDocument();
    const completeTab = screen.getByRole("tab", { name: /Complete Table/ });
    await waitFor(() => expect(completeTab).toHaveTextContent("1"));
    await user.click(completeTab);
    await waitFor(() => expect(lineRows()[0]).toHaveTextContent("BUID-0016"));
  });

  it("lists placement already under way without a scan, under its own heading", async () => {
    db.rack.set("SAP-18", "PARTIALLY_PLACED");
    renderView();
    expect(await screen.findByText("In progress (not scanned this session)")).toBeInTheDocument();
    expect(lineRows()).toHaveLength(1);
    expect(lineRows()[0]).toHaveTextContent("BUID-0018");
  });
});
