/**
 * Standalone preview harness for the REAL src/App.jsx SRBMModal (plus its
 * internal StaffUpdatePanel / AdjustBalanceWidget sub-components) — imports
 * the actual production component unmodified, same approach as
 * preview/attendance-real-preview.jsx. Only the Supabase-backed storage
 * import is swapped for an in-memory mock (see
 * preview/manageStaffStorageMock.js + preview/build-manage-staff-preview.mjs)
 * so it runs standalone with no live database connection — SRBMModal's own
 * logic (localBM/localSR editing, ID rename/merge, role-change flow, monthly
 * Type overrides, etc.) is 100% real and unmodified.
 *
 * DEFAULT_SR is imported for real from src/App.jsx (it's an exported
 * constant) rather than retyped. DEFAULT_BRANCH_META is NOT exported by
 * App.jsx, so the branch data here is a verbatim copy (data, not logic) —
 * see preview/manageStaffStorageMock.js for the actual seed values used.
 *
 * `renameSRId` and `adjustBalance` are passed into SRBMModal as PROPS (they
 * live in App.jsx's main component, which is not exported/importable on its
 * own), so this harness provides its own implementations mirroring the real
 * ones' behavior for balance/history/status-history key migration — with
 * one deliberate simplification: the real renameSRId also migrates monthly
 * sales records across every month back to the SR's join date (Monthly
 * Report/Rankings data), which is out of scope for a Manage-Staff-only
 * preview and isn't reproduced here.
 */
import { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { SRBMModal, DEFAULT_SR } from "../src/App.jsx";
import { loadData, saveData, seedSRList } from "./manageStaffStorageMock.js";

const C = { navy: "#0A1628", navyLight: "#162B52", white: "#fff", surface: "#F7F9FC", border: "#E4EAF2", text: "#0A1628", textMid: "#4A5568", textLight: "#8A96A8" };

// Seed the SR list (from the REAL DEFAULT_SR, plus two demo-only tweaks —
// see manageStaffStorageMock.js) into the shared in-memory store BEFORE
// this harness's own loadData("emax_v5_sr_list") call runs.
seedSRList(DEFAULT_SR);

const SR_KEY = "emax_v5_sr_list";
const BM_KEY = "emax_v5_branch_meta";
const YEAR = 2026, MONTH = 10;

// Minimal harness-authored History viewer — SRBMModal's real "History"
// button just calls setShowStatusHistoryModal(true)/setStatusModalPerson(id)
// (props), expecting the caller to render its own history panel (the real
// one, StatusHistoryModal, lives in App.jsx's main component and isn't
// exported) — this stand-in shows the same underlying statusHistory /
// rewardHistory data so the button is still demonstrable end-to-end.
function HistoryPeek({ personId, statusHistory, rewardHistory, onClose }) {
  const sHist = statusHistory[personId] || [];
  const rHist = rewardHistory[personId] || [];
  return (
    <div className="modal-overlay" style={{ zIndex: 2000 }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: "#fff", borderRadius: 14, width: "100%", maxWidth: 480, maxHeight: "80vh", overflow: "auto", padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ fontSize: 14, fontWeight: 800, color: C.navy, margin: 0 }}>History — {personId}</h3>
          <button className="btn btn-ghost" onClick={onClose} style={{ fontSize: 11, padding: "5px 10px" }}>Close</button>
        </div>
        <div style={{ fontSize: 10, fontWeight: 700, color: C.textLight, textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 6 }}>Status history</div>
        {sHist.length === 0 ? <div style={{ fontSize: 12, color: C.textLight, marginBottom: 14 }}>No entries.</div> :
          <ul style={{ margin: "0 0 14px", paddingLeft: 18, fontSize: 12, color: C.text }}>
            {sHist.map((h, i) => <li key={i} style={{ marginBottom: 4 }}><b>{h.status}</b> — {h.note} <span style={{ color: C.textLight }}>({new Date(h.date).toLocaleDateString()})</span></li>)}
          </ul>}
        <div style={{ fontSize: 10, fontWeight: 700, color: C.textLight, textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 6 }}>Reward points history</div>
        {rHist.length === 0 ? <div style={{ fontSize: 12, color: C.textLight }}>No entries.</div> :
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: C.text }}>
            {rHist.map((h, i) => <li key={i} style={{ marginBottom: 4 }}>{h.amount > 0 ? "+" : ""}{h.amount} pts — {h.note} <span style={{ color: C.textLight }}>({new Date(h.date).toLocaleDateString()})</span></li>)}
          </ul>}
      </div>
    </div>
  );
}

