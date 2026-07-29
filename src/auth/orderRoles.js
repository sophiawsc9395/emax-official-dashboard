/**
 * Order-page-only role system.
 *
 * These five roles exist purely to give a handful of HQ staff restricted
 * access to the Order Tracking page (src/OrderTab.jsx) without giving them
 * the full admin dashboard (Rankings, Monthly Report, RTO, etc.) — they're
 * meant to be used from a dedicated entry point (order-main.jsx / order.html),
 * not from the main dashboard.
 *
 * A user can hold more than one role at once (e.g. one person covering both
 * billing and knock-off duties) — permissions from every role they hold are
 * merged together (union), so having more roles only ever grants more access,
 * never less.
 *
 *   adminSteps:   step numbers (per STEPS in OrderTab.jsx) this role can act
 *                 on — fill in forms, advance the order, etc. "all" = every
 *                 step (super admin).
 *   visibleSteps: step numbers this role is allowed to see orders for at all.
 *                 Orders currently sitting on a step outside this set are
 *                 hidden from the order list entirely. "all" = every order,
 *                 regardless of step (full order-flow visibility).
 *   reports:      which report types (matching the `type` values used by
 *                 downloadReport in OrderTab.jsx) this role can download.
 *                 "all" = every report.
 */

// Step numbers by phase, for reference (see PHASES/STEPS in OrderTab.jsx):
//   Stock Order:          1, 2, 3
//   Stock Transfer:       4, 5
//   Billing:              6, 7, 8, 9
//   Agreement Submission: 10
//   Agreement Received:   11
//   Claimed:              12, 13
//   Completed:            14

export const ORDER_ROLE_DEFS = {
  // Sees every step from Billing through Claimed. Billing Request (6),
  // Customer Collection (8), and Agreement Submission (10) are genuinely
  // done by the branch, so this role is view-only there — admin capability
  // is on Billed (7), Collection Verified (9), Agreement Received by HQ
  // (11), Claim Submitted (12), and Claim Released (13).
  billing: {
    adminSteps: [7, 9, 11, 12, 13],
    visibleSteps: [6, 7, 8, 9, 10, 11, 12, 13],
    reports: ["agreementReceived", "claim", "knockoff", "collectionOverdue"],
  },
  // Sees every step from Billing Request through Claim Released — never acts
  // as admin on any of them, purely for pulling the payment/knock-off
  // reports (which pull from the full order set regardless of card visibility).
  knockoff: {
    adminSteps: [],
    visibleSteps: [6, 7, 8, 9, 10, 11, 12, 13],
    reports: ["upfront", "firstInstallment", "firstInstallmentKnockoff", "knockoff", "cashKnockoff"],
  },
  // Only sees and only acts on Stock Order — once an order moves past step 3
  // it disappears from this role's order list entirely.
  purchase: {
    adminSteps: [1, 2, 3],
    visibleSteps: [1, 2, 3],
    reports: ["purchaseClaim"],
  },
  // Sees Arrived HQ (view-only — that's Purchase's finish line, not theirs)
  // through Arrived Branch, but only acts as admin on Dispatched to Branch
  // and Arrived Branch. Does NOT see New Order Request / Ordered — those are
  // Purchase's cards, not Stock's.
  stock: {
    adminSteps: [4, 5],
    visibleSteps: [3, 4, 5],
    reports: [],
  },
  // Full super-admin — everything, same as the main dashboard's order admin,
  // just scoped to this Order-page-only entry point.
  superAdmin: {
    adminSteps: "all",
    visibleSteps: "all",
    reports: "all",
  },
};

// Which roles each Supabase-authenticated email holds. A user with no entry
// here isn't allowed onto this page at all (see order-main.jsx's AuthGate).
export const ORDER_USER_ROLES = {
  "emaxbilling@gmail.com": ["billing"],
  "emaxknockoff@gmail.com": ["knockoff"],
  "emaxpurchase@gmail.com": ["purchase"],
  "emaxstock@gmail.com": ["stock"],
  "boontheng2004@gmail.com": ["superAdmin", "billing", "knockoff", "purchase", "stock"],
  "sophiawsc9395@gmail.com": ["billing", "knockoff", "purchase", "stock", "superAdmin"],
};

