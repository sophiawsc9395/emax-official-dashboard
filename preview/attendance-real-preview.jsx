/**
 * Standalone preview harness for the REAL src/AttendanceTab.jsx — imports
 * the actual production component unmodified (not a re-typed copy) so what
 * Sophia clicks through here is exactly the code that's shipping. Only the
 * Supabase-backed storage import is swapped for an in-memory mock (see
 * preview/storageMock.js + preview/build-real-preview.mjs) so it runs
 * standalone with no live database connection.
 *
 * branchMeta / srList below are copied verbatim from the real
 * DEFAULT_BRANCH_META / DEFAULT_SR in src/App.jsx (not re-typed data) —
 * this is data, not logic, so it's duplicated here rather than importing
 * all of App.jsx (which would drag in OrderTab/DailySalesTab/JCL/etc. and
 * its own live Supabase client just to reach two constants).
 */
import { useState } from "react";
import { createRoot } from "react-dom/client";
import AttendanceTab from "../src/AttendanceTab.jsx";

const C = { navy: "#0A1628", navyLight: "#162B52", blue: "#1B3F72", blueBright: "#2C5AA0", white: "#fff", surface: "#F7F9FC", border: "#E4EAF2", text: "#0A1628", textMid: "#4A5568", textLight: "#8A96A8" };

// ── Verbatim from src/App.jsx DEFAULT_BRANCH_META ────────────────────────
const BRANCH_META = {
  KM: { name: "EMAX Kota Marudu", manager: "SUHAINIZAM", mStatus: "Confirmed (P5 F0)", address: "1st Flr, EG Mall CL225317046, Jalan Goshen, Kota Marudu" },
  T1: { name: "EMAX Tuaran 1", manager: "REX WENMIN", mStatus: "Confirmed (P5 F0)", address: "G Flr, Lot 10, Teo Ee Teh Shopping Complex, Tuaran" },
  TW2: { name: "EMAX Tawau 2", manager: "TONY YONG", mStatus: "Confirmed (P5 F0)", address: "TB 313, Block 37, Fajar Complex, Tawau" },
  TW1: { name: "EMAX Tawau 1", manager: "MAX SIEW", mStatus: "Director", address: "TB250, Bangunan Hajjah Mastura Ali, Tawau" },
  LD: { name: "EMAX Lahad Datu", manager: "SHAHRUL", mStatus: "Confirmed (P3 F0)", address: "Lot No.8, G Flr, Linear Blok A, Harbour Town, Lahad Datu" },
  KB: { name: "EMAX Kota Belud", manager: "MAHADI", mStatus: "Confirmed (P2 F3)", address: "No 9, Blk A, G Flr, Bangunan Centenary, Kota Belud" },
  T5: { name: "EMAX CKS", manager: "SUHAIDI", mStatus: "Confirmed (P0 F2)", address: "Lot 23-1, Lorong Plaza CKS 2B, Plaza CKS, Tuaran" },
  ITCC: { name: "EMAX ITCC", manager: "SUHAIDI", mStatus: "Confirmed (P0 F1)", address: "Lot G-48 & G-49, G Flr, ITCC Mall, Penampang" },
  TENOM: { name: "EMAX Tenom", manager: "AZIQIL", mStatus: "Probation (P1 F1)", address: "Lot 26, Blk E, Jln Toh Puah Hajjah Khusnah, Tenom" },
  HQ: { name: "EMAX HQ", manager: "MIKE PANG", mStatus: "Confirmed (P0 F1)", address: "Lot 2, HM Penampang, Kota Kinabalu" },
};

