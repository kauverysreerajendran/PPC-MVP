import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApiError } from "@/lib/api/errors";
import { OutwardCell, boxSaveMessage, type CellError } from "@/features/sap/components/SapUploadView";

/**
 * The Box UID cell as SAP Outward wires it up: a rejected value keeps the cell
 * in edit mode (`onSave` resolving false) and the owner supplies the message.
 */
function BoxUidCell({ reason }: { reason: CellError }) {
  const [error, setError] = useState<CellError | null>(null);
  return (
    <OutwardCell
      field="box_uid"
      kind="text"
      value={null}
      selectOnFocus
      uppercase
      error={error}
      onDraftChange={() => setError(null)}
      onSave={() => {
        setError(reason);
        return false;
      }}
    />
  );
}

describe("Box UID cell", () => {
  it("shows the rejection inline and keeps the value for the next scan", async () => {
    const user = userEvent.setup();
    render(<BoxUidCell reason="Invalid Box UID" />);

    await user.click(screen.getByRole("button"));
    const input = screen.getByRole("textbox");
    await user.type(input, "nope-1{Enter}");

    // The message is rendered in the cell, tied to the input, not only toasted.
    const message = await screen.findByRole("alert");
    expect(message).toHaveTextContent("Invalid Box UID");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute("aria-describedby", message.id);
    // Still editing, still holding the typed value (upper-cased) to overwrite.
    expect(input).toHaveValue("NOPE-1");
  });

  it("clears the message on the next keystroke", async () => {
    const user = userEvent.setup();
    render(<BoxUidCell reason="Already assigned to line SAP-9" />);

    await user.click(screen.getByRole("button"));
    const input = screen.getByRole("textbox");
    await user.type(input, "buid-1{Enter}");
    expect(await screen.findByRole("alert")).toBeInTheDocument();

    await user.type(input, "2");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(input).not.toHaveAttribute("aria-invalid");
  });

  it("asks once for a rejected value, however often the cell is committed", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(false);
    render(<OutwardCell field="box_uid" kind="text" value={null} uppercase onSave={onSave} />);

    await user.click(screen.getByRole("button"));
    const input = screen.getByRole("textbox");
    // The cell keeps focus after a rejection, so Enter / blur would otherwise
    // re-send the same value on every attempt.
    await user.type(input, "buid-1{Enter}");
    await user.keyboard("{Enter}");
    await user.tab();
    expect(onSave).toHaveBeenCalledTimes(1);

    // A different value is a new question, so it is asked.
    await user.click(screen.getByRole("textbox"));
    await user.type(screen.getByRole("textbox"), "2{Enter}");
    expect(onSave).toHaveBeenCalledTimes(2);
    expect(onSave).toHaveBeenLastCalledWith("BUID-12");
  });

  it("shows a duplicate as a phrase that fits the column, the full wording on hover", async () => {
    const user = userEvent.setup();
    const conflict = new ApiError(
      {
        error: {
          code: "conflict",
          status: 409,
          message:
            "Box UID 'BUID-0018' is already assigned to outward line SAP-260923-003 — " +
            "duplicate not allowed. Scan a different box.",
        },
      },
      409,
    );
    render(<BoxUidCell reason={boxSaveMessage(conflict)} />);

    await user.click(screen.getByRole("button"));
    await user.type(screen.getByRole("textbox"), "buid-0018{Enter}");

    const message = await screen.findByRole("alert");
    expect(message).toHaveTextContent("Already on SAP-260923-003");
    expect(message).toHaveAttribute("title", conflict.message);
  });

  it("saves and leaves edit mode when the value is accepted", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(true);
    render(<OutwardCell field="box_uid" kind="text" value={null} uppercase onSave={onSave} />);

    await user.click(screen.getByRole("button"));
    await user.type(screen.getByRole("textbox"), "buid-1{Enter}");

    expect(onSave).toHaveBeenCalledWith("BUID-1");
    expect(await screen.findByRole("button")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
