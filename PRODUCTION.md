# IonxSupply — Production Architecture, Security & Deploy

This demo is a **100% client-side simulation**: all data lives in `localStorage`, "auth" is a
persona switch, and payments are fake. That is exactly right for a prototype — but **none of the
trust can stay on the client** in production. Anyone can open DevTools and rewrite `localStorage`
to become an admin, change a price to $0, or approve their own shop. The rule for the real build:

> **The client is a rendering layer. Every decision that touches money, ownership, or trust runs on the server and is enforced by the database.**

---

## 1. Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | **Next.js (App Router)** on **Vercel** | SSR + API routes/route handlers, edge-cached pages, easy env-var management |
| DB + Auth + Storage | **Supabase** (Postgres, Auth, Storage) | Row-Level Security enforces ownership in the DB itself; Auth handles sessions; Storage for images |
| Payments / escrow | **Stripe Connect (destination charges)** | Platform holds funds, releases to seller on fulfillment; handles KYC, payouts, disputes |
| Email | Resend / Postmark | Order + shipping + dispute notifications |
| Background jobs | Supabase cron / Vercel cron | Payout release, auto-cancel unshipped orders, review reminders |

Schema + RLS starting point already exists: `../ebike-hub/03-schema.sql`. This doc is the **security + deploy** layer on top of it.

---

## 2. Wiring Vercel + Supabase (concrete steps)

1. **Create the Supabase project.** Run `03-schema.sql` (tables + RLS + policies). Enable Auth (email + Google/Apple OAuth). Create Storage buckets: `product-images`, `shop-logos`, `shop-banners`, `review-photos` — all **private**, served via signed URLs or a public-read policy scoped per-object.
2. **Create the Next.js app**, add `@supabase/ssr` + `@supabase/supabase-js` + `stripe`.
3. **Environment variables in Vercel** (Project → Settings → Environment Variables):
   - Public (safe in browser): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **Server-only (NEVER prefixed `NEXT_PUBLIC_`):** `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY`
   - The service-role key **bypasses RLS** — it may only ever be imported in server code (route handlers / server actions). A single accidental `NEXT_PUBLIC_` prefix or client import leaks god-mode. Add a lint rule / CI grep to block it.