// ── Verbatim from src/App.jsx DEFAULT_SR ─────────────────────────────────
const SR_LIST = [
  { id: "EM0285", canon: "ESTHER", branch: "KM", type: "Online", status: "Confirmed (P4 F0)" },
  { id: "EM0264", canon: "LYFIE MIEHCHIE", branch: "KM", type: "Offline", status: "Confirmed (P5 F0)" },
  { id: "EM0069", canon: "EFFIEARZERRA", branch: "KM", type: "Offline", status: "Confirmed (P5 F0)" },
  { id: "EM0243", canon: "SITI NORDIANA", branch: "KM", type: "Offline", status: "Confirmed (P5 F0)" },
  { id: "EM0187", canon: "ROSE", branch: "KM", type: "Online", status: "Probation (P0 F0)" },
  { id: "EM0033", canon: "KEVIN CHIN", branch: "T1", type: "Offline", status: "Confirmed (P5 F0)" },
  { id: "EM0045", canon: "INJJIE", branch: "T1", type: "Online", status: "Confirmed (P5 F0)" },
  { id: "EM0056", canon: "EVVY", branch: "T1", type: "Online", status: "Confirmed (P5 F0)" },
  { id: "EM0078", canon: "FRISHIKA", branch: "T1", type: "Online", status: "Confirmed (P3 F1)" },
  { id: "EM0089", canon: "ADRINA", branch: "T1", type: "Online", status: "Probation (P3 F1)" },
  { id: "EM0090", canon: "MASDANIAR", branch: "TW2", type: "Offline", status: "Confirmed (P5 F0)" },
  { id: "EM0103", canon: "ZAHARAH", branch: "TW2", type: "Offline", status: "Confirmed (P5 F0)" },
  { id: "EM0112", canon: "SHAHRIL", branch: "TW2", type: "Offline", status: "Confirmed (P5 F0)" },
  { id: "EM0121", canon: "ERNITA", branch: "TW2", type: "Online", status: "Confirmed (P5 F0)" },
  { id: "EM0197", canon: "NURUL ZIANA", branch: "TW1", type: "Offline", status: "Confirmed (P1 F1)" },
  { id: "EM0229", canon: "NURSHAFATIN", branch: "TW1", type: "Offline", status: "Confirmed (P5 F0)" },
  { id: "EM0231", canon: "MIRA SABRINA", branch: "TW1", type: "Online", status: "Probation (P0 F0)" },
  { id: "EM0232", canon: "NUR ATIKAH", branch: "TW1", type: "Online", status: "Probation (P1 F0)" },
  { id: "EM0233", canon: "NUR DIANA", branch: "TW1", type: "Online", status: "Probation (P0 F0)" },
  { id: "EM0282", canon: "NURUL FARAH", branch: "LD", type: "Offline", status: "Confirmed (P5 F0)" },
  { id: "EM0299", canon: "NURHIKMAH", branch: "LD", type: "Offline", status: "Confirmed (P3 F0)" },
  { id: "EM0300", canon: "ALIF FARHAD", branch: "LD", type: "Offline", status: "Confirmed (P3 F0)" },
  { id: "EM0301", canon: "MAZWANIE", branch: "LD", type: "Offline", status: "Confirmed (P4 F1)" },
  { id: "EM0204", canon: "MOHD FAID", branch: "KB", type: "Offline", status: "Confirmed (P2 F3)" },
  { id: "EM0236", canon: "AERON SEAN", branch: "KB", type: "Offline", status: "Confirmed (P5 F0)" },
  { id: "EM0267", canon: "MUAZAM", branch: "KB", type: "Offline", status: "Confirmed (P2 F3)" },
  { id: "EM0199", canon: "SHAHMIRUL", branch: "T5", type: "Offline", status: "Confirmed (P1 F4)" },
  { id: "EM0306", canon: "AIMAN", branch: "T5", type: "Online", status: "Probation (P1 F1)" },
  { id: "EM0253", canon: "NAZRIN", branch: "ITCC", type: "Online", status: "Probation (P0 F0)" },
  { id: "EM0281", canon: "SAHRIZAN", branch: "ITCC", type: "Offline", status: "Probation (P3 F2)" },
  { id: "EM0305", canon: "O'DONELL", branch: "ITCC", type: "Online", status: "Probation (P1 F1)" },
  { id: "EM0240", canon: "JENIAH", branch: "TENOM", type: "Offline", status: "Confirmed (P5 F0)" },
  { id: "EM0263", canon: "MARDIANA", branch: "TENOM", type: "Offline", status: "Confirmed (P4 F1)" },
  { id: "EM0270", canon: "SHERAIN", branch: "TENOM", type: "Online", status: "Probation (P2 F1)" },
  { id: "EM0290", canon: "ABD FERHAN", branch: "TENOM", type: "Online", status: "Probation (P0 F0)" },
];

const ROLE_TABS = [
  { key: "hr", label: "emaxhr", props: { isAdmin: true, canManageHours: false, allowBranchSwitch: false, userBranch: null, email: "emaxhr@gmail.com" } },
  { key: "sophia", label: "Sophia", props: { isAdmin: true, canManageHours: true, allowBranchSwitch: false, userBranch: null, email: "sophiawsc9395@gmail.com" } },
  { key: "crossBranch", label: "Boon Theng / Wingfei", props: { isAdmin: false, canManageHours: false, allowBranchSwitch: true, userBranch: null, email: "wingfeii@gmail.com" } },
  { key: "branchOwn", label: "Branch Account (EMAX CKS)", props: { isAdmin: false, canManageHours: false, allowBranchSwitch: false, userBranch: "T5", email: "eddy.suhaidi61@gmail.com" } },
];

function Shell() {
  const [roleKey, setRoleKey] = useState("hr");
  const role = ROLE_TABS.find(r => r.key === roleKey);
  return (
    <div style={{ fontFamily: "Inter,-apple-system,sans-serif", background: C.surface, minHeight: "100vh", padding: 20 }}>
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
          <div>
            <div style={{ fontSize: 19, fontWeight: 800, color: C.navy }}>Attendance — real implementation preview</div>
            <div style={{ fontSize: 11, color: C.textLight, marginTop: 2 }}>
              Live component code (src/AttendanceTab.jsx) · storage mocked in-memory · nothing here reaches Supabase
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, background: "#fff", border: `1px solid ${C.border}`, borderRadius: 9, padding: 4, flexWrap: "wrap" }}>
            {ROLE_TABS.map(r => (
              <button
                key={r.key}
                onClick={() => setRoleKey(r.key)}
                style={{
                  padding: "7px 12px", borderRadius: 6, border: "none",
                  background: roleKey === r.key ? C.navy : "transparent",
                  color: roleKey === r.key ? "#fff" : C.textMid,
                  fontSize: 11, fontWeight: 700, cursor: "pointer",
                  fontFamily: "Inter,sans-serif", whiteSpace: "nowrap",
                }}
              >
                View as: {r.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 12, boxShadow: "0 1px 3px rgba(10,22,40,.06),0 4px 12px rgba(10,22,40,.04)", overflow: "hidden" }}>
          <div style={{ padding: 18 }}>
            {/* key=roleKey remounts AttendanceTab fresh on every role switch,
                same as clicking between the mock preview's role tabs before. */}
            <AttendanceTab
              key={roleKey}
              branchMeta={BRANCH_META}
              srList={SR_LIST}
              {...role.props}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<Shell />);
