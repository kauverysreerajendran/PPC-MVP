import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { SapOutward } from "@/features/masterdata/types";

/**
 * The Scan page against a fake backend: a Box UID resolves to one line with
 * its identity, timeline and rack trays; a DC to a list of its lines with the
 * first opened; an unknown code to the not-found state.
 */

type Query = Record<string, string | number | boolean | undefined>;

function outward(n: number, over: Partial<SapOutward> = {}): SapOutward {
  return {
    id: `id-${n}`,
    sap_reference_id: `SAP-${n}`,
    sap_document_no: null,
    transaction_date: "2026-09-20",
    dc_no: "DC-260920-17",
    po_no: `PO-450000${n}`,
    material_no: "M-1",
    model_no: "90086",
    vendor_code: "KALAI-INDUSTRIES",
    box_uid: `BUID-00${n}`,
    tray_id: null,
    tray_type: null,
    no_of_trays: null,
    front_case_trays: null,
    back_case_trays: null,
    outward_status: "DISPATCHED",
    batch_no: "B-1",
    lot_no: `LOT-70${n}`,
    quantity: 120,
    movement_type: "101",
    source_system: "SAP",
    parent_sap_reference_id: null,
    origin: "SAP",
    model_id: null,
    vendor_id: null,
    plating_color_id: null,
    location_id: null,
    received_pieces: 6,
    received_qty: 110,
    inward_status: "SHORT",
    inward_last_scan_at: "2026-09-21T08:00:00Z",
    expected_pieces: 6,
    qty_per_piece: 20,
    extra_qty_pieces: 0,
    shortage_pieces: 0,
    shortage_qty: 8,
    rejected_qty: 2,
    status: "active",
    created_at: "2026-09-20T00:00:00Z",
    updated_at: "2026-09-20T00:00:00Z",
    ...over,
  } as SapOutward;
}

const LINES = [outward(16), outward(17), outward(18)];
const page = (items: unknown[]) => ({ items, total: items.length, page: 1, page_size: 200 });

function fakeGet(path: string, opts: { query?: Query } = {}) {
  const q = opts.query ?? {};
  if (path === "/masterdata/sap-outwards") {
    if (q.box_uid) return Promise.resolve(page(LINES.filter((l) => l.box_uid === q.box_uid)));
    if (q.refs) {
      const refs = String(q.refs).split(",");
      return Promise.resolve(page(LINES.filter((l) => refs.includes(l.sap_reference_id))));
    }
    const s = String(q.search ?? "").toUpperCase();
    return Promise.resolve(
      page(LINES.filter((l) => [l.dc_no, l.po_no, l.model_no].some((v) => v?.includes(s)))),
    );
  }
  if (path === "/sap/records") return Promise.resolve(page([]));
  if (path === "/status/lines") {
    const refs = String(q.refs ?? "").split(",");
    return Promise.resolve(
      page(
        refs.flatMap((r) => [
          { sap_reference_id: r, stage: "outward", code: "DISPATCHED", label: "Dispatched", tone: "success", note: null, actor: null, source: null, changed_at: "2026-09-20T09:00:00Z" },
          { sap_reference_id: r, stage: "inward", code: "VERIFIED", label: "Verified", tone: "success", note: null, actor: null, source: null, changed_at: "2026-09-21T09:00:00Z" },
          { sap_reference_id: r, stage: "rack", code: "PLACED", label: "Placed", tone: "success", note: null, actor: null, source: null, changed_at: "2026-09-21T11:00:00Z" },
        ]),
      ),
    );
  }
  if (path.startsWith("/rack/place/")) {
    const ref = decodeURIComponent(path.slice("/rack/place/".length));
    return Promise.resolve({
      sap_reference_id: ref,
      placed: 6,
      trays: 1,
      placed_qty: "110",
      slots: [
        { id: "s1", code: "A1-S1-R2-T02", warehouse_code: "WH1", aisle_code: "A", rack_code: "A1", shelf_no: 1, row_no: 2, tray_no: 2, qty: "110", pieces: 6, date_of_occupied: null },
      ],
    });
  }
  if (path.startsWith("/rack/racks/")) {
    return Promise.resolve({
      id: "r1", warehouse_code: "WH1", warehouse_name: null, aisle_code: "A", aisle_name: null,
      rack_code: "A1", rack_name: null, position: 1, side: null, shelf_count: 5, row_count: 4,
      tray_count: 40, state: "filling", generated_at: "", shelves: [],
      occupancy: { capacity: 40, occupied: 10, empty: 30, reserved: 0, blocked: 0, occupancy_pct: 25, availability_pct: 75 },
    });
  }
  return Promise.resolve(page([]));
}