4. **Two Supabase clients:** a browser client (anon key, always constrained by RLS) and a server client (per-request, uses the user's session cookie). The service-role client is used only in webhooks/admin jobs.
5. **Connect Vercel → GitHub** for CI/CD. Protect `main`; deploy previews per PR.

---

## 3. Security model — how we don't get hacked or lose money

### 3.1 Authorization lives in the database (RLS), not the code
Every table has Row-Level Security **on**, default-deny, with explicit policies:
- `products`: `insert/update/delete` only where `seller_id = (select seller_id from sellers where user_id = auth.uid())`. Buyers can only `select` active listings.
- `orders`: a buyer sees only their orders; a seller sees only orders for their shop; **nobody can update `status`, `total`, or `fee` from the client** — those change only via server functions/webhooks.
- `sellers`: a user edits only their own shop row; `verified`, `status`, `slug` are **admin-only** columns (enforced by a policy that checks an `is_admin` claim).
- `reviews`: insert only if the reviewer has a `delivered` order for that product (verified-purchase gate); one review per order.
Even if the frontend is fully compromised, the DB refuses illegal writes.

### 3.2 Money flow (Stripe Connect escrow)
- Checkout creates a **PaymentIntent** server-side with `amount` recomputed from the DB (never trust the client's cart total) + `application_fee_amount` (the 6.7%) + `transfer_data.destination = seller_stripe_account`.
- Funds are **held by the platform**; the transfer to the seller is released only when the order hits `fulfilled` (tracking added) and the dispute window closes — a cron job, not a button.
- **Webhooks are the source of truth.** `payment_intent.succeeded` → mark order paid; `charge.dispute.created` → freeze payout. Every webhook **verifies the Stripe signature** (`STRIPE_WEBHOOK_SECRET`) and is **idempotent** (store processed event ids) so a replayed event can't double-pay.
- Payout holds + velocity limits on new sellers; manual review over a threshold. This is the core "don't lose a ton of money" control.

### 3.3 Server-side validation on every mutation
Client validation is UX only. Re-validate on the server: price ≥ 0, quantity in stock at purchase time (atomic decrement), category in allowlist, string lengths, battery listings require certification, etc. Use Zod schemas shared where possible but **authoritative on the server**.

### 3.4 File uploads (product/review/logo images)
- Upload directly to Supabase Storage with **short-lived signed upload URLs**; never let the client write arbitrary paths.
- Enforce **content-type allowlist** (image/jpeg|png|webp), **size cap** (e.g. 5 MB), and **re-encode server-side** (strip EXIF/metadata, normalize to JPEG/WebP) so a "polyglot" file can't smuggle a script. Serve from a separate storage origin so an image can never execute in the app's origin.
- Cap images-per-listing and per-review; run rate limits.

### 3.5 XSS / injection (already partly handled in the demo)
- The demo escapes with `esc()` (`& < > " '`) on all interpolated user data, normalizes website URLs to an **http/https allowlist** (blocks `javascript:`/`data:`), and adds `rel="noopener nofollow"` + `target="_blank"` on outbound links. Keep this.
- In Next.js: prefer React's default escaping, avoid `dangerouslySetInnerHTML`, and set a strict **Content-Security-Policy** header (no inline scripts; images from self + the storage origin; connect-src to Supabase/Stripe only). Add `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Strict-Transport-Security`, and a locked-down `Permissions-Policy`.

### 3.6 Abuse & account security
- **Rate-limit** auth, checkout, review, and report endpoints (Upstash/Vercel KV).
- **CSRF**: use Supabase's cookie auth with same-site cookies; mutations via POST route handlers that check the session.
- **Bot/fraud**: hCaptcha/Turnstile on signup + checkout; Stripe Radar on payments.
- Admin actions (approve seller, suspend, resolve report) are gated by an `is_admin` claim **and** logged to an append-only `audit_log`.
- Secrets rotated on a schedule; least-privilege DB roles; PII (addresses) access-logged.

---

## 4. The core flows, as real backend

| Flow | Demo (now) | Production |
|---|---|---|
| **Item creation** | writes to `localStorage`; images are data-URLs | server action validates + inserts to `products`; images uploaded to Storage via signed URL, re-encoded; RLS binds to the seller |
| **Seller approval** | "demo approve" button flips a flag | application row → admin queue → **Stripe Connect onboarding (KYC)** must complete before `status='active'`; identity/bank verified by Stripe, not us |
| **Shipping** | "Mark shipped" sets a tracking string | seller submits carrier + tracking → webhook/label API confirms → buyer emailed → **starts the payout-release clock** |
| **Reporting** | pushes to a `reports` array | insert to `reports`; admin dashboard with RLS; repeated reports auto-flag; suspend cascades to hide listings market-wide |
| **Reviews** | anyone signed-in can post | **verified-purchase gate** (must have a delivered order); photos re-encoded; edit window; seller can respond |
| **Refund / dispute** | copy only | Stripe dispute + platform-mediated flow; payout frozen while open |

---

## 5. Prioritized security checklist (do these before launch)

**P0 — money & ownership**
- [ ] RLS on every table, default-deny, tested with a "can a hostile user…" suite
- [ ] Server recomputes all prices/fees from the DB at checkout (never trust client totals)
- [ ] Stripe webhook signature verification + idempotency keys
- [ ] Service-role key server-only (CI check blocks `NEXT_PUBLIC_` on secrets)
- [ ] Atomic stock decrement (no overselling / race conditions)
- [ ] Payout holds + release-on-fulfillment cron

**P1 — surface hardening**
- [ ] Strict CSP + security headers on all responses
- [ ] File-upload allowlist + size cap + server re-encode + separate origin
- [ ] Rate limiting on auth/checkout/review/report
- [ ] Captcha on signup + checkout; Stripe Radar on
- [ ] Verified-purchase gate on reviews

**P2 — operations**
- [ ] Audit log for admin actions; suspicious-activity alerts
- [ ] Secret rotation + least-privilege roles
- [ ] Backups + point-in-time recovery on Supabase
- [ ] Dependency scanning (Dependabot) + `npm audit` in CI
- [ ] Bug-bounty / responsible-disclosure page

---

## 6. Migration path from this demo
The demo's view functions map almost 1:1 to Next.js pages, and its data shapes match `03-schema.sql`.
Order of work: (1) Supabase schema + RLS + auth, (2) read-only pages against real data, (3) writes via
server actions with validation, (4) Stripe Connect + checkout + webhooks, (5) Storage-backed images,
(6) admin/trust tooling, (7) the P0/P1 security checklist, (8) load-test + a security review before taking a dollar.

*This file is the plan. Executing it needs your Supabase project, Stripe account, and Vercel project — none of which can be created from inside this demo. Everything above is ready to hand to a build session.*
