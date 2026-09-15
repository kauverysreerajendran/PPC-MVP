# Authorization and URL Protection

This document addresses the requirement often stated as "do not allow a user to edit the URL and delete our records". That problem is not solved by protecting the URL. It is solved by checking authorization on the server for every request.

## 1. The correct framing

A URL is public information. A user can read it, copy it, change the ID in it, and replay it with any tool. The frontend cannot prevent this. Hiding a button, disabling a field, or obscuring an ID changes nothing, because the request is made to the server and the server decides.

The vulnerability class is Broken Object Level Authorization, also called IDOR. The pattern is:

```
GET  /api/v1/invoices/1045/     returns the user's own invoice
GET  /api/v1/invoices/1046/     returns another company's invoice
DELETE /api/v1/invoices/1046/   deletes another company's invoice
```

If the second and third requests succeed, the system is breached. This is the most frequently exploited flaw in business applications and it is usually introduced by fetching a record by primary key alone.

## 2. Mandatory server side rules

| # | Rule |
|---|---|
| 1 | Never fetch a record by ID alone. Always fetch by ID plus the ownership or tenant filter |
| 2 | Apply the scope in the queryset, not in an `if` after fetching |
| 3 | Return 404 rather than 403 when a record exists but is not visible to the caller, so that IDs cannot be enumerated |
| 4 | Check permission for the action, not only for the resource. Read access does not imply delete access |
| 5 | Re-check on every request. Authorization is not cached in the token payload for fast changing roles |
| 6 | Enforce the check in the service or repository layer so that it cannot be bypassed by a new endpoint |

### 2.1 Wrong

```python
invoice = Invoice.objects.get(pk=pk)
invoice.delete()
```

### 2.2 Correct

```python
invoice = get_object_or_404(
    Invoice.objects.filter(company_id=request.user.company_id),
    pk=pk,
)
if not request.user.has_perm("invoice.delete"):
    raise PermissionDenied
invoice.delete()
```

### 2.3 Correct pattern for repositories

Expose only scoped accessors. A repository method that accepts an ID without a scope parameter should not exist.

```python
def get_invoice_for_user(invoice_id: int, user: User) -> Invoice:
    return Invoice.objects.filter(
        id=invoice_id,
        company_id=user.company_id,
        is_deleted=False,
    ).first()
```

## 3. Multi tenant scoping

1. Every tenant scoped table carries the tenant column and an index on it.
2. The tenant ID comes from the authenticated session, never from a request parameter or header supplied by the client.
3. A base manager applies the tenant filter by default. Bypassing it requires an explicit and reviewed call.
4. Cross tenant reporting runs under a separate role with its own audit trail.

## 4. Identifier exposure

| Approach | Position |
|---|---|
| Sequential integer IDs in URLs | Acceptable only with correct scoping. They allow enumeration of record counts |
| UUID or ULID public identifiers | Preferred for externally visible resources |
| Encoded or hashed IDs | Not a security control. It is obfuscation and adds debugging cost |

Switching to UUIDs does not remove the need for authorization checks. It reduces enumeration, nothing more.

## 5. Frontend responsibilities

The frontend supports the model but does not enforce it.

1. Route guards prevent an unauthenticated user from loading a protected screen and redirect to login.
2. Menus and action buttons are rendered from the permission list returned by the backend.
3. A 403 response results in a clear denial screen, not a blank page or an infinite spinner.
4. The frontend never sends the user's role, company ID, or permission flags as a parameter that influences a server decision.

## 6. Destructive action controls

| # | Control |
|---|---|
| 1 | Delete requires confirmation in the UI stating exactly what is being deleted |
| 2 | Soft delete is used for business records. Hard delete is restricted to a separate administrative process |
| 3 | Every delete writes an audit record with actor, timestamp, record type, record ID, and reason where applicable |
| 4 | Bulk delete requires an elevated permission and is rate limited |
| 5 | Restore capability exists for soft deleted records |

## 7. Test cases required per resource

These tests are part of the definition of done for any new resource.

| Case | Expected |
|---|---|
| Anonymous request to any protected endpoint | 401 |
| Authenticated user reads another tenant's record | 404 |
| Authenticated user updates another tenant's record | 404 |
| Authenticated user deletes another tenant's record | 404 |
| Viewer role attempts a write action on own tenant record | 403 |
| Owner reads and writes own record | 200 |
| ID sequence probing across a range | No record from another tenant returned |

## 8. Common failure points found in reviews

1. A new endpoint added to an existing ViewSet that inherits no permission class.
2. A detail route written by hand that skips the scoped queryset used by the list route.
3. A report or export endpoint that takes a company ID from a query parameter.
4. A file download route that serves any path under the media directory.
5. An admin only action gated in the frontend and left open on the server.
6. A WebSocket or background job that acts on a record without repeating the ownership check.
