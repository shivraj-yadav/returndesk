# ReturnDesk

A full-stack return management desk for online store support agents to raise return requests, move them through a strict lifecycle, record resolutions (`Refund`, `Replacement`, `Store Credit`), append immutable internal notes, and monitor desk metrics.

## Live Deployment

- **Live Application:** `<ADD_YOUR_DEPLOYED_FRONTEND_URL_HERE>` *(e.g. Vercel URL — update before submission)*
- **API Base URL:** `<ADD_YOUR_DEPLOYED_BACKEND_URL_HERE>` *(e.g. Render / Railway URL — update before submission)*
- **GitHub Repository:** `<ADD_YOUR_GITHUB_REPO_URL_HERE>`

---

## Tech Stack

- **Frontend:** Next.js 15 (App Router), React 19, Tailwind CSS v4, Lucide Icons (JavaScript)
- **Backend:** Node.js, Express 5 (JavaScript)
- **Database:** PostgreSQL (tested with Supabase Session Pooler; compatible with local Postgres, Neon, Render)
- **Query Layer:** `pg` (`node-postgres`) with raw parameterized SQL
- **Validation:** Zod v4

---

## Project Structure

```text
returndesk/
├── client/                     # Next.js App Router frontend
│   ├── app/
│   │   ├── requests/           # Returns list, new request form, request detail & lifecycle
│   │   └── analytics/          # SQL-aggregated returns analytics dashboard
│   ├── components/             # Sidebar, TopBar, MobileNav, StatusBadge, Modals, States
│   └── lib/                    # API client (api.js) and shared constants
└── server/                     # Express REST API & database scripts
    ├── scripts/
    │   ├── check-db.js         # Verifies DB connectivity (DATABASE_URL or DB_* vars)
    │   ├── setup-db.js         # Applies schema.sql to PostgreSQL
    │   └── seed.js             # Populates 33 requests across all statuses/reasons + notes
    └── src/
        ├── db/                 # Connection pool & schema.sql
        ├── routes/             # Express route definitions
        ├── validators/         # Zod schemas for body & query validation
        ├── middleware/         # Request validation & centralized error handler
        ├── controllers/        # Thin HTTP request/response handlers
        ├── services/           # Business rules enforcement
        ├── queries/            # Parameterized SQL queries
        └── utils/              # AppError class
```

---

## Database Schema & Constraints

Defined in [`server/src/db/schema.sql`](server/src/db/schema.sql):

### 1. `return_requests`
- `id`: `UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `reference`: `VARCHAR(12) UNIQUE NOT NULL` — generated atomically using PostgreSQL sequence `request_ref_seq` (`'RD-' || LPAD(nextval('request_ref_seq')::text, 6, '0')`).
- `customer_name`, `customer_email`: `VARCHAR(255) NOT NULL`
- `order_id`: `VARCHAR(100) NOT NULL`
- `item_name`: `VARCHAR(255) NOT NULL`, `item_sku`: `VARCHAR(100)`
- `quantity`: `INTEGER NOT NULL CHECK (quantity >= 1)`
- `reason`: `return_reason ENUM ('Damaged', 'Wrong Item', 'Size Issue', 'Not As Described', 'Changed Mind')`
- `status`: `request_status ENUM ('Open', 'In Review', 'Approved', 'Rejected', 'Completed') DEFAULT 'Open'`
- `resolution`: `resolution_type ENUM ('Refund', 'Replacement', 'Store Credit')`
- `refund_amount`: `NUMERIC(10, 2)`
- `is_removed`: `BOOLEAN NOT NULL DEFAULT FALSE`, `removed_at`: `TIMESTAMPTZ`
- `created_at`, `updated_at`: `TIMESTAMPTZ NOT NULL DEFAULT NOW()`

**Partial Unique Index (Business Rule 3 — One live request per item):**
```sql
CREATE UNIQUE INDEX IF NOT EXISTS unique_active_item_request
  ON return_requests (order_id, item_name)
  WHERE status NOT IN ('Rejected', 'Completed')
    AND is_removed = FALSE;
