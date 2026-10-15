/**
 * Target Report — shared pieces used by every dashboard that shows SR / BM
 * performance (Sophia's App.jsx, BossViewer.jsx and all the per-branch viewers).
 *
 *  - TargetReportBlock   : donut + Profit target / Actual profit / balance,
 *                          sits at the TOP of each SR / BM card. Green =
 *                          target achieved, red = not achieved.
 *  - BranchBreakdownRow  : the expanded table list under a branch on the
 *                          Overview page (Branch Manager + every SR). Navy =
 *                          achieved, grey = not achieved (no green/red here).
 *  - buildBranchBreakdown: collects that table's rows from the daily records.
 */

const GREEN = "#00C896", RED = "#F0354B";
const NAVY = "#0A1628", MUTED = "#5A6472", BORDER = "#E4EAF2", SURFACE = "#F7F9FC";
const OV_YES = "#162B52", OV_NO = "#8A96A8";

const rm = (n) => "RM " + Number(n || 0).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pctOf = (a, t) => (t > 0 ? (a / t) * 100 : 0);

function Donut({ pct, color, size = 92, stroke = 10 }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, shown = Math.max(0, Math.min(pct, 100));
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={BORDER} strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - shown / 100)} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: pct >= 100 ? size * 0.135 : size * 0.15, letterSpacing: "-0.03em", color: NAVY, whiteSpace: "nowrap" }}>
        {pct.toFixed(2)}%
      </div>
    </div>
  );
}

const fmtRM = (n) => "RM " + Number(n || 0).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const PT_TIERS = [[110, 500], [120, 1000], [130, 1500], [140, 2000], [150, 3000], [160, 4500], [170, 6000], [180, 7500], [190, 9000], [200, 12000]];
const clamp01 = (x) => Math.max(0, Math.min(100, x));

/** Bonus + Points tier state for one SR, from the existing bonus rules. */
export function computeSRTiers({ p, branchPct, calcBonus, calcPoints, role = "sr" }) {
  // Branch Achievement Bonus: branch >=120% AND personal >=100%, +1 tier per 10% of branch achievement
  const bOn = branchPct >= 120 && p >= 100;
  const bN = bOn ? Math.floor((branchPct - 120) / 10) + 1 : 0;
  const bMax = bOn && 120 + bN * 10 > 200;
  const bFrom = bOn ? 120 + (bN - 1) * 10 : 0, bAt = bOn ? 120 + bN * 10 : 120;
  const bonus = {
    n: bN, max: bMax, cur: fmtRM(bOn ? calcBonus(branchPct, role) : 0),
    next: bMax || !bOn && false ? "" : fmtRM(calcBonus(bAt, role)),
    prog: bMax ? 100 : bOn ? clamp01(((branchPct - bFrom) / (bAt - bFrom)) * 100) : clamp01((branchPct / 120) * 100),
    label: bMax ? "Highest tier reached" : bOn ? `Branch ${bFrom}% → ${bAt}%` : p >= 100 ? "Needs branch at 120%" : "Needs branch 120% + personal 100%",
  };
  // Reward points: branch >=100% AND personal >=110%, one tier per 10% personal
  const pOn = branchPct >= 100 && p >= 110;
  const idx = pOn ? PT_TIERS.reduce((a, [th], i) => (p >= th ? i : a), -1) : -1;
  const nxt = idx >= 0 ? PT_TIERS[idx + 1] : PT_TIERS[0];
  const pMax = pOn && !PT_TIERS[idx + 1];
  const pFrom = idx >= 0 ? PT_TIERS[idx][0] : 0;
  const points = {
    n: idx >= 0 ? idx + 1 : 0, max: pMax, cur: (pOn ? calcPoints(p, branchPct) : 0).toLocaleString() + " pts",
    next: pMax ? "" : nxt[1].toLocaleString() + " pts",
    prog: pMax ? 100 : idx >= 0 ? clamp01(((p - pFrom) / (nxt[0] - pFrom)) * 100) : clamp01((p / 110) * 100),
    label: pMax ? "Highest tier reached" : pOn ? `Personal ${pFrom}% → ${nxt[0]}%` : branchPct < 100 ? "Needs branch at 100%" : "Needs personal 110%",
  };
  return { bonus, points };
}

