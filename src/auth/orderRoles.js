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
  // Full view of every order and every step's history, but can only act as
  // admin on Billing → Agreement Submission → Agreement Received by HQ →
  // Claimed. Everything before that (Stock Order, Stock Transfer) is
  // view-only for this role. Can download the reports tied to that part of
  // the flow.
  billing: {
    adminSteps: [6, 7, 8, 9, 10, 11, 12, 13],
    visibleSteps: "all",
    reports: ["agreementReceived", "claim", "knockoff"],
  },
  // Full view of every order, but never acts as admin on any step — purely
  // for pulling the payment/knock-off reports.
  knockoff: {
    adminSteps: [],
    visibleSteps: "all",
    reports: ["upfront", "firstInstallment", "knockoff", "cashKnockoff"],
  },
  // Only sees and only acts on Stock Order — once an order moves past step 3
  // it disappears from this role's order list entirely.
  purchase: {
    adminSteps: [1, 2, 3],
    visibleSteps: [1, 2, 3],
    reports: [],
  },
  // Sees Stock Order + Stock Transfer, but only acts as admin on Stock
  // Transfer. Once an order moves past step 5 it disappears from view.
  stock: {
    adminSteps: [4, 5],
    visibleSteps: [1, 2, 3, 4, 5],
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
  const roles = ORDER_USER_ROLES[email] || [];
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
