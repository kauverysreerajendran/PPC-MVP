import type { MdResource } from "./api";

export type FieldType = "text" | "textarea" | "number" | "datetime" | "select";

export interface FieldDef {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: readonly string[];
  /** shown in the table */
  inTable?: boolean;
  /** editable only on create (natural keys) */
  createOnly?: boolean;
  /** show a pencil in the table cell to edit just this field in place */
  inlineEditable?: boolean;
  align?: "left" | "right";
  sortable?: boolean;
}

export interface ResourceConfig {
  resource: MdResource;
  label: string;
  singular: string;
  /** column used as the row's primary label */
  titleField: string;
  fields: FieldDef[];
  defaultSort: string;
}

const STATUS_FIELD: FieldDef = {
  name: "status",
  label: "Status",
  type: "select",
  options: ["active", "inactive"] as const,
  inTable: true,
  sortable: true,
};

export const RESOURCES: Record<MdResource, ResourceConfig> = {
  models: {
    resource: "models",
    label: "Models",
    singular: "Model",
    titleField: "model_no",
    defaultSort: "model_no",
    fields: [
      { name: "model_no", label: "Model No", type: "text", required: true, inTable: true, sortable: true },
      { name: "model_name", label: "Model Name", type: "text", inTable: true, sortable: true },
      { name: "part", label: "Part", type: "text", inTable: true },
      { name: "uom", label: "UOM", type: "text", inTable: true },
      { name: "description", label: "Description", type: "textarea" },
      STATUS_FIELD,
    ],
  },
  "plating-colors": {
    resource: "plating-colors",
    label: "Plating Colors",
    singular: "Plating Color",
    titleField: "color_code",
    defaultSort: "color_code",
    fields: [
      { name: "color_code", label: "Color Code", type: "text", required: true, inTable: true, sortable: true },
      { name: "color_name", label: "Color Name", type: "text", required: true, inTable: true, sortable: true },
      { name: "description", label: "Description", type: "textarea" },
      STATUS_FIELD,
    ],
  },
  vendors: {
    resource: "vendors",
    label: "Vendors",
    singular: "Vendor",
    titleField: "vendor_code",
    defaultSort: "vendor_code",
    fields: [
      { name: "vendor_code", label: "Vendor Code", type: "text", required: true, inTable: true, sortable: true },
      { name: "vendor_name", label: "Vendor Name", type: "text", required: true, inTable: true, sortable: true },
      { name: "contact_email", label: "Contact Email", type: "text", inTable: true },
      { name: "contact_phone", label: "Contact Phone", type: "text" },
      { name: "description", label: "Description", type: "textarea" },
      STATUS_FIELD,
    ],
  },
  locations: {
    resource: "locations",
    label: "Locations / Racks",
    singular: "Location",
    titleField: "location_code",
    defaultSort: "location_code",
    fields: [
      { name: "location_code", label: "Location Code", type: "text", required: true, inTable: true, sortable: true },
      { name: "location_name", label: "Location Name", type: "text", inTable: true },
      {
        name: "location_type",
        label: "Type",
        type: "select",
        required: true,
        options: ["WAREHOUSE", "RACK", "ROW", "SHELF", "BIN"] as const,
        inTable: true,
        sortable: true,
      },
      { name: "parent_location_id", label: "Parent Location ID", type: "text", inTable: false },
      STATUS_FIELD,
    ],
  },
  "sap-outwards": {
    resource: "sap-outwards",
    label: "SAP Outward",
    singular: "SAP Outward",
    titleField: "sap_reference_id",
    defaultSort: "transaction_date",
    fields: [
      { name: "sap_reference_id", label: "SAP Reference", type: "text", required: true, createOnly: true, inTable: true, sortable: true },
      { name: "sap_document_no", label: "SAP Document No", type: "text", inTable: true },
      { name: "transaction_date", label: "Date / Timestamp", type: "datetime", required: true, inTable: true, sortable: true },
      { name: "dc_no", label: "DC No", type: "text", inTable: true },
      { name: "po_no", label: "PO No", type: "text", inTable: true, sortable: true },
      { name: "model_no", label: "Model No", type: "text", inTable: true },
      { name: "vendor_code", label: "Vendor Code", type: "text", inTable: true },
      { name: "batch_no", label: "Batch No", type: "text", inTable: true },
      { name: "movement_type", label: "SAP Movement", type: "text", inTable: true },
      { name: "quantity", label: "Lot Qty", type: "number", inTable: true, align: "right", sortable: true, inlineEditable: true },
      { name: "tray_type", label: "Tray Type", type: "text", inTable: true, sortable: true, inlineEditable: true },
      { name: "no_of_trays", label: "No. of Trays", type: "number", inTable: true, align: "right", sortable: true, inlineEditable: true },
      { name: "front_case_trays", label: "Front Case Trays", type: "number", inTable: true, align: "right", sortable: true, inlineEditable: true },
      { name: "back_case_trays", label: "Back Case Trays", type: "number", inTable: true, align: "right", sortable: true, inlineEditable: true },
      { name: "box_uid", label: "Box UID", type: "text", inTable: true, sortable: true, inlineEditable: true },
      { name: "outward_status", label: "Outward Status", type: "select", options: ["NEW", "ALLOCATED", "PACKED", "DISPATCHED", "HOLD"] as const, inTable: true, sortable: true, inlineEditable: true },
      { name: "model_id", label: "Model (FK id)", type: "text" },
      { name: "vendor_id", label: "Vendor (FK id)", type: "text" },
      { name: "plating_color_id", label: "Plating Color (FK id)", type: "text" },
      { name: "location_id", label: "Location (FK id)", type: "text" },
      STATUS_FIELD,
    ],
  },
  trays: {
    resource: "trays",
    label: "Trays",
    singular: "Tray",
    titleField: "tray_id",
    defaultSort: "tray_id",
    fields: [
      { name: "tray_id", label: "Tray ID", type: "text", required: true, inTable: true, sortable: true },
      { name: "box_id", label: "Box ID", type: "text", inTable: true, sortable: true },
      { name: "tray_type", label: "Tray Type", type: "text", inTable: true, sortable: true },
      { name: "no_of_trays", label: "No. of Trays", type: "number", inTable: true, align: "right", sortable: true, inlineEditable: true },
      { name: "qty", label: "Qty", type: "number", inTable: true, align: "right", sortable: true, inlineEditable: true },
      { name: "qty_capacity", label: "Qty Capacity", type: "number", inTable: true, align: "right", sortable: true, inlineEditable: true },
      STATUS_FIELD,
    ],
  },
  boxes: {
    resource: "boxes",
    label: "Boxes",
    singular: "Box",
    titleField: "box_uid",
    defaultSort: "box_uid",
    fields: [
      { name: "box_uid", label: "Box UID / Barcode", type: "text", required: true, inTable: true, sortable: true },
      { name: "box_type", label: "Box Type", type: "text", inTable: true, sortable: true },
      STATUS_FIELD,
    ],
  },
};

export const RESOURCE_ORDER: MdResource[] = [
  "models",
  "plating-colors",
  "vendors",
  "locations",
  "sap-outwards",
  "trays",
  "boxes",
];