const TIER_BAR = "linear-gradient(90deg,#162B52,#2F5597)";
function TierCol({ title, t, white }) {
  const on = t.n > 0;
  return (
    <div style={{ background: white ? "#fff" : SURFACE, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "9px 12px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <div style={{ display: "flex", gap: 7, alignItems: "center" }}>
          <span style={{ fontSize: 9, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: ".08em" }}>{title}</span>
          <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 8px", borderRadius: 99, background: on ? "#162B52" : BORDER, color: on ? "#fff" : "#6B7686", whiteSpace: "nowrap" }}>{on ? `Tier ${t.n}` : "Not reached"}</span>
        </div>
        <span style={{ fontSize: 10, fontWeight: 700, color: on ? NAVY : "#8A96A8", whiteSpace: "nowrap" }}>{t.cur}</span>
      </div>
      <div style={{ height: 5, background: BORDER, borderRadius: 99, overflow: "hidden", margin: "6px 0 5px" }}>
        <div style={{ width: t.prog + "%", height: "100%", background: TIER_BAR, borderRadius: 99 }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", columnGap: 8, rowGap: 1, fontSize: 9, color: MUTED, whiteSpace: "nowrap" }}>
        <span>{t.label}</span>
        <span>{t.max ? "Max" : <>Next <b style={{ color: NAVY }}>{t.next}</b></>}</span>
      </div>
    </div>
  );
}

function TierPanel({ tiers, side }) {
  if (side) {
    // wide layout (hero card): Bonus and Points next to each other, stacking when narrow
    return (
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        <div style={{ flex: "1 1 320px", minWidth: 0, display: "flex", flexDirection: "column" }}><TierCol title="Bonus" t={tiers.bonus} /></div>
        <div style={{ flex: "1 1 320px", minWidth: 0, display: "flex", flexDirection: "column" }}><TierCol title="Points" t={tiers.points} /></div>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      <TierCol title="Bonus" t={tiers.bonus} />
      <TierCol title="Points" t={tiers.points} />
    </div>
  );
}

export function TargetReportBlock({ target, actual, tiers }) {
  // No target set: still shows the full report, with the target / balance at 0.
  target = target > 0 ? target : 0;
  const pct = pctOf(actual, target), met = target > 0 && actual >= target, color = met ? GREEN : RED;
  return (
    <div style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "10px 12px", margin: "0 0 10px" }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>Target Report</div>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <Donut pct={pct} color={color} />
        <div style={{ flex: 1, fontSize: 11, minWidth: 0 }}>
          {[["Profit target", rm(target), "#4A5568"], ["Actual profit", rm(actual), NAVY], [met ? "Over target by" : "Balance to hit", rm(target > 0 ? Math.abs(target - actual) : 0), color]].map(([l, v, c]) => (
            <div key={l} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "3px 0", borderBottom: `1px solid ${SURFACE}` }}>
              <span style={{ color: MUTED }}>{l}</span><span style={{ color: c, fontWeight: 700, whiteSpace: "nowrap" }}>{v}</span>
            </div>
          ))}
        </div>
      </div>
      <div style={{ marginTop: 8, fontSize: 10, color: MUTED, display: "flex", alignItems: "center", gap: 6 }}>
        <i style={{ width: 8, height: 8, borderRadius: 99, background: color, display: "inline-block", flexShrink: 0 }} />
        Profit achievement rate · <b style={{ color }}>{met ? "Target achieved" : "Not achieved yet"}</b>
      </div>
      {tiers && <div style={{ marginTop: 10 }}><TierPanel tiers={tiers} /></div>}
    </div>
  );
}

/** Convenience wrapper: the block with the padded strip it sits in at the top of a card. */
export function TargetReportStrip({ target, actual, tiers }) {
  return (
    <div style={{ padding: "12px 14px 2px", background: SURFACE, borderBottom: `1px solid ${BORDER}` }}>
      <TargetReportBlock target={target} actual={actual} tiers={tiers} />
    </div>
  );
}

/* ── Overview: expanded table list for one branch ─────────────────────── */
export function BranchBreakdownRow({ rows, colSpan, title }) {
  const th = (e = {}) => ({ padding: "7px 14px", fontSize: 9.5, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: "0.06em", textAlign: "right", background: "#EEF2F8", whiteSpace: "nowrap", ...e });
  const td = (e = {}) => ({ padding: "8px 14px", fontSize: 12, whiteSpace: "nowrap", borderBottom: "1px solid rgba(228,234,242,.7)", textAlign: "right", color: "#4A5568", ...e });
  const YES = "#00C896", NO = "#F0354B";
  return (
    <tr>
      <td colSpan={colSpan} style={{ padding: 0, background: "#F3F6FB", borderBottom: `1px solid ${BORDER}` }}>
        <div style={{ padding: "10px 16px 14px 28px" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Target Report · {title}</div>
          <div style={{ overflowX: "auto", background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 8 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
              <thead><tr>
                <th style={th({ textAlign: "left" })}>Name</th><th style={th()}>Achievement</th><th style={th()}>Total Profit</th>
                <th style={th()}>Walk In</th><th style={th()}>Invoice</th><th style={th()}>Balance</th><th style={th()}>Monthly Target</th>
              </tr></thead>
              <tbody>
                {rows.length === 0 && <tr><td colSpan={7} style={td({ textAlign: "center", color: "#8A96A8" })}>No data</td></tr>}
                {rows.map((p, i) => {
                  const hasT = p.target > 0, ok = hasT && p.actual >= p.target, cc = ok ? YES : NO, pc = pctOf(p.actual, p.target);
                  const bal = p.actual - p.target;
                  return (
                    <tr key={p.key} style={{ background: p.bm ? "#FAFBFD" : i % 2 ? SURFACE : "#fff" }}>
                      <td style={td({ textAlign: "left", fontSize: 11, fontWeight: p.bm ? 700 : 600, color: NAVY })}>
                        {p.name}
                        <div style={{ fontSize: 10, fontWeight: 400, color: MUTED, marginTop: 1 }}>{p.role}</div>
                      </td>
                      <td style={td()}>
                        {hasT ? <span style={{ background: cc + "12", color: cc, padding: "2px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700 }}>{pc.toFixed(2)}%</span> : <span style={{ color: "#8A96A8" }}>—</span>}
                      </td>
                      <td style={td()}>{p.actual > 0 ? rm(p.actual) : "—"}</td>
                      <td style={td()}>{p.wi ? rm(p.wi) : "—"}</td>
                      <td style={td()}>{p.ae > 0 ? rm(p.ae) : "—"}</td>
                      <td style={td()}>{hasT ? `${bal >= 0 ? "+" : ""}${rm(Math.abs(bal))}` : "—"}</td>
                      <td style={td()}>{hasT ? rm(p.target) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </td>
    </tr>
  );
}

/**
 * Rows for one branch: Branch Manager (branch target vs the branch's profit
 * for the period) first, then every visible SR ranked by achievement.
 */
export function buildBranchBreakdown({ branchId, branchMeta, srList, targets, records, month, year, startDay, endDay, bmTotal, isVisible }) {
  const parts = (id) => {
    let wi = 0, ae = 0;
    for (let d = startDay; d <= endDay; d++) {
      const v = records?.[`${d}/${month}/${year}`]?.[id] || {};
      wi += v.walkin || 0; ae += v.aeon || 0;
    }
    return { wi, ae };
  };
  const sum = (id) => { const x = parts(id); return x.wi + x.ae; };
  const srs = srList
    .filter((s) => s.branch === branchId && (!isVisible || isVisible(s)))
    .map((s) => ({ key: s.id, name: s.canon, role: `${s.type} SR`, target: targets?.sr?.[s.id]?.target || 0, actual: sum(s.id), ...parts(s.id) }))
    .sort((a, b) => pctOf(b.actual, b.target) - pctOf(a.actual, a.target));
  const bmParts = [`BM_${branchId}`, ...srList.filter((s) => s.branch === branchId && (!isVisible || isVisible(s))).map((s) => s.id)].map(parts);
  const bm = { key: `BM_${branchId}`, name: branchMeta?.[branchId]?.manager || "Branch Manager", role: "Branch Manager", target: targets?.bm?.[branchId] || 0, actual: bmTotal || 0, wi: bmParts.reduce((t, x) => t + x.wi, 0), ae: bmParts.reduce((t, x) => t + x.ae, 0), bm: true };
  return [bm, ...srs];
}

/* ── Person card header (shared by SR and BM cards) ─────────────────────
 * Name + "Role · Branch" on the left, status chip + Pass/Fail below,
 * History button on the right. */
export function PersonHeader({ name, sub, status, onHistory, noStatus, statusPrefix, eyebrow }) {
  const raw = status || "";
  const baseM = raw.match(/^(Training|Probation|Confirmed|Director|Resigned)/i);
  const base = baseM ? baseM[1].charAt(0).toUpperCase() + baseM[1].slice(1).toLowerCase() : "Probation";
  const nf = raw.match(/P(\d+)\s*F(\d+)/i);
  const pm = raw.match(/Passed\s+(\d+)/i), fm = raw.match(/Failed\s+(\d+)/i);
  const pass = nf ? +nf[1] : pm ? +pm[1] : 0, fail = nf ? +nf[2] : fm ? +fm[1] : 0;
  const showPF = base !== "Director" && base !== "Resigned";
  const chip = { Confirmed: ["#E6F7F0", "#0B7A54"], Probation: ["#FEF3C7", "#92600A"], Training: ["#E0ECFF", "#1D4ED8"], Director: ["#EDE9FE", "#5B21B6"], Resigned: ["#FDE8EA", "#B42335"] }[base];
  return (
    <div style={{ background: "linear-gradient(135deg,#0A1628,#162B52)", padding: "12px 14px", display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        {eyebrow && <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,.45)", textTransform: "uppercase", letterSpacing: "0.1em" }}>{eyebrow}</div>}
        <div style={{ fontSize: eyebrow ? 15 : 14, fontWeight: 800, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginTop: eyebrow ? 3 : 0 }}>{name}</div>
        {sub && <div style={{ fontSize: 10.5, color: "rgba(255,255,255,.55)", marginTop: 2 }}>{sub}</div>}
        <div style={{ display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap", marginTop: 7, visibility: noStatus ? "hidden" : "visible" }}>
          {statusPrefix && <span style={{ fontSize: 10.5, color: "rgba(255,255,255,.75)", fontWeight: 600, whiteSpace: "nowrap" }}>{statusPrefix}</span>}
          <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 9px", borderRadius: 99, background: chip[0], color: chip[1] }}>{base}</span>
          {showPF && <span style={{ fontSize: 10.5, color: "rgba(255,255,255,.75)", fontWeight: 600 }}>Pass {pass} · Fail {fail}</span>}
        </div>
      </div>
      {onHistory && <button onClick={onHistory} style={{ fontSize: 10, fontWeight: 600, padding: "3px 10px", borderRadius: 6, border: "1px solid rgba(255,255,255,.3)", background: "transparent", color: "rgba(255,255,255,.8)", cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>History</button>}
    </div>
  );
}

export function SRCardHeader({ sr, branchName, onStatusHistory }) {
  return <PersonHeader name={sr.canon} sub={`${sr.type} SR · ${branchName}`} status={sr.status} onHistory={onStatusHistory ? () => onStatusHistory(sr.id) : null} />;
}

export function BMCardHeader({ name, branchName, status, onHistory }) {
  return <PersonHeader name={name} sub={`Branch Manager · ${branchName}`} status={status} onHistory={onHistory} />;
}

/* ── Branch hero card (branch pages' Overview, top of page) ──────────────
 * Light card, navy top bar: big total profit, achievement bar, Walk in /
 * Invoice / Balance boxes, Bonus + Points tier cards, earned reward points. */
export function BranchHeroCard({ name, bmName, mStatus, onHistory, branchPct, bTarget, bTotal, pointsAsOf, pointsBalance, tiers }) {
  const raw = mStatus || "";
  const baseM = raw.match(/^(Training|Probation|Confirmed|Director|Resigned)/i);
  const base = baseM ? baseM[1].charAt(0).toUpperCase() + baseM[1].slice(1).toLowerCase() : "Probation";
  const nf = raw.match(/P(\d+)\s*F(\d+)/i);
  const chip = { Confirmed: ["#E6F7F0", "#0B7A54"], Probation: ["#FEF3C7", "#92600A"], Training: ["#E0ECFF", "#1D4ED8"], Director: ["#EDE9FE", "#5B21B6"], Resigned: ["#FDE8EA", "#B42335"] }[base];
  const hasT = bTarget > 0, met = hasT && bTotal.total >= bTarget, bal = Math.max(bTarget - bTotal.total, 0);
  const box = (l, v, c) => (
    <div key={l} style={{ flex: "1 1 130px", background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "8px 12px", minWidth: 0 }}>
      <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: ".08em", color: MUTED }}>{l}</div>
      <div style={{ fontSize: 13, fontWeight: 800, color: c, marginTop: 2, whiteSpace: "nowrap" }}>{v}</div>
    </div>
  );
  return (
    <div style={{ background: "#fff", border: `1px solid ${BORDER}`, borderTop: "4px solid #162B52", borderRadius: 14, padding: "16px 20px", marginBottom: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: NAVY }}>{name}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 5, fontSize: 11.5, color: MUTED, flexWrap: "wrap" }}>
            BM: {bmName}
            <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 9px", borderRadius: 99, background: chip[0], color: chip[1] }}>{base}</span>
            {nf && base !== "Director" && base !== "Resigned" && <span style={{ fontWeight: 600 }}>Pass {nf[1]} · Fail {nf[2]}</span>}
            {onHistory && <button onClick={onHistory} style={{ fontSize: 10, fontWeight: 600, padding: "2px 9px", borderRadius: 6, border: "1px solid #CBD5E3", background: "transparent", color: MUTED, cursor: "pointer", fontFamily: "inherit" }}>History</button>}
          </div>
        </div>
        <div style={{ textAlign: "right", marginLeft: "auto" }}>
          <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: ".08em", color: MUTED }}>Total profit</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: NAVY, letterSpacing: "-0.02em", whiteSpace: "nowrap" }}>{rm(bTotal.total)}</div>
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", fontSize: 11, color: MUTED, margin: "14px 0 5px" }}>
        <span>Achievement <b style={{ color: NAVY }}>{hasT ? branchPct.toFixed(1) + "%" : "—"}</b></span>
        <span>Target <b style={{ color: NAVY }}>{hasT ? rm(bTarget) : "Not Set"}</b></span>
      </div>
      <div style={{ height: 8, background: BORDER, borderRadius: 99, overflow: "hidden" }}>
        <div style={{ width: Math.min(hasT ? branchPct : 0, 100) + "%", height: "100%", background: met ? GREEN : RED, borderRadius: 99 }} />
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
        {box("Walk in", rm(bTotal.wi), NAVY)}
        {box("Invoice", rm(bTotal.ae), NAVY)}
        {box(met ? "Over target by" : "Balance to hit", hasT ? rm(met ? bTotal.total - bTarget : bal) : "—", hasT ? (met ? "#0B7A54" : RED) : MUTED)}
      </div>
      {tiers && <div style={{ marginTop: 12 }}><TierPanel tiers={tiers} side /></div>}
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 12, paddingTop: 10, borderTop: `1px solid ${BORDER}`, fontSize: 11, color: MUTED }}>
        <span>Earned Reward Points{pointsAsOf ? ` (as at ${pointsAsOf})` : ""}</span>
        <b style={{ color: NAVY }}>{Number(pointsBalance || 0).toLocaleString()} pts</b>
      </div>
    </div>
  );
}

/* "SR Performance" heading with the By Sales / By Attendance toggle at its
   right — same markup the Branch pages use, shared so the Monthly Report
   views match them. */
export function SRPerformanceHeading({subtitle,view,onView}){
  return<div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,flexWrap:"wrap",marginBottom:16}}>
    <div style={{display:"flex",alignItems:"center",gap:10}}>
      <div style={{width:30,height:30,borderRadius:9,background:"#0A16281A",color:"#0A1628",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
      </div>
      <div>
        <div style={{fontSize:15,fontWeight:800,color:"#0A1628"}}>SR Performance</div>
        <div style={{fontSize:11.5,color:"#8A96A8"}}>{subtitle}</div>
      </div>
    </div>
    <div style={{display:"inline-flex",border:"1px solid #E4EAF2",borderRadius:9,overflow:"hidden",background:"#fff"}}>
      {[["sales","By Sales"],["att","By Attendance"]].map(([k,l])=>(
        <button key={k} onClick={()=>onView(k)} style={{border:"none",cursor:"pointer",padding:"7px 14px",fontSize:12,fontWeight:700,fontFamily:"inherit",background:view===k?"#162B52":"#fff",color:view===k?"#fff":"#5A6472"}}>{l}</button>
      ))}
    </div>
  </div>;
}
