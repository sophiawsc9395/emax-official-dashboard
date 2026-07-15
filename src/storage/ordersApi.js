/**
 * Orders data layer — Supabase-backed, ERP-style (v2).
 *
 * Replaces the old "one giant JSON blob in app_storage" model with:
 *   - `orders`         one row per order (header/current-state, no history, no files)
 *   - `order_history`  one row per tracking event (append-only, fetched lazily per order)
 *   - Storage bucket `order-files` for every uploaded file (no more base64 in JSON)
 *
 * The rest of the app (OrderTab.jsx and everything under it) still works with
 * plain JS order objects shaped like `{...fields, history:[...]}` — this module
 * is the only place that knows about the underlying tables, so the 1200+ lines
 * of existing UI/business logic did not need to be rewritten.
 */

import { supabase } from "./index.js";

const ORDERS_TABLE = "orders";
const HISTORY_TABLE = "order_history";
const BUCKET = "order-files";

/* ── Row <-> order object mapping ─────────────────────────────────────── */

const CORE_COLUMNS = [
  "id","step","branch","orderType","stockStatus","cancelled","cancelledReason",
  "customerName","phoneModel","agreementNumber","invoiceNo","merchant",
  "shortPaymentPending","pendingBranchAction","lastHistoryDate","lastHistoryTime",
  "stepDates","lastVerification",
];

function rowToOrder(row) {
  return {
    ...(row.data || {}),
    id: row.id,
    step: row.step,
    branch: row.branch,
    orderType: row.order_type,
    stockStatus: row.stock_status,
    cancelled: row.cancelled,
    cancelledReason: row.cancelled_reason || undefined,
    customerName: row.customer_name,
    phoneModel: row.phone_model,
    agreementNumber: row.agreement_number || undefined,
    invoiceNo: row.invoice_no || undefined,
    merchant: row.merchant || undefined,
    shortPaymentPending: row.short_payment_pending,
    pendingBranchAction: row.pending_branch_action,
    lastHistoryDate: row.last_history_date || undefined,
    lastHistoryTime: row.last_history_time || undefined,
    stepDates: row.step_dates || {},
    lastVerification: row.last_verification || undefined,
  };
}

function orderToRow(order) {
  const rest = {};
  for (const k of Object.keys(order)) {
    if (k === "history" || CORE_COLUMNS.includes(k)) continue;
    rest[k] = order[k];
  }
  return {
    id: String(order.id),
    step: order.step || 1,
    branch: order.branch || null,
    order_type: order.orderType || "ccm",
    stock_status: order.stockStatus || null,
    cancelled: !!order.cancelled,
    cancelled_reason: order.cancelledReason || null,
    customer_name: order.customerName || null,
    phone_model: order.phoneModel || null,
    agreement_number: order.agreementNumber || null,
    invoice_no: order.invoiceNo || null,
    merchant: order.merchant || null,
    short_payment_pending: !!order.shortPaymentPending,
    pending_branch_action: !!order.pendingBranchAction,
    last_history_date: order.lastHistoryDate || null,
    last_history_time: order.lastHistoryTime || null,
    step_dates: order.stepDates || {},
    last_verification: order.lastVerification || null,
    data: rest,
  };
}

// Mirrors isShortPaymentPending / isPendingBranchAction in OrderTab.jsx —
// keep in sync if that logic ever changes.
function applyHistoryEntry(order, entry) {
  const patch = {};
  if (entry.date) patch.lastHistoryDate = entry.date;
  if (entry.time) patch.lastHistoryTime = entry.time;
  patch.stepDates = { ...(order.stepDates || {}), [String(entry.step)]: { date: entry.date, time: entry.time } };
  if (entry.step === 9) patch.lastVerification = { ...entry };
  if (entry.shortPayment || entry.collectionChecked !== undefined) {
    patch.shortPaymentPending = !!entry.shortPayment;
  }
  if (entry.issueItems || entry.checklistItems) {
    patch.pendingBranchAction = !!entry.issueItems; // truthy on the *key*, matches original (empty array still "pending")
  }
  return patch;
}

/* ── Reads ─────────────────────────────────────────────────────────────── */

// List order headers — no history, no files. This is the ONLY query the
// Order page's list/board view needs, regardless of how much history piles up.
// Pass `branch` to scope the query itself (not just the client-side filter)
// for branch viewers, so they never download other branches' headers.
export async function listOrders(branch = null) {
  let q = supabase.from(ORDERS_TABLE).select("*").order("id", { ascending: false });
  if (branch) q = q.eq("branch", branch);
  const { data, error } = await q;
  if (error) { console.error("listOrders error:", error); return []; }
  return (data || []).map(rowToOrder);
}

// Fetch one order's full timeline — called only when opening Order Detail.
export async function getOrderHistory(orderId) {
  const { data, error } = await supabase
    .from(HISTORY_TABLE)
    .select("*")
    .eq("order_id", String(orderId))
    .order("id", { ascending: true });
  if (error) { console.error("getOrderHistory error:", error); return []; }
  return (data || []).map(r => ({ step: r.step, date: r.date, time: r.time, ...(r.data || {}) }));
}

