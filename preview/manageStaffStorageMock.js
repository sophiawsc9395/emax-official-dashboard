/**
 * In-memory stand-in for src/storage/index.js, used ONLY by the standalone
 * "Manage Staff" preview bundle (preview/manage-staff-real-preview.jsx).
 * SRBMModal is imported UNMODIFIED straight from src/App.jsx — this file is
 * swapped in for App.jsx's (and ordersApi.js's / rtoApi.js's) `./index.js`
 * import by the preview's esbuild plugin (preview/build-manage-staff-preview.mjs),
 * so there's no live Supabase call and no need for real env vars, but
 * SRBMModal/StaffUpdatePanel/AdjustBalanceWidget's own logic is 100% real —
 * clicking Update/Adjust/rename-ID/etc. actually calls saveData() below and
 * the in-memory store actually changes, same as it would against Supabase.
 *
 * Seed data:
 *  - branchMeta: SUHAIDI set as manager of BOTH T5 and ITCC, sharing one
 *    managerId (EM0360) — demonstrates the identity/managerId behavior in
 *    this panel too (same reward balance shown/adjustable under both
 *    branches' BM cards). KB is left with NO managerId, to demo the red
 *    "⚠ Set Manager ID" warning.
 *  - srList: a mix of Probation/Confirmed SRs at various P/F counts (as
 *    already shipped in DEFAULT_SR, imported for real rather than
 *    retyped), plus one SR (LD branch) with a blank id to demo the
 *    equivalent "⚠ Set SR ID" warning, and one resigned SR (T1/ADRINA) to
 *    demo the collapsed "Resigned / Inactive" section.
 *  - rewardBalances/rewardHistory/statusHistory: real numbers/entries for
 *    SHAHMIRUL (EM0199) and the shared SUHAIDI identity (BM_EM0360), so the
 *    History and Adjust ± buttons have something to show.
 */
const store = {};

// ── SR roster (emax_v5_sr_list) ──────────────────────────────────────────
// Seeded lazily from DEFAULT_SR (imported for real in the harness file and
// passed in via seedSRList below) plus two demo-specific tweaks: a blank-ID
// SR and a resigned SR. See manage-staff-real-preview.jsx for where this is
// populated — kept here as a function so the harness can hand it the real
// DEFAULT_SR array without this mock file needing its own copy of it.
export function seedSRList(DEFAULT_SR) {
  const list = DEFAULT_SR.map(sr => ({ ...sr }));
  // Blank SR ID — demonstrates the "⚠ Set SR ID" warning styling.
  const farah = list.find(s => s.id === "EM0282");
  if (farah) farah.id = "";
  // Resigned SR — demonstrates the collapsed "Resigned / Inactive" section.
  const adrina = list.find(s => s.id === "EM0089");
  if (adrina) { adrina.status = "Resigned"; adrina.resignDate = "2026-09"; }
  store["emax_v5_sr_list"] = list;
  return list;
}

// ── Branch meta (emax_v5_branch_meta) — copied from src/App.jsx's
// DEFAULT_BRANCH_META (not exported, so duplicated here as data only — no
// logic), with two demo tweaks: SUHAIDI's managerId set on both T5 and
// ITCC (shared identity), and KB left with no managerId at all.
store["emax_v5_branch_meta"] = {
  KM: { name: "EMAX Kota Marudu", manager: "SUHAINIZAM", managerId: "EM0500", mStatus: "Confirmed (P5 F0)", address: "1st Flr, EG Mall CL225317046, Jalan Goshen, Kota Marudu" },
  T1: { name: "EMAX Tuaran 1", manager: "REX WENMIN", managerId: "EM0501", mStatus: "Confirmed (P5 F0)", address: "G Flr, Lot 10, Teo Ee Teh Shopping Complex, Tuaran" },
  TW2: { name: "EMAX Tawau 2", manager: "TONY YONG", managerId: "EM0502", mStatus: "Confirmed (P5 F0)", address: "TB 313, Block 37, Fajar Complex, Tawau" },
  TW1: { name: "EMAX Tawau 1", manager: "MAX SIEW", managerId: "EM0503", mStatus: "Director", address: "TB250, Bangunan Hajjah Mastura Ali, Tawau" },
  LD: { name: "EMAX Lahad Datu", manager: "SHAHRUL", managerId: "EM0504", mStatus: "Confirmed (P3 F0)", address: "Lot No.8, G Flr, Linear Blok A, Harbour Town, Lahad Datu" },
  KB: { name: "EMAX Kota Belud", manager: "MAHADI", mStatus: "Confirmed (P2 F3)", address: "No 9, Blk A, G Flr, Bangunan Centenary, Kota Belud" }, // no managerId on purpose
  T5: { name: "EMAX CKS", manager: "SUHAIDI", managerId: "EM0360", mStatus: "Confirmed (P0 F2)", address: "Lot 23-1, Lorong Plaza CKS 2B, Plaza CKS, Tuaran" },
  ITCC: { name: "EMAX ITCC", manager: "SUHAIDI", managerId: "EM0360", mStatus: "Confirmed (P0 F1)", address: "Lot G-48 & G-49, G Flr, ITCC Mall, Penampang" },
  TENOM: { name: "EMAX Tenom", manager: "AZIQIL", managerId: "EM0505", mStatus: "Probation (P1 F1)", address: "Lot 26, Blk E, Jln Toh Puah Hajjah Khusnah, Tenom" },
  HQ: { name: "EMAX HQ", manager: "MIKE PANG", managerId: "EM0506", mStatus: "Confirmed (P0 F1)", address: "Lot 2, HM Penampang, Kota Kinabalu" },
};

