/**
 * Rent-to-Own data layer — Supabase-backed, ERP-style.
 *
 * Replaces the old "one giant JSON blob in app_storage" model with:
 *   - `rto_customers`  one row per customer (header + denormalized
 *                      paid_count/total_received — the list view and
 *                      portfolio totals never need to touch payments)
 *   - `rto_payments`   one row per scheduled month, upserted individually
 *
 * The rest of the app (RTOTab.jsx, RTOSummary.jsx) still works with plain
 * JS customer objects shaped like `{...fields, payments:{[schedKey]:{...}}}`
 * — this module is the only place that knows about the underlying tables.
 */

import { supabase } from "./index.js";

const CUSTOMERS_TABLE = "rto_customers";
const PAYMENTS_TABLE = "rto_payments";

const CORE_COLUMNS = [
  "id","memberId","name","branch","contactNumber","salesInvoiceDate","tenure",
  "monthlyInstallment","financePrice","agreementFee","stampingFee","cost",
  "autoDebitMonth","autoDebitYear","paidCount","totalReceived",
];

function rowToCustomer(row) {
  return {
    ...(row.data || {}),
    id: row.id,
    memberId: row.member_id || "",
    name: row.name || "",
    branch: row.branch || "",
    contactNumber: row.contact_number || "",
    salesInvoiceDate: row.sales_invoice_date || "",
    tenure: row.tenure ?? "",
    monthlyInstallment: row.monthly_installment ?? "",
    financePrice: row.finance_price ?? "",
    agreementFee: row.agreement_fee ?? "",
    stampingFee: row.stamping_fee ?? "",
    cost: row.cost ?? "",
    autoDebitMonth: row.auto_debit_month ?? "",
    autoDebitYear: row.auto_debit_year ?? "",
    paidCount: row.paid_count || 0,
    totalReceived: parseFloat(row.total_received) || 0,
  };
}

function customerToRow(customer) {
  const rest = {};
  for (const k of Object.keys(customer)) {
    if (k === "payments" || CORE_COLUMNS.includes(k)) continue;
    rest[k] = customer[k];
  }
  return {
    id: String(customer.id),
    member_id: customer.memberId || null,
    name: customer.name || null,
    branch: customer.branch || null,
    contact_number: customer.contactNumber || null,
    sales_invoice_date: customer.salesInvoiceDate || null,
    tenure: customer.tenure ? parseInt(customer.tenure) : null,
    monthly_installment: customer.monthlyInstallment ? parseFloat(customer.monthlyInstallment) : null,
    finance_price: customer.financePrice ? parseFloat(customer.financePrice) : null,
    agreement_fee: customer.agreementFee ? parseFloat(customer.agreementFee) : null,
    stamping_fee: customer.stampingFee ? parseFloat(customer.stampingFee) : null,
    cost: customer.cost ? parseFloat(customer.cost) : null,
    auto_debit_month: customer.autoDebitMonth ? parseInt(customer.autoDebitMonth) : null,
    auto_debit_year: customer.autoDebitYear ? parseInt(customer.autoDebitYear) : null,
    data: rest,
  };
}

function rowToPayment(row) {
  return { paid: row.paid, amount: row.amount != null ? parseFloat(row.amount) : undefined, date: row.pay_date || "", invOpened: row.inv_opened, remark: row.remark || undefined, partialPayments: row.partial_payments || [] };
}

/* ── Reads ─────────────────────────────────────────────────────────────── */

// Headers only — no payments. This is the ONLY query the customer list/cards
// need: paidCount + totalReceived are denormalized right on the row.
export async function listCustomers() {
  const { data, error } = await supabase.from(CUSTOMERS_TABLE).select("*").order("name", { ascending: true });
  if (error) { console.error("listCustomers error:", error); return []; }
  return (data || []).map(rowToCustomer);
}

// Full payment schedule for ONE customer — fetched only when their detail
// panel (PaymentSchedule) is opened.
export async function getCustomerPayments(customerId) {
  const { data, error } = await supabase.from(PAYMENTS_TABLE).select("*").eq("customer_id", String(customerId));
  if (error) { console.error("getCustomerPayments error:", error); return {}; }
  const out = {};
  for (const r of data || []) out[r.sched_key] = rowToPayment(r);
  return out;
}

// Batched payments for MANY customers in one query — used by the Portfolio
// Summary view, which needs overdue/current-due/upcoming across everyone.
export async function getPaymentsForCustomers(customerIds) {
  const ids = [...new Set((customerIds || []).map(String))];
  if (!ids.length) return {};
  const { data, error } = await supabase.from(PAYMENTS_TABLE).select("*").in("customer_id", ids);
  if (error) { console.error("getPaymentsForCustomers error:", error); return {}; }
  const byId = {};
  for (const r of data || []) {
    (byId[r.customer_id] ||= {})[r.sched_key] = rowToPayment(r);
  }
  return byId;
}

/* ── Writes ────────────────────────────────────────────────────────────── */

// Add/Edit Customer form only ever touches header fields — never payments.
export async function saveCustomer(customer) {
  const { error } = await supabase.from(CUSTOMERS_TABLE).upsert(customerToRow(customer), { onConflict: "id" });
  if (error) { console.error("saveCustomer error:", error); return { ok: false, error }; }
  return { ok: true };
}

export async function deleteCustomer(id) {
  const { error } = await supabase.from(CUSTOMERS_TABLE).delete().eq("id", String(id));
  if (error) { console.error("deleteCustomer error:", error); return { ok: false, error }; }
  return { ok: true };
}

// Marks ONE scheduled month paid/unpaid/INV-opened. Upserts exactly one
// rto_payments row, then updates just this customer's two denormalized
// aggregate columns — never rewrites any other customer's data.
export async function updatePayment(customerId, schedKey, payData, aggregates) {
  const paymentRow = {
    customer_id: String(customerId),
    sched_key: schedKey,
    paid: !!payData.paid,
    amount: payData.amount != null ? parseFloat(payData.amount) : null,
    pay_date: payData.date || null,
    inv_opened: !!payData.invOpened,
    remark: payData.remark || null,
    partial_payments: payData.partialPayments || [],
  };
  const { error: payErr } = await supabase.from(PAYMENTS_TABLE).upsert(paymentRow, { onConflict: "customer_id,sched_key" });
  if (payErr) { console.error("updatePayment (payment row) error:", payErr); return { ok: false, error: payErr }; }

  const { error: custErr } = await supabase
    .from(CUSTOMERS_TABLE)
    .update({ paid_count: aggregates.paidCount, total_received: aggregates.totalReceived })
    .eq("id", String(customerId));
  if (custErr) { console.error("updatePayment (aggregate) error:", custErr); return { ok: false, error: custErr }; }
  return { ok: true };
}
