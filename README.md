# IonxSupply — e-motive parts marketplace (demo)

**Live demo:** https://krenniccrinek-hash.github.io/volthub-demo/

A fully client-side simulation of IonxSupply, a multi-seller marketplace for e-bike / e-scooter / e-moto parts. Everything runs in your browser with `localStorage` — no backend, no real payments, sample data only.

## What you can do in the demo
- Browse: trending parts, categories, **shop-by-bike fitment search**, filters (category, condition, price, bike), sort
- Accounts: sign up / sign in, or one-click **demo personas** (buyer / seller / admin)
- Buy: multi-seller cart, **seller discount codes** at checkout, simulated payment, order tracking timeline, confirm delivery
- Trust: verified-purchase **seller reviews**, **report a seller**, refund-request disputes
- Sell: apply to become a seller (instant demo approval), list parts with **specs + fitment tags**, create discount codes, mark orders shipped
- Admin: application queue, report/dispute moderation, **suspend sellers** (listings vanish market-wide)
- Legal pack: ToS, Privacy, Prohibited Items (battery rules), Refund policy

## Demo accounts
| Role | Email | Password |
|---|---|---|
| Buyer | buyer@demo.com | demo1234 |
| Seller (Volt Garage) | seller@demo.com | demo1234 |
| Admin | admin@demo.com | demo1234 |

Or use the one-click persona buttons on the sign-in modal. "Reset demo data" in the top bar restores the seed.

## Photos
Product photos are CC-licensed images from Wikimedia Commons, committed into `img/` so they never break. Sources and licenses: `img/_attributions.txt`. New listings can supply any image URL (branded SVG part-art renders as fallback).

## Stack
Plain HTML/CSS/JS, no build step. `data.js` (seed) → `ui.js` (icons, SVG part art, motion helpers) → `app.js` (hash router, simulated marketplace engine — same pricing contract as the production plan: 10% platform fee, min $0.50, per-seller order splits).

The production build plan (Next.js 16 + Supabase + Stripe Connect) lives in the private plan pack; this demo is its visual + UX reference implementation.
