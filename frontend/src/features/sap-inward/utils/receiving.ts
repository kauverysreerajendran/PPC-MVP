/**
 * Quantity entry on SAP Inward: accepted qty (vendor mail / QED sheet) splits
 * equally into front and back cases and is the received qty; shortage is
 * lot − accepted − QED rejected. The server validates and recomputes — these
 * helpers only drive the form's field messages and live preview.
 */

/** Keep digits only from typed or pasted text (docs/08 §3: no `e`, `+`, `-`). */
export const digitsOnly = (v: string) => v.replace(/\D/g, "");

export interface ReceivingErrors {
  accepted?: string;
  rejected?: string;
}

export interface ReceivingPreview {
  front: number;
  back: number;
  received: number;
  shortage: number;
}

export function receivingPreview(lot: number, accepted: number, rejected: number): ReceivingPreview {
  const half = accepted / 2;
  return { front: half, back: half, received: accepted, shortage: lot - accepted - rejected };
}

/** Field messages for the entered texts (empty text = not entered). */
export function validateReceiving(lot: number, acceptedText: string, rejectedText: string): ReceivingErrors {
  const errors: ReceivingErrors = {};
  const accepted = acceptedText === "" ? null : Number(acceptedText);
  const rejected = rejectedText === "" ? 0 : Number(rejectedText);
  if (accepted == null) {
    errors.accepted = "Enter the accepted qty from the vendor mail / QED sheet";
  } else if (accepted < 1 || accepted > lot) {
    errors.accepted = `Accepted qty must be between 1 and ${lot}`;
  } else if (accepted % 2 !== 0) {
    errors.accepted = "Accepted qty must split equally into front and back cases";
  }
  if ((accepted ?? 0) + rejected > lot) {
    errors.rejected = `Accepted + rejected cannot be more than the lot qty (${lot})`;
  }
  return errors;
}
