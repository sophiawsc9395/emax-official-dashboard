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
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: size * 0.2, color: NAVY }}>
        {pct.toFixed(2)}%
      </div>
    </div>
  );
}

export function TargetReportBlock({ target, actual }) {
  if (!(target > 0)) return null;
  const pct = pctOf(actual, target), met = actual >= target, color = met ? GREEN : RED;
  return (
    <div style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "10px 12px", margin: "0 0 10px" }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>Target Report</div>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <Donut pct={pct} color={color} />
        <div style={{ flex: 1, fontSize: 11, minWidth: 0 }}>
          {[["Profit target", rm(target), "#4A5568"], ["Actual profit", rm(actual), NAVY], [met ? "Over target by" : "Balance to hit", rm(Math.abs(target - actual)), color]].map(([l, v, c]) => (
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
    </div>
  );
}

/** Convenience wrapper: the block with the padded strip it sits in at the top of a card. */
export function TargetReportStrip({ target, actual }) {
  if (!(target > 0)) return null;
  return (
    <div style={{ padding: "12px 14px 2px", background: SURFACE, borderBottom: `1px solid ${BORDER}` }}>
      <TargetReportBlock target={target} actual={actual} />
    </div>
  );
}

/* ── Overview: expanded table list for one branch ─────────────────────── */
export function BranchBreakdownRow({ rows, colSpan, title }) {
  const th = (e = {}) => ({ padding: "7px 14px", fontSize: 9.5, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: "0.06em", textAlign: "right", background: "#EEF2F8", whiteSpace: "nowrap", ...e });
  const td = (e = {}) => ({ padding: "8px 14px", fontSize: 12, whiteSpace: "nowrap", borderBottom: "1px solid rgba(228,234,242,.7)", ...e });
  return (
    <tr>
      <td colSpan={colSpan} style={{ padding: 0, background: "#F3F6FB", borderBottom: `1px solid ${BORDER}` }}>
        <div style={{ padding: "10px 16px 14px 28px" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Target Report · {title}</div>
          <div style={{ overflowX: "auto", background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 8 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
              <thead><tr>
                <th style={th({ textAlign: "left" })}>Name</th><th style={th({ textAlign: "left" })}>Role</th>
                <th style={th()}>Profit Target</th><th style={th()}>Actual Profit</th><th style={th()}>Balance</th>
                <th style={th()}>Achievement</th><th style={th({ textAlign: "center" })}>Status</th>
              </tr></thead>
              <tbody>
                {rows.length === 0 && <tr><td colSpan={7} style={td({ textAlign: "center", color: "#8A96A8" })}>No data</td></tr>}
                {rows.map((p, i) => {
                  const hasT = p.target > 0, ok = hasT && p.actual >= p.target, cc = ok ? OV_YES : OV_NO, pc = pctOf(p.actual, p.target);
                  return (
                    <tr key={p.key} style={{ background: p.bm ? "#FAFBFD" : i % 2 ? SURFACE : "#fff" }}>
                      <td style={td({ textAlign: "left", fontWeight: p.bm ? 800 : 600, color: NAVY })}>{p.name}</td>
                      <td style={td({ textAlign: "left", color: MUTED, fontSize: 11 })}>{p.role}</td>
                      <td style={td({ textAlign: "right", color: "#4A5568" })}>{hasT ? rm(p.target) : "—"}</td>
                      <td style={td({ textAlign: "right", color: NAVY, fontWeight: 600 })}>{rm(p.actual)}</td>
                      <td style={td({ textAlign: "right", color: cc, fontWeight: 600 })}>{hasT ? `${ok ? "+" : "-"}${rm(Math.abs(p.actual - p.target))}` : "—"}</td>
                      <td style={td({ minWidth: 150 })}>
                        {hasT ? <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
                          <div style={{ width: 70, height: 6, background: BORDER, borderRadius: 99, overflow: "hidden" }}><div style={{ width: `${Math.min(pc, 100)}%`, height: "100%", background: cc }} /></div>
                          <b style={{ color: cc, width: 52, textAlign: "right" }}>{pc.toFixed(1)}%</b>
                        </div> : <div style={{ textAlign: "right", color: "#8A96A8" }}>—</div>}
                      </td>
                      <td style={td({ textAlign: "center" })}>
                        {hasT
                          ? <span style={{ fontSize: 10.5, fontWeight: 700, color: cc, background: cc + "18", borderRadius: 99, padding: "2px 10px" }}>{ok ? "Achieved" : "Not achieved"}</span>
                          : <span style={{ fontSize: 10.5, color: "#8A96A8" }}>No target</span>}
                      </td>
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
  const sum = (id) => {
    let t = 0;
    for (let d = startDay; d <= endDay; d++) {
      const v = records?.[`${d}/${month}/${year}`]?.[id] || {};
      t += (v.walkin || 0) + (v.aeon || 0);
    }
    return t;
  };
  const srs = srList
    .filter((s) => s.branch === branchId && (!isVisible || isVisible(s)))
    .map((s) => ({ key: s.id, name: s.canon, role: `${s.type} SR`, target: targets?.sr?.[s.id]?.target || 0, actual: sum(s.id) }))
    .sort((a, b) => pctOf(b.actual, b.target) - pctOf(a.actual, a.target));
  const bm = { key: `BM_${branchId}`, name: branchMeta?.[branchId]?.manager || "Branch Manager", role: "Branch Manager", target: targets?.bm?.[branchId] || 0, actual: bmTotal || 0, bm: true };
  return [bm, ...srs];
}
