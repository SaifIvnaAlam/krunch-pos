# Portal roles — Admin vs Manager

Client license: **5 Admin access** + **3 Managerial input access**.

This doc is the product contract for those two tiers. Implementation follows
**RBAC with server-enforced (SE) hard edges**: NestJS `JwtAuthGuard` +
`RbacGuard` + `@RequirePermission(...)` on every mutating/list route. The
terminal UI hides or disables controls for UX only — it is never the security
boundary.

---

## License seats

| Tier (client language) | System role id(s) | Max active seats |
|---|---|---|
| Admin access | `owner`, `admin` | **5** |
| Managerial input access | `branch_manager` | **3** |

- Only **active** (`Staff.isActive = true`) accounts count toward a seat.
- Deactivating a user frees a seat; reactivating re-checks the cap (API rejects
  if the tier is full).
- The seeded primary account uses `OWNER` and counts as **one Admin seat**.
- New Admins created in Users & Access get role `admin` (not a second `owner`).
- Caps are enforced in `StaffService` on create, reactivate, and role assign
  (`apps/api/src/modules/staff/portal-access.ts`).

---

## Where rules are applied

| Layer | What it does | Hard edge? |
|---|---|---|
| **API `RbacGuard`** | Rejects requests missing the required permission string | **Yes** |
| **API seat checks** | Rejects create/reactivate/assign when tier is full | **Yes** |
| **API login** | Inactive staff cannot obtain tokens | **Yes** |
| **Terminal nav / buttons** | Hides Users & Access for Managers; shows seat counts | No (UX only) |
| **Role permission arrays** | Seeded on `Role.permissions` (`prisma/seed.ts`) | Source of JWT perms |

After changing seed permissions, re-run seed (or update `Role.permissions` in
DB) and have users **sign in again** so JWTs pick up the new permission set.

---

## Shared capabilities (Admin **and** Manager)

Both tiers can **view and edit** day-to-day restaurant data:

| Area | View | Edit / input |
|---|---|---|
| Daily Entry | ✓ | ✓ |
| All Expenses / Item Purchases / Other Expenses / Payables | ✓ | ✓ |
| Employee Management (roster) | ✓ | ✓ |
| Employee Salaries / payroll | ✓ | ✓ |
| Reports (branch) | ✓ | — (read-only surfaces) |
| Receipt / file storage used by the above | ✓ | ✓ |

API permission used for these modules today: `daily_entry:read` /
`daily_entry:write` (plus `storage:*`, `reports:branch`).

---

## Admin only

| Capability | Permission(s) |
|---|---|
| Open **Users & Access** | `staff:read` |
| Create portal users (pick Admin or Manager tier) | `staff:create` |
| Reset password, deactivate / reactivate | `staff:edit` |
| Assign / change roles (API; full UI later) | `staff:assign_role` |
| System / branch config | `system:config` |
| Audit log | `audit:read` |
| Global reports (if multi-branch later) | `reports:global` |

Admin **cannot**:

- Exceed **5** active Admin seats or **3** active Manager seats.
- Deactivate their **own** account (API blocks self-deactivate).

---

## Manager only (differentiating factors)

Managers **can**: sign in; view and edit all operational modules listed under
“Shared capabilities”.

Managers **cannot**:

| Cannot | Why |
|---|---|
| See or use **Users & Access** | No `staff:*` permissions; nav hidden + API 403 |
| Create / reset / deactivate portal users | No `staff:create` / `staff:edit` |
| Change roles or elevate permissions | No `staff:assign_role` |
| Change system / branch configuration | No `system:config` |
| Read audit logs | No `audit:read` |
| Bypass seat limits | N/A — they cannot create users at all |

---

## Permission matrices (seed)

### Admin (`OWNER` / `ADMIN`)

```
staff:read, staff:create, staff:edit, staff:deactivate, staff:assign_role,
roles:create, roles:edit, roles:delete,
reports:branch, reports:global, audit:read, system:config,
daily_entry:read, daily_entry:write,
storage:read, storage:write
```

### Manager (`BRANCH_MANAGER`)

```
reports:branch,
daily_entry:read, daily_entry:write,
storage:read, storage:write
```

---

## UI behaviour

| Surface | Admin | Manager |
|---|---|---|
| Sidebar: operational leaves | Shown | Shown |
| Sidebar: **Users & Access** | Shown | Hidden |
| Users & Access: Add user + tier (Admin/Manager) | Enabled | N/A |
| Users & Access: seat counters | Shown | N/A |
| Operational forms (daily entry, expenses, payroll, …) | Editable | Editable |

If a Manager bookmarks Users & Access, the page shows an access-denied message;
API calls still return **403**.

---

## Related code

- Seat + tier constants: `apps/api/src/modules/staff/portal-access.ts`
- Create / list / deactivate: `apps/api/src/modules/staff/staff.service.ts`
- Role permission seed: `packages/database-schema/prisma/seed.ts`
- Users UI: `apps/terminal/src/components/pos/UsersAccessView.tsx`
- Nav permission filter: `apps/terminal/src/data/posNav.tsx` (`permission` on leaf)
- Session permissions: `apps/terminal/src/features/auth/SessionProvider.tsx`