// ── Reward balances (emax_v5_reward_balance) ─────────────────────────────
store["emax_v5_reward_balance"] = {
  EM0199: { balance: 3400 },      // SHAHMIRUL (T5 SR)
  EM0285: { balance: 800 },       // ESTHER (KM SR)
  BM_EM0360: { balance: 5200 },   // SUHAIDI — shared across T5 + ITCC
};

// ── Reward points history (emax_v5_reward_history) ───────────────────────
store["emax_v5_reward_history"] = {
  EM0199: [
    { date: "2026-07-15T02:00:00.000Z", type: "adjustment", amount: 1000, note: "Q2 target achievement bonus" },
    { date: "2026-08-20T03:00:00.000Z", type: "adjustment", amount: 900, note: "Reward points tier payout" },
    { date: "2026-09-25T04:00:00.000Z", type: "adjustment", amount: 1500, note: "Reward points tier payout" },
  ],
  BM_EM0360: [
    { date: "2026-08-01T01:00:00.000Z", type: "adjustment", amount: 3000, note: "Branch achievement bonus — T5 + ITCC combined" },
    { date: "2026-09-10T01:00:00.000Z", type: "adjustment", amount: 2200, note: "Branch achievement bonus" },
  ],
};

// ── Status history (emax_v5_status_history) — always branch-scoped for a
// BM (BM_<branch>, never BM_<managerId>), by ID for an SR. ─────────────────
store["emax_v5_status_history"] = {
  EM0199: [
    { date: "2026-04-01T01:00:00.000Z", status: "Probation (P0 F0)", note: "Confirmed as SR" },
    { date: "2026-07-01T01:00:00.000Z", status: "Confirmed (P1 F4)", note: "Staff update (effective 2026-07): status → Confirmed (P1 F4)" },
  ],
  BM_T5: [
    { date: "2026-01-01T01:00:00.000Z", status: "Probation (P0 F0)", note: "Appointed Branch Manager, EMAX CKS" },
    { date: "2026-06-01T01:00:00.000Z", status: "Confirmed (P0 F2)", note: "Staff update (effective 2026-06): status → Confirmed (P0 F2)" },
  ],
  BM_ITCC: [
    { date: "2026-03-01T01:00:00.000Z", status: "Probation (P0 F0)", note: "Also appointed Branch Manager, EMAX ITCC (same identity as CKS)" },
    { date: "2026-08-01T01:00:00.000Z", status: "Confirmed (P0 F1)", note: "Staff update (effective 2026-08): status → Confirmed (P0 F1)" },
  ],
  EM0089: [
    { date: "2026-09-18T01:00:00.000Z", status: "Resigned", note: "Resignation date: 2026-09" },
  ],
};

// SR Type overrides (emax_v5_sr_types_YYYY_M) intentionally left unseeded —
// SRBMModal falls back to each SR's own `type` field when no override
// exists for the selected month, same as a real first run.

export async function loadData(key) {
  await new Promise(r => setTimeout(r, 100)); // small delay so loading/save states are visible
  return Object.prototype.hasOwnProperty.call(store, key) ? JSON.parse(JSON.stringify(store[key])) : null;
}

export async function saveData(key, value) {
  await new Promise(r => setTimeout(r, 70));
  if (value === null || value === undefined) { delete store[key]; return { ok: true }; }
  store[key] = JSON.parse(JSON.stringify(value));
  return { ok: true };
}

// Not used by SRBMModal, but exported for parity in case anything else
// pulled in during bundling (ordersApi.js, rtoApi.js) expects it.
export const supabase = null;