function Shell() {
  const [loaded, setLoaded] = useState(false);
  const [isHR, setIsHR] = useState(false);
  const [open, setOpen] = useState(true);
  const [srList, setSrList] = useState([]);
  const [branchMeta, setBranchMeta] = useState({});
  const [rewardBalances, setRewardBalances] = useState({});
  const [rewardHistory, setRewardHistory] = useState({});
  const [statusHistory, setStatusHistory] = useState({});
  const [showStatusHistoryModal, setShowStatusHistoryModal] = useState(false);
  const [statusModalPerson, setStatusModalPerson] = useState(null);

  useEffect(() => {
    Promise.all([
      loadData(SR_KEY), loadData(BM_KEY),
      loadData("emax_v5_reward_balance"), loadData("emax_v5_reward_history"), loadData("emax_v5_status_history"),
    ]).then(([sr, bm, rb, rh, sh]) => {
      setSrList(sr || []); setBranchMeta(bm || {});
      setRewardBalances(rb || {}); setRewardHistory(rh || {}); setStatusHistory(sh || {});
      setLoaded(true);
    });
  }, []);

  // Mirrors the real adjustBalance() defined in App.jsx's main component
  // (not exported/importable standalone) — same balance + history-entry
  // update, same storage keys.
  const adjustBalance = async (personId, delta, note) => {
    const d = Number(delta) || 0;
    if (d === 0) return;
    const prevBalance = rewardBalances[personId]?.balance || 0;
    const updates = { ...rewardBalances, [personId]: { ...(rewardBalances[personId] || {}), balance: prevBalance + d } };
    setRewardBalances(updates);
    await saveData("emax_v5_reward_balance", updates);
    const hist = rewardHistory[personId] || [];
    const newHist = { ...rewardHistory, [personId]: [...hist, { date: new Date().toISOString(), type: "adjustment", amount: d, note: note || "Manual adjustment" }] };
    setRewardHistory(newHist);
    await saveData("emax_v5_reward_history", newHist);
  };

  // Mirrors the balance/history/status-history/srList-id parts of the real
  // renameSRId() in App.jsx's main component — see file header for the one
  // deliberate simplification (no monthly sales-record migration here).
  const renameSRId = async (oldId, newId, allowOverride = false) => {
    if (!newId || newId === oldId) return { ok: false, reason: "unchanged" };
    const conflict = srList.find(s => s.id === newId && s.id !== oldId);
    if (conflict && !allowOverride) return { ok: false, reason: "duplicate", conflictName: conflict.canon };
    const newSRList = srList.filter(s => !(conflict && s.id === newId)).map(s => s.id === oldId ? { ...s, id: newId } : s);
    setSrList(newSRList);
    await saveData(SR_KEY, newSRList);
    if (rewardBalances[oldId] !== undefined) {
      const rb = { ...rewardBalances }; rb[newId] = rb[oldId]; delete rb[oldId];
      setRewardBalances(rb); await saveData("emax_v5_reward_balance", rb);
    }
    if (rewardHistory[oldId] !== undefined) {
      const rh = { ...rewardHistory }; rh[newId] = rh[oldId]; delete rh[oldId];
      setRewardHistory(rh); await saveData("emax_v5_reward_history", rh);
    }
    if (statusHistory[oldId] !== undefined) {
      const sh = { ...statusHistory }; sh[newId] = sh[oldId]; delete sh[oldId];
      setStatusHistory(sh); await saveData("emax_v5_status_history", sh);
    }
    return { ok: true, newSRList };
  };

  return (
    <div style={{ fontFamily: "Inter,-apple-system,sans-serif", background: C.surface, minHeight: "100vh", padding: 20 }}>
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
          <div>
            <div style={{ fontSize: 19, fontWeight: 800, color: C.navy }}>Manage Staff — real implementation preview</div>
            <div style={{ fontSize: 11, color: C.textLight, marginTop: 2 }}>
              Live component code (src/App.jsx — SRBMModal) · storage mocked in-memory · nothing here reaches Supabase
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, background: "#fff", border: `1px solid ${C.border}`, borderRadius: 9, padding: 4 }}>
            <button onClick={() => setIsHR(false)} style={{ padding: "7px 12px", borderRadius: 6, border: "none", background: !isHR ? C.navy : "transparent", color: !isHR ? "#fff" : C.textMid, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "Inter,sans-serif" }}>View as: Sophia</button>
            <button onClick={() => setIsHR(true)} style={{ padding: "7px 12px", borderRadius: 6, border: "none", background: isHR ? C.navy : "transparent", color: isHR ? "#fff" : C.textMid, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "Inter,sans-serif" }}>View as: emaxhr</button>
          </div>
        </div>

        {!loaded ? <div style={{ padding: 40, textAlign: "center", color: C.textLight, fontSize: 13 }}>Loading…</div> :
          !open ? <div style={{ ...{}, background: "#fff", border: `1px solid ${C.border}`, borderRadius: 12, padding: 40, textAlign: "center" }}>
            <button className="btn btn-primary" onClick={() => setOpen(true)}>Reopen Manage Staff</button>
          </div> :
            <SRBMModal
              key={isHR ? "hr" : "sophia"}
              srList={srList} setSrList={setSrList}
              branchMeta={branchMeta} setBranchMeta={setBranchMeta}
              onClose={() => setOpen(false)}
              rewardBalances={rewardBalances} setRewardBalances={setRewardBalances}
              rewardHistory={rewardHistory} setRewardHistory={setRewardHistory}
              adjustBalance={adjustBalance}
              statusHistory={statusHistory} setStatusHistory={setStatusHistory}
              month={MONTH} year={YEAR}
              setShowStatusHistoryModal={setShowStatusHistoryModal}
              setStatusModalPerson={setStatusModalPerson}
              renameSRId={renameSRId}
              isHR={isHR}
            />}
        {showStatusHistoryModal && <HistoryPeek personId={statusModalPerson} statusHistory={statusHistory} rewardHistory={rewardHistory} onClose={() => { setShowStatusHistoryModal(false); setStatusModalPerson(null); }} />}
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<Shell />);
