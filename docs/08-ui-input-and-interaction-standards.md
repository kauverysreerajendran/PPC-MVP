# UI, Input and Interaction Standards

Baseline behaviour expected on every screen. These are treated as acceptance criteria, not as polish items added at the end of a sprint.

## 1. Loading and buffering

| Situation | Behaviour |
|---|---|
| Response expected under 300 ms | No indicator. A flashing spinner is worse than none |
| Page or table load | Skeleton matching the final layout, so the page does not jump |
| Action triggered by a button | Button enters a disabled loading state with its label retained |
| Background refresh of visible data | Subtle inline indicator. Do not blank the existing content |
| Operation above 10 seconds | Progress indication or a message stating the work continues in the background |
| Navigation between routes | Top progress bar |

Rules:

1. Every request has a client timeout, typically 30 seconds. A request without a timeout can hang the screen indefinitely.
2. A submit button is disabled from the moment of click until the response is handled. Double submission is prevented in the UI and enforced by idempotency on the server.
3. Loading state is never left visible after an error. Error state replaces it.
4. Skeleton placeholders show the expected structure. Generic full page spinners are used only for the initial application boot.

## 2. Alerts and messages

| Type | Use | Duration |
|---|---|---|
| Inline field message | Validation failure on a specific input | Until corrected |
| Inline banner on the form | Error affecting the whole form | Until resolved or dismissed |
| Toast, success | Confirmation of a completed action | 3 to 4 seconds, auto dismiss |
| Toast, error | Non blocking failure | 6 seconds or manual dismiss |
| Modal dialog | Destructive confirmation or a decision that blocks progress | Until the user responds |
| Full page state | Not found, no access, connection lost | Until navigation |

Rules:

1. Native `alert()` and `confirm()` are not used in production code.
2. One message per event. Do not show a toast and a banner for the same failure.
3. Message text states what happened and what the user should do. "Error occurred" and "Something went wrong" without a next step are not acceptable.
4. Success toasts appear only for actions whose result is not otherwise visible on screen.
5. Toasts are not used to report validation errors. Those belong beside the field.
6. Destructive confirmations name the record and require the primary action to be the safe one.

## 3. Input field standards

| Field type | Allowed input | Max length | Notes |
|---|---|---|---|
| Name, text | Letters, spaces, hyphen, apostrophe | 100 | Do not block non English characters |
| Email | Standard email pattern | 254 | Validate on blur, trim whitespace, lowercase on save |
| Phone | Digits, plus, space, hyphen | 15 digits | Store normalized digits with country code |
| Numeric quantity | Digits only | Business range | `inputMode="numeric"`, block `e`, `+`, `-` on a number input |
| Decimal, money | Digits and one decimal separator | 2 decimal places | Store as decimal, never float |
| Percentage | 0 to 100 with decimals | 3 digits | Validate the range, not only the type |
| Date | Date picker | n/a | Store ISO, display per locale, block impossible ranges |
| Password | Any character | Minimum 8 | No maximum below 64, allow paste |
| Code or reference | Alphanumeric, defined separators | Field specific | Uppercase automatically where the domain expects it |
| Search | Any | 100 | Debounce 300 ms, trim, escape before display |
| Free text notes | Any | 1000 or 5000 | Character counter shown near the limit |
| File upload | Allowlisted extensions | Size limit stated | Validate type and size before upload starts |

Rules:

1. Maximum length is enforced on the input element and again on the server. The server value is authoritative.
2. Numeric fields reject non numeric keystrokes and paste content. A number input that accepts `e` or multiple decimal points is a defect.
3. Leading and trailing whitespace is trimmed before validation and before save.
4. Required fields are marked visually and announced to assistive technology.
5. Validation runs on blur for individual fields and again on submit for the whole form. Validating on every keystroke while the user is still typing produces error noise.
6. Field errors appear directly below the field, in text, not by colour alone.
7. Disabled inputs are used for states the user cannot change. Read only is used for values they may need to copy.
8. Autocomplete attributes are set correctly on address, email, and payment fields.

## 4. Blocking unsafe input

| # | Rule |
|---|---|
| 4.1 | HTML tags and script content are rejected or escaped. The server is the authoritative checkpoint |
| 4.2 | React escaping is left intact. `dangerouslySetInnerHTML` requires sanitized input and reviewer approval |
| 4.3 | Rich text content is sanitized with an allowlist on the server before storage. Client side sanitization alone is bypassable |
| 4.4 | Values starting with `=`, `+`, `-`, or `@` are escaped on CSV export |
| 4.5 | URL fields are validated for scheme. `javascript:` and `data:` are rejected |
| 4.6 | File names are sanitized. Path traversal sequences are stripped server side |
| 4.7 | Input rejection messages state the rule, for example "HTML tags are not permitted in this field" |

Blocking a character in the browser is a usability feature. It is never the security control. Assume every client side restriction can be removed by the user.

## 5. Forms

1. Form state persists during validation failure. Clearing user input on error is not acceptable.
2. Navigation away from a form with unsaved changes triggers a confirmation.
3. Long forms are grouped into sections or steps with progress indication.
4. On submit failure, focus moves to the first field in error.
5. Enter submits single field forms. In multi field forms, Enter does not trigger a destructive action.
6. Cancel returns to the previous state without saving and confirms if data was entered.

## 6. Tables and lists

| # | Rule |
|---|---|
| 6.1 | Server side pagination by default. Default page size 25 |
| 6.2 | Sorting and filtering executed on the server for datasets above one page |
| 6.3 | Filter state reflected in the URL so that a view can be shared and restored |
| 6.4 | Empty state explains why the list is empty and offers the next action |
| 6.5 | Row actions grouped consistently. Destructive actions visually separated |
| 6.6 | Column widths stable during loading to prevent layout shift |
| 6.7 | Numeric columns right aligned, text left aligned, dates in a single consistent format |

## 7. Session and timing

1. Session expiry produces a clear message and returns the user to the same screen after re authentication.
2. A warning appears before an idle timeout, with an option to extend.
3. Long running operations continue server side if the user navigates away. The result is retrievable.
4. Time displays use the user's local timezone with the timezone indicated where ambiguity matters.

## 8. Screen completion checklist

A screen is not complete until all of the following exist.

| # | Item |
|---|---|
| 1 | Loading state |
| 2 | Empty state |
| 3 | Error state including no access and not found |
| 4 | Populated state |
| 5 | Field level validation with messages |
| 6 | Disabled submit during in flight request |
| 7 | Confirmation on destructive actions |
| 8 | Keyboard navigation through all interactive elements |
| 9 | Mobile and tablet layout verified |
| 10 | Long values, long names, and large numbers do not break the layout |