// Fetch history for MANY orders in one query — used by report generation,
// which needs a couple of history-derived fields (e.g. the Completed-report
// timestamp) across a whole filtered batch rather than one order.
export async function getHistoryForOrders(orderIds) {
  const ids = [...new Set((orderIds || []).map(String))];
  if (!ids.length) return {};
  const { data, error } = await supabase
    .from(HISTORY_TABLE)
    .select("*")
    .in("order_id", ids)
    .order("id", { ascending: true });
  if (error) { console.error("getHistoryForOrders error:", error); return {}; }
  const byId = {};
  for (const r of data || []) {
    (byId[r.order_id] ||= []).push({ step: r.step, date: r.date, time: r.time, ...(r.data || {}) });
  }
  return byId;
}

// Refresh a single order's header row — used after a write so the list/board
// state can be patched in place instead of re-listing every order.
export async function getOrder(id) {
  const { data, error } = await supabase.from(ORDERS_TABLE).select("*").eq("id", String(id)).maybeSingle();
  if (error) { console.error("getOrder error:", error); return null; }
  return data ? rowToOrder(data) : null;
}

/* ── File uploads (replaces base64-in-JSON) ──────────────────────────────
 * A "file ref" stored anywhere in an order/history object now looks like
 * {name, path} — never {name, data:"data:...base64"}. URLs are generated
 * on demand (signed, time-limited) rather than baked in, since these are
 * often sensitive documents (IC copies, payment slips, agreements).       */

function extForName(name) {
  const m = /\.([a-zA-Z0-9]+)$/.exec(name || "");
  return m ? m[1] : "bin";
}

// blob: a Blob/File. name: original filename (for display + extension).
export async function uploadOrderFile(orderId, blob, name) {
  const path = `${orderId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${extForName(name)}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    upsert: false,
    contentType: blob.type || undefined,
  });
  if (error) { console.error("uploadOrderFile error:", error); throw error; }
  return { name: name || path.split("/").pop(), path };
}

export async function signFileUrl(path, expiresIn = 60 * 60 * 24) {
  if (!path) return null;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, expiresIn);
  if (error) { console.error("signFileUrl error:", error); return null; }
  return data?.signedUrl || null;
}

function isFileRef(v) {
  return !!v && typeof v === "object" && typeof v.path === "string" && typeof v.name === "string" && !v.url;
}

// Deep-walks any object/array and signs every {name,path} file ref it finds,
// wherever it's nested (history[].files, billingData.*, depositSlip, etc.)
async function signDeep(obj) {
  if (Array.isArray(obj)) {
    const out = [];
    for (const item of obj) out.push(await signDeep(item));
    return out;
  }
  if (obj && typeof obj === "object") {
    if (isFileRef(obj)) return { ...obj, url: await signFileUrl(obj.path) };
    const out = {};
    for (const k of Object.keys(obj)) out[k] = await signDeep(obj[k]);
    return out;
  }
  return obj;
}

export async function signOrderFiles(orderOrHistory) {
  return signDeep(orderOrHistory);
}

/* ── Writes ────────────────────────────────────────────────────────────── */

// Core reconciliation engine. Compares `newList` against `oldList` (both the
// same shape the app already uses: order objects with an embedded `history`
// array) and issues only the *targeted* writes needed — new history rows for
// whatever got appended, an upsert of the order's current-state row, and
// deletes for any order removed from the list. Never rewrites the whole table.
export async function reconcile(oldList, newList) {
  const oldById = new Map((oldList || []).map(o => [String(o.id), o]));
  const newIds = new Set((newList || []).map(o => String(o.id)));
  const toDelete = (oldList || []).filter(o => !newIds.has(String(o.id))).map(o => String(o.id));

  const orderRows = [];
  const historyRows = [];

  for (const order of newList || []) {
    const old = oldById.get(String(order.id));
    const newHist = Array.isArray(order.history) ? order.history : [];
    const oldHistLen = old && Array.isArray(old.history) ? old.history.length : 0;
    const entriesToInsert = newHist.slice(oldHistLen);

    let denorm = {};
    for (const entry of entriesToInsert) {
      denorm = { ...denorm, ...applyHistoryEntry({ ...order, ...denorm }, entry) };
    }
    orderRows.push(orderToRow({ ...order, ...denorm }));

    for (const entry of entriesToInsert) {
      const { step, date, time, ...data } = entry;
      historyRows.push({ order_id: String(order.id), step: step ?? order.step, date: date || null, time: time || null, data });
    }
  }

  try {
    if (toDelete.length) {
      const { error } = await supabase.from(ORDERS_TABLE).delete().in("id", toDelete);
      if (error) throw error;
    }
    if (orderRows.length) {
      const { error } = await supabase.from(ORDERS_TABLE).upsert(orderRows, { onConflict: "id" });
      if (error) throw error;
    }
    if (historyRows.length) {
      const { error } = await supabase.from(HISTORY_TABLE).insert(historyRows);
      if (error) throw error;
    }
    return { ok: true };
  } catch (error) {
    console.error("reconcile error:", error);
    return { ok: false, error };
  }
}

export async function deleteOrder(id) {
  const { error } = await supabase.from(ORDERS_TABLE).delete().eq("id", String(id));
  if (error) { console.error("deleteOrder error:", error); return { ok: false, error }; }
  return { ok: true };
}

export async function deleteOrders(ids) {
  const list = (ids || []).map(String);
  if (!list.length) return { ok: true };
  const { error } = await supabase.from(ORDERS_TABLE).delete().in("id", list);
  if (error) { console.error("deleteOrders error:", error); return { ok: false, error }; }
  return { ok: true };
}