```
Active requests for the same `(order_id, item_name)` are blocked at both the service layer (`409 Conflict`) and the database index level. Once a request is `Rejected`, `Completed`, or soft-removed, a new request for that item is permitted.

### 2. `notes`
- `id`: `UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `request_id`: `UUID NOT NULL REFERENCES return_requests(id)`
- `content`: `TEXT NOT NULL`
- `created_at`: `TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- Append-only by design: no `PATCH` or `DELETE` routes or queries exist for notes.

---

## API Design & Business Rules

### Endpoints

| Method | Endpoint | Purpose | Status Codes |
|---|---|---|---|
| `GET` | `/api/health` | Service health check | `200` |
| `GET` | `/api/requests` | Server-side search, filter (`status`, `reason`), sort, and pagination | `200`, `400` |
| `GET` | `/api/requests/stats` | SQL-aggregated metrics (counts by status, reason, resolution, total refunds) | `200` |
| `POST` | `/api/requests` | Raise a new return request (auto-generates `RD-XXXXXX` reference) | `201`, `400`, `409` |
| `GET` | `/api/requests/:id` | Fetch single request with chronological notes | `200`, `400`, `404` |
| `PATCH` | `/api/requests/:id` | Edit customer/item details (`Open` and `In Review` only) | `200`, `400`, `404`, `409`, `422` |
| `PATCH` | `/api/requests/:id/status` | Transition status with resolution & refund validation | `200`, `400`, `404`, `422` |
| `POST` | `/api/requests/:id/notes` | Append a note (allowed at any status) | `201`, `400`, `404` |
| `DELETE` | `/api/requests/:id` | Soft-delete request (`Open` and `Rejected` only) | `200`, `400`, `404`, `422` |

### Response & Error Format

- **Success:**
  ```json
  {
    "data": { ... },
    "pagination": { "page": 1, "limit": 10, "total": 33, "totalPages": 4 }
  }
  ```
- **Error / Business Rule Refusal:**
  ```json
  {
    "error": {
      "code": "INVALID_STATUS_TRANSITION",
      "message": "Cannot transition from \"Open\" to \"Completed\". Legal transitions from \"Open\": \"In Review\"."
    }
  }
  ```
- **HTTP Semantics:** `400` (`VALIDATION_ERROR`, `INVALID_ID`), `404` (`NOT_FOUND`), `409` (`DUPLICATE_ACTIVE_REQUEST`), `422` (`INVALID_STATUS_TRANSITION`, `RESOLUTION_REQUIRED`, `REFUND_AMOUNT_REQUIRED`, `REFUND_AMOUNT_NOT_ALLOWED`, `REQUEST_LOCKED`, `REMOVAL_NOT_ALLOWED`).

### Server-Enforced Business Rules
1. **Fixed Status Flow:** `Open → In Review → Approved → Completed` or `In Review → Rejected`. `Rejected` and `Completed` are terminal.
2. **Approval Resolution & Refund Rules:** `Approved` requires a resolution (`Refund`, `Replacement`, or `Store Credit`). `Refund` requires `refund_amount > 0`; non-`Refund` resolutions forbid any `refund_amount`. Transitioning `Approved → Completed` preserves the recorded resolution and refund amount.
3. **One Live Request Per Item:** Enforced in `services/requests.js` and via the partial unique index `unique_active_item_request`.
4. **Locked Once Decided:** Detail edits are refused (`422 REQUEST_LOCKED`) once a request reaches `Approved`, `Rejected`, or `Completed`; notes remain appendable at all times.
5. **Soft Removal:** `DELETE /api/requests/:id` sets `is_removed = TRUE` and `removed_at = NOW()` without deleting rows, and is refused (`422 REMOVAL_NOT_ALLOWED`) unless status is `Open` or `Rejected`.

---

## Clean Machine Setup

### Prerequisites
- Node.js 18+
- PostgreSQL 14+ (local instance, Docker, Supabase, Neon, or Render)

### 1. Configure Backend Environment
Copy `server/.env.example` to `server/.env` and set your PostgreSQL connection string:

```bash
cd server
cp .env.example .env
```

```env
PORT=3001
DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<database>
CLIENT_URL=http://localhost:3000
```
*(If using **Supabase**, use the **Session Pooler** URI from Connect → Connection String → URI. For local Postgres without `DATABASE_URL`, `pool.js` and the DB scripts also support `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, and `DB_PASSWORD`.)*

### 2. Install Dependencies, Migrate Schema & Seed Data
```bash
cd server
npm install
npm run db:check    # Verify PostgreSQL connection
npm run db:setup    # Create enums, sequence, tables, and indexes
npm run db:seed     # Populate 33 sample requests across all statuses/reasons + notes
npm run dev         # Start Express API on http://localhost:3001
```

### 3. Start the Frontend
In a separate terminal:
```bash
cd client
npm install
npm run dev         # Start Next.js on http://localhost:3000
```
*(For production deployments where the API is on another domain, set `NEXT_PUBLIC_API_URL=https://your-api-domain/api` in `client`.)*

---

## Design Decisions & Why

1. **Raw Parameterized SQL (`pg`) over an ORM:** Gives direct control over PostgreSQL-specific constructs such as `ENUM` types, `nextval()` reference sequences, partial unique indexes, `FILTER (WHERE ...)` aggregations, and `ILIKE` + `LIMIT`/`OFFSET` pagination without ORM abstraction overhead.
2. **Layered Backend (`Routes → Validators → Controllers → Services → Queries`):** Keeps HTTP concerns in controllers, schema validation in Zod middleware, and all 5 business rules isolated in `services/requests.js` so they are easy to read, test, and defend.
3. **Database Sequence for References (`RD-000001`):** Avoids race conditions that occur with `COUNT(*) + 1` under concurrent inserts.
4. **URL-Driven Server Filtering & Debounced Search:** Search, status/reason filters, sorting, and pagination live in URL query parameters and execute in PostgreSQL, keeping UI state shareable and avoiding client-side filtering.
5. **Centralized Error Envelope (`AppError` + `errorHandler`):** Guarantees predictable JSON errors across validation failures, PostgreSQL constraint errors, and business-rule refusals so the UI always surfaces exact server reasons.

---

## Extra Features Implemented ("If You Finish Early")

- **Returns Analytics Dashboard (`/analytics` + `GET /api/requests/stats`):** Added a dedicated SQL-aggregated analytics view displaying total requests, active queue count, approval rate, total refunds issued, status pipeline breakdown, return reason distribution, and resolution outcomes with click-to-filter links back to `/requests`.

---

## Assumptions Made

1. **Single-Desk Agent Mode:** No user login/authentication layer is included, per the brief's single-desk support workflow.
2. **Item Identity:** An item within an order is uniquely identified by `(order_id, item_name)`. `item_sku` is optional metadata.
3. **Customer Contact:** `customer_email` is stored as the primary customer contact channel.

---

## What Is Incomplete / Next Steps

- **Automated API Test Suite:** Add an integration test script covering all 5 business rules and HTTP error codes.
- **Customer Notifications / Webhooks:** Trigger email updates when a return is approved, rejected, or completed.
- **Image Evidence Uploads:** Support photo attachments (e.g., S3 / Supabase Storage) for `Damaged` or `Wrong Item` claims.

---

## Time Spent

- **Approximately 10–11 hours** total across database schema design, Express API & business rules, Next.js frontend UI, analytics aggregation, Supabase integration, and documentation.