vi.mock("@/lib/api/client", () => ({
  api: { get: (path: string, opts?: { query?: Query }) => fakeGet(path, opts), post: vi.fn() },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/scan",
}));

const { ScanView } = await import("@/features/scan/components/ScanView");
const { useScanSession } = await import("@/features/scan/store");

function renderView() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ScanView />
    </QueryClientProvider>,
  );
}

async function scan(user: ReturnType<typeof userEvent.setup>, value: string) {
  const input = screen.getByLabelText(/Scan or type a Box UID/);
  await user.clear(input);
  await user.type(input, `${value}{Enter}`);
}

beforeEach(() => {
  useScanSession.setState({ active: null, selected: null, recent: [] });
});

describe("Scan page", { timeout: 30_000 }, () => {
  it("opens idle with the field focused", () => {
    renderView();
    expect(screen.getByText("Ready to scan")).toBeInTheDocument();
    expect(screen.getByLabelText(/Scan or type a Box UID/)).toHaveFocus();
  });

  it("renders identity, timeline and rack for a Box UID", async () => {
    const user = userEvent.setup();
    renderView();
    await scan(user, "buid-0016");

    const identity = await screen.findByRole("region", { name: "Identity" });
    expect(within(identity).getByRole("button", { name: "Copy Box UID BUID-0016" })).toBeInTheDocument();
    expect(within(identity).getByText("SAP-16")).toBeInTheDocument();

    const timeline = screen.getByRole("region", { name: "Stage timeline" });
    await waitFor(() =>
      expect(timeline.querySelector('[aria-current="step"]')).toHaveTextContent("Placed"),
    );

    const rack = screen.getByRole("region", { name: "Rack location" });
    expect(await within(rack).findByRole("button", { name: "Copy Location A1-S1-R2-T02" })).toBeInTheDocument();
    expect(within(rack).getByText(/Rack A1 · Shelf 1 · Row 2 · Tray 2/)).toBeInTheDocument();
    expect(within(rack).getByRole("link", { name: /View in Rack Locator/ })).toHaveAttribute(
      "href",
      "/rack-locator?q=A1-S1-R2-T02",
    );

    const qty = screen.getByRole("region", { name: "Quantities" });
    expect(within(qty).getByText("Shortage").nextSibling).toHaveTextContent("8");
    // The type it was read as is confirmed back.
    expect(screen.getByText("Read as")).toBeInTheDocument();
  });

  it("lists every line of a DC and opens the first", async () => {
    const user = userEvent.setup();
    renderView();
    await scan(user, "DC-260920-17");

    const list = await screen.findByRole("listbox");
    const options = within(list).getAllByRole("option");
    expect(options).toHaveLength(3);
    expect(options[0]).toHaveAttribute("aria-selected", "true");
    const identity = screen.getByRole("region", { name: "Identity" });
    expect(within(identity).getByRole("button", { name: "Copy Box UID BUID-0016" })).toBeInTheDocument();

    // ↓ + Enter opens the next line.
    options[0]!.focus();
    await user.keyboard("{ArrowDown}{Enter}");
    await waitFor(() => expect(within(list).getAllByRole("option")[1]).toHaveAttribute("aria-selected", "true"));
    expect(
      within(screen.getByRole("region", { name: "Identity" })).getByRole("button", {
        name: "Copy Box UID BUID-0017",
      }),
    ).toBeInTheDocument();
  });

  it("shows the not-found state for an unknown code", async () => {
    const user = userEvent.setup();
    renderView();
    await scan(user, "BUID-0031");
    expect(await screen.findByRole("heading", { name: /Nothing matches/ })).toHaveTextContent(
      "Nothing matches ‘BUID-0031’",
    );
    // ...and says so to assistive tech.
    expect(screen.getByText("Nothing matches BUID-0031.")).toBeInTheDocument();
    expect(screen.getByText(/Check the prefix/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Search SAP Outward/ })).toBeInTheDocument();
  });
});