/**
 * Merge every role a user holds into one permissions object, matching the
 * `orderPermissions` shape OrderTab.jsx expects. Returns null if the email
 * holds no roles at all.
 */
export function mergeOrderPermissions(email) {
  const normalizedEmail = (email || "").toLowerCase();
  const roleKey = Object.keys(ORDER_USER_ROLES).find(k => k.toLowerCase() === normalizedEmail);
  const roles = roleKey ? ORDER_USER_ROLES[roleKey] : [];
  if (!roles.length) return null;

  let adminAll = false, visibleAll = false, reportsAll = false;
  const adminSteps = new Set(), visibleSteps = new Set(), reports = new Set();

  roles.forEach(roleName => {
    const def = ORDER_ROLE_DEFS[roleName];
    if (!def) return;
    if (def.adminSteps === "all") adminAll = true; else def.adminSteps.forEach(s => adminSteps.add(s));
    if (def.visibleSteps === "all") visibleAll = true; else def.visibleSteps.forEach(s => visibleSteps.add(s));
    if (def.reports === "all") reportsAll = true; else def.reports.forEach(r => reports.add(r));
  });

  return {
    adminSteps: adminAll ? "all" : [...adminSteps],
    visibleSteps: visibleAll ? "all" : [...visibleSteps],
    reports: reportsAll ? "all" : [...reports],
  };
}

/**
 * Daily Sales Report access — submit is Billing-role territory (step 7 =
 * Billed, same step that gates the Billing role elsewhere), verify is
 * Knock-off Admin territory (same role that already owns the knock-off
 * reports). A true super admin (isAdmin with no orderPermissions object at
 * all — the main dashboard) gets both regardless. isReadOnly (view-only Boss
 * Viewer sessions without elevated access) blocks both no matter what.
 */
export function getDailySalesAccess(isAdmin, orderPermissions, isReadOnly = false) {
  const isSuperAdminOrder = isAdmin && (!orderPermissions || orderPermissions.adminSteps === "all");
  if (isReadOnly) return { isSuperAdminOrder: false, canSubmit: false, canVerify: false };
  const canAdminStep7 = !orderPermissions || orderPermissions.adminSteps === "all" || orderPermissions.adminSteps.includes(7);
  const canSeeKnockoffReport = !orderPermissions || orderPermissions.reports === "all" || orderPermissions.reports.includes("knockoff");
  return {
    isSuperAdminOrder,
    canSubmit: isSuperAdminOrder || (isAdmin && canAdminStep7),
    canVerify: isSuperAdminOrder || (isAdmin && canSeeKnockoffReport),
  };
}

/**
 * Resolve the most contextually-relevant role label for a specific email —
 * used for edit-log attribution so someone like Sophia or boontheng2004
 * (who hold Super Admin alongside Billing/Knock-off/etc.) get attributed by
 * whichever role is actually relevant to the action, not their broadest
 * title. priorityRoles lists which role to prefer first, in order, e.g.
 * ["billing","knockoff","superAdmin"] for a sales-figure edit.
 * Returns null if the email isn't recognized at all (caller should fall
 * back to its own capability-based heuristic in that case).
 */
const ROLE_DISPLAY_LABELS = { billing: "Billing", knockoff: "Knock-off", purchase: "Purchase", stock: "Stock", superAdmin: "Super Admin" };
export function resolveEditorRole(email, priorityRoles = ["billing", "knockoff", "purchase", "stock", "superAdmin"]) {
  const normalizedEmail = (email || "").toLowerCase();
  const roleKey = Object.keys(ORDER_USER_ROLES).find(k => k.toLowerCase() === normalizedEmail);
  const roles = roleKey ? ORDER_USER_ROLES[roleKey] : [];
  if (!roles.length) return null;
  const best = priorityRoles.find(r => roles.includes(r)) || roles[0];
  return ROLE_DISPLAY_LABELS[best] || best;
}

