# Offline Support and WhatsApp Daily Summaries

This note outlines options to support using the system **offline** and to send **WhatsApp daily summaries** when using the URY POS and Erp backend.

---

## Offline support

### What “offline” means here

- **POS devices** (tablets/phones) may have no or unstable internet.
- You still want to take orders, add items to the cart, and (optionally) print KOTs.
- When the connection is back, you want to sync orders and payments to the server.

### Possible approaches

1. **Progressive Web App (PWA) + local storage**
   - Build the POS React app as a PWA so it can be “installed” and opened from the home screen.
   - Use **local storage / IndexedDB** to:
     - Cache menu, items, and tables (refreshed when online).
     - Store **draft orders** and **pending payments** locally when offline.
   - When the app detects it’s online again:
     - Sync draft orders to the server (create/update POS Invoices).
     - Sync payments and then clear local drafts.
   - **Pros:** No extra server; works with current Erp backend.  
   - **Cons:** You must design conflict handling (e.g. same table edited on two devices) and ensure no duplicate submissions.

2. **Local-first / sync engine**
   - Use a sync layer (e.g. **RxDB**, **PowerSync**, or a custom queue) that:
     - Keeps a local copy of the data the POS needs (menu, items, tables).
     - Queues mutations (new orders, payments) and replays them when the server is reachable.
   - The Erp backend would need **idempotent** APIs (e.g. “create order with client-generated UUID”) so that retries don’t create duplicates.
   - **Pros:** Smoother offline UX and predictable sync.  
   - **Cons:** More front-end and API design work.

3. **Hybrid: offline drafts, online submit**
   - Simpler variant of (1): when offline, the POS only saves order and payment as **local drafts** (no server call).
   - When back online, user taps “Sync” (or it auto-syncs) and the app:
     - Creates POS Invoices (and related docs) from drafts.
     - Creates payment entries.
   - **Pros:** Easiest to add on top of the current flow.  
   - **Cons:** No real-time sync of stock or menu from server while offline; you rely on last cached data.

**Recommendation:** Start with (3): add local drafts and a “Sync when online” step. Later, if you need stronger offline behaviour, move toward (1) or (2) with a proper sync strategy.

---

## WhatsApp daily summaries

### Goal

Send a **daily summary** (e.g. sales, top items, low stock, or outstanding receivables) to a WhatsApp number or group.

### Options

1. **WhatsApp Business API (official)**
   - Use **Meta’s WhatsApp Business API** (via a BSP or provider like Twilio, MessageBird, 360dialog).
   - From the Erp server, call the provider’s HTTP API to send a template or session message.
   - **Pros:** Compliant, scalable, supports templates and rich content.  
   - **Cons:** Business verification, possible costs, and template approval for marketing-style content.

2. **Scheduled report + email, then forward to WhatsApp**
   - Use Erp’s **scheduler** (or a cron job) to run a report (e.g. “Daily sales summary”) and attach or embed it in an **email**.
   - Use a “Email to WhatsApp” gateway (if available in your region) or manually forward the email to a WhatsApp group.
   - **Pros:** Simple; reuses existing reporting.  
   - **Cons:** Not native WhatsApp; may not be real-time.

3. **Third-party “notifications to WhatsApp” services**
   - Some services (e.g. **ClickSend**, **WhatsApp-notification bots**) let you send a message to WhatsApp via an API or webhook.
   - From Erp, call their API (e.g. from a **scheduled job** or **after_submit** hook) with a short summary text.
   - **Pros:** Quick to wire up.  
   - **Cons:** Check ToS and reliability; some use unofficial channels.

4. **Implement inside URY / Erp**
   - Add a **Daily Summary** doctype or **Server Script** that:
     - Runs on a schedule (e.g. 8 PM daily).
     - Computes: today’s sales, top items, low stock, unpaid customer/supplier totals (using existing URY/Erp APIs).
     - Builds a short message (plain text or HTML).
     - Calls an external HTTP API (WhatsApp provider or your own relay) to send the message.
   - Store the WhatsApp recipient(s) and API credentials in **Customize** or a small custom DocType so they’re configurable per site.

**Recommendation:** For a first version, implement (4) with a scheduled job that builds the summary and sends it via one chosen channel (e.g. WhatsApp Business API or a single third-party API). Reuse the same report logic you use in the POS Reports and Parties screens (sales, profitability, low stock, receivables/payables) so the numbers stay consistent.

---

## Summary

| Topic              | Suggested direction |
|--------------------|----------------------|
| **Offline**        | Start with local drafts for orders/payments and a “Sync when online” flow; later consider PWA + sync engine if you need full offline capability. |
| **WhatsApp**       | Add a scheduled job in URY/Erp that builds a daily summary from existing data and sends it via WhatsApp Business API or another provider you choose. |

If you share your preferred WhatsApp provider (or “email only” for a first step), the next step can be a concrete design for the daily summary job and the exact API calls.
