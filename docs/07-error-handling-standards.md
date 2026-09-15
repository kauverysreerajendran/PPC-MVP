# Error Handling and Defect Correction Standard

## 1. Core rule

A defect is fixed in the layer that causes it. Correcting a symptom in the layer where it becomes visible is not a fix. It hides the defect, leaves the root cause live for every other consumer of that code, and creates a second source of truth.

The most common violation is patching a backend defect in the frontend. Examples that are rejected in review:

| Anti pattern | Why it is wrong | Correct fix |
|---|---|---|
| Frontend filters out duplicate rows returned by the API | Every other client and every report still receives duplicates | Fix the join or the query |
| Frontend reformats a date because the API returns an inconsistent format | The contract is broken, not the display | Standardize the API to ISO 8601 |
| Frontend recalculates a total because the API total is wrong | Two calculation implementations will drift | Fix the calculation in the backend service |
| Frontend hides a button because the API allows an unauthorized action | The action is still callable | Enforce authorization on the server |
| Frontend adds `setTimeout` to wait for data that is not ready | Race condition remains, fails on slow networks | Fix the sequencing or the endpoint |
| Frontend catches an error and shows an empty list | The failure becomes invisible | Return a correct response or surface the error |
| Backend adds a field only to satisfy one screen layout | API shaped by UI, breaks the next client | Frontend composes the view from the domain model |

## 2. Where to fix, by symptom

| Symptom | Fix location |
|---|---|
| Wrong data values | Backend service or database query |
| Missing or extra records | Backend query or filter |
| Wrong number formatting, currency, timezone display | Frontend presentation layer |
| Slow list screen with correct data | Backend query, then frontend rendering |
| Screen crashes on null field | Both: backend should honour the contract, frontend should handle absence defensively |
| Unauthorized action possible | Backend, always |
| Validation bypassed | Backend, with frontend validation added for usability |
| Duplicate submission creating two records | Backend idempotency, with frontend submit locking as a secondary control |
| Layout, alignment, responsiveness | Frontend |

Defensive handling in the frontend is allowed and expected. Defensive handling instead of a backend fix is not. When the frontend adds a guard for a backend defect, a backend ticket is raised in the same commit.

## 3. Backend error contract

Every error response follows the shape defined in `02-backend-architecture.md`:

```json
{
  "error": {
    "code": "INVOICE_ALREADY_APPROVED",
    "message": "This invoice has already been approved",
    "details": [],
    "trace_id": "b7f2c1e4-1c2a-4a0e-9d2f-2a1d8e4f6c11"
  }
}
```

Rules:

1. Business errors raise a typed application exception. A global handler converts it to the response. Views do not build error dictionaries by hand.
2. Error codes are stable strings defined in one module. The frontend switches on the code, never on the message text.
3. `message` is written for the end user. It states what happened and what to do next. It contains no table names, no stack traces, and no internal identifiers.
4. Unhandled exceptions return a generic 500 message plus a trace ID. The detail goes to the log and the error tracker.
5. Validation errors return field level details so that the frontend can attach messages to inputs.

## 4. Frontend error handling

| Status | Frontend behaviour |
|---|---|
| 400 or 422 | Map `details` to form fields. Keep the user on the form with entered values preserved |
| 401 | Attempt one silent token refresh. On failure, clear the session and redirect to login with a return path |
| 403 | Show a denial message on the screen. Do not redirect to login |
| 404 | Show a not found state for the resource, not a blank screen |
| 409 | Show the conflict message and offer a reload of current data |
| 429 | Show a retry after message. Do not retry immediately in a loop |
| 500 or 503 | Show a generic failure message with the trace ID and a retry action |
| Network failure or timeout | Show an offline or connection message with retry. Distinguish it from a server error |

Additional rules:

1. Every screen renders an error state. A failed request must never leave a permanent spinner.
2. Raw exception text, stack traces, and internal codes are never displayed to the user. The trace ID is displayed as a support reference.
3. Error boundaries wrap each route so that one component failure does not blank the application.
4. Automatic retry applies only to idempotent GET requests, with a maximum of two attempts and backoff.
5. Failed mutations restore the previous UI state. Optimistic updates roll back on failure.

## 5. Logging and traceability

1. A trace ID is generated at the edge for every request, passed through services and background jobs, returned in error responses, and included in every log line.
2. Errors are sent to an error tracker such as Sentry with user context, route, and trace ID attached.
3. `except Exception: pass` and empty catch blocks are not permitted. A caught and intentionally ignored error is logged at debug level with a comment explaining why.
4. Alerts are configured on error rate thresholds, not on individual events, to avoid alert fatigue.

## 6. Defect workflow

1. Reproduce the defect and record the exact steps and environment.
2. Identify the layer that causes it using the table in section 2.
3. Write a failing test at that layer.
4. Fix the cause and confirm the test passes.
5. Check for the same pattern elsewhere in the codebase. A defect found once is usually present more than once.
6. Record the root cause in the ticket. "Fixed" with no cause noted is not an acceptable closure comment.

## 7. Review questions

| # | Question |
|---|---|
| 1 | Is this change correcting the cause or the symptom |
| 2 | If this is a frontend guard, is there a backend ticket linked |
| 3 | Does the error reach the user in language they can act on |
| 4 | Does the log contain enough context to diagnose without reproducing |
| 5 | Is any exception being swallowed |
| 6 | Does the failure path leave the UI in a usable state |
