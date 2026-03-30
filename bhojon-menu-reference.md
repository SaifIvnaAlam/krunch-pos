# Bhojon demo — navigation reference (inferred)

This document is based on **screenshots of the Bhojon admin sidebar** (demo UI) plus **reasonable inferences** for what each area does and which **sub-options** it often contains in products like this. Sub-items were **not all visible** in the screenshots; many rows below are **educated guesses** aligned with BDTASK’s public Bhojon feature pages and common POS patterns. Treat as a planning/competitive reference, not guaranteed API or menu parity.

**Legend:** *(Addon)* — shown with an “Addon” badge in the demo sidebar.

---

## Operations / main sidebar (first screenshot)

### Dashboard

**What it likely is:** Single landing view with KPIs, shortcuts, and recent activity (orders, reservations, sales).

**Plausible sub-options:** Usually none as a top-level chevron item; may deep-link to POS, kitchen, or reports from widgets.

---

### Manage Order

**What it likely is:** End-to-end order lifecycle: create/edit orders, statuses, invoices, and links to POS or counter workflows.

**Plausible sub-options:**

- POS / new order or counter billing
- Order list (all / by status)
- Pending / kitchen / completed / cancelled
- POS invoice list or reprint
- Online order queue (if website ordering is enabled)

---

### Reservation

**What it likely is:** Table booking: calendar, guest details, table assignment, and rules for availability.

**Plausible sub-options:**

- Reservation list / calendar
- New booking
- Unavailable days or blackout dates
- Reservation / table settings

---

### Purchase Manage

**What it likely is:** Buying stock from suppliers: purchase orders, goods receipt, returns, and supplier accounts.

**Plausible sub-options:**

- Purchase list / new purchase
- Return purchase
- Supplier list / supplier ledger
- Stock-out or low-stock alerts tied to ingredients (may overlap Food/Production)

---

### Food Management

**What it likely is:** Menu master data: categories, items, variants, add-ons, pricing, availability, and possibly modifiers.

**Plausible sub-options:**

- Food category list
- Add / edit food items
- Add-on list
- Menu type (e.g. breakfast / lunch) or service period
- Optional: barcode or internal codes

---

### Production

**What it likely is:** Kitchen/production planning: recipes, batches, production units, and linking ingredients to output.

**Plausible sub-options:**

- Recipe management
- Production unit / production set list
- Add production run or batch
- Production settings

---

### Human Resource

**What it likely is:** Staff admin: roster-related data, attendance, payroll hooks, and employee records.

**Plausible sub-options:**

- Employee list / profiles
- Attendance
- Leave
- Payroll / salaries (or export to payroll)
- Awards, recruitment, loans (common in full HRM modules)

---

### Report

**What it likely is:** Operational and financial reporting: sales, stock, purchases, register, and commissions.

**Plausible sub-options:**

- Sales report (by date, table, channel)
- Purchase report
- Stock report (product-wise / kitchen)
- Cash register / shift report
- Commission or waiter performance (if used)

---

### Facebook Setting *(Addon)*

**What it likely is:** Social login or Facebook integration for customers or marketing (e.g. OAuth, pixel, or page linkage).

**Plausible sub-options:**

- App ID / secret or connection status
- Login toggle for customer accounts
- Optional: page or catalog link settings

---

### Loyalty *(Addon)*

**What it likely is:** Points, tiers, or rewards for repeat customers.

**Plausible sub-options:**

- Loyalty rules (earn/redeem rates)
- Member / customer loyalty balance
- Rewards or discount mapping
- Campaign or promotion linkage

---

### QR App *(Addon)*

**What it likely is:** QR-based dine-in ordering: guests scan table QR, browse menu, submit orders to POS.

**Plausible sub-options:**

- Table QR generation / assignment
- Order approval from admin/POS
- Menu visibility for QR channel
- Payment or “call waiter” options (product-dependent)

---

### Shift Mangment *(Addon)* — UI spelling

**What it likely is:** Staff shifts: check-in/out, shift templates, and handover tied to sales or permissions.

**Plausible sub-options:**

- Shift definitions / schedules
- Clock in/out or session logs
- Shift-wise sales or register assignment

---

### Tax Setting *(Addon)*

**What it likely is:** Tax/VAT/GST rules: rates, inclusive/exclusive pricing, and jurisdiction-specific presets.

**Plausible sub-options:**

- Tax groups or rates
- Product/category tax mapping
- Invoice tax breakdown settings

---

### Waste Tracking

**What it likely is:** Logging spoilage, breakage, or discarded inventory for cost control (may be base or addon depending on license).

**Plausible sub-options:**

- Waste entry / log
- Waste by ingredient or finished good
- Waste reports or reasons

---

### Whatsapp Setting *(Addon)*

**What it likely is:** WhatsApp Business integration for order notifications or chat.

**Plausible sub-options:**

- API / webhook or plugin connection
- Order notification templates
- Chat or support inbox (if offered)

---

### Setting (footer label, first screenshot)

**What it likely is:** May be a **section header** or shortcut; the second screenshot shows a fuller **Setting** subtree with gear icon—see below.

---

## Administration / system sidebar (second screenshot)

### Setting

**What it likely is:** General application configuration: company, branches, currency, language, email/SMS, integrations.

**Plausible sub-options:**

- Company / outlet / branch profile
- Localization (currency, date, timezone)
- Email / SMS / notification templates
- Payment gateway credentials (if not under Web Setting)
- Backup / maintenance toggles

---

### User

**What it likely is:** User accounts for staff who log into admin or POS.

**Plausible sub-options:**

- User list / add user
- Password / 2FA (if any)
- User activity or session (if offered)

---

### Modules

**What it likely is:** Enable/disable feature modules or addons per installation.

**Plausible sub-options:** Often a flat list of toggles or licenses—no submenu in UI.

---

### Themes

**What it likely is:** Visual theme for customer-facing site or admin skin.

**Plausible sub-options:** Theme picker, preview, active theme—often minimal nesting.

---

### Role Permission

**What it likely is:** RBAC: which roles can access which menus and actions.

**Plausible sub-options:**

- Role list / create role
- Permission matrix by module
- Assign roles to users

---

### Web Setting

**What it likely is:** Public website / online ordering storefront: SEO, pages, sliders, contact, ordering rules.

**Plausible sub-options:**

- Site identity (logo, name, contact)
- Homepage / CMS blocks
- Online order hours and fees
- Domain or SSL pointers (if self-hosted)

---

### Auto Update

**What it likely is:** One-click or scheduled updates for the PHP/script version (typical of Codecanyon-style products).

**Plausible sub-options:** Often a single screen (check update, apply, changelog).

---

### Message

**What it likely is:** In-app messaging, broadcast to staff, or customer message log.

**Plausible sub-options:**

- Inbox / sent
- Compose / broadcast
- Templates

---

## How to make this exact

1. In the live demo, expand **each** chevron and capture screenshots or copy menu labels.
2. Replace the **Plausible sub-options** sections above with **verbatim** labels from the product.
3. Note which items are **Addon** vs core for your own product scope.

---

## Sources

- Observed UI: Bhojon demo admin sidebar (user-provided screenshots).
- Cross-check for module naming: [BDTASK — Bhojon restaurant management system](https://www.bdtask.com/restaurant-management-system.php).
