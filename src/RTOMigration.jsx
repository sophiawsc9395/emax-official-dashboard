import { useState } from "react";
import { loadData } from "./storage/index.js";
import { listCustomers, saveCustomer, updatePayment } from "./storage/rtoApi.js";

const LEGACY_KEY = "emax_v5_rto_customers";

export default function RTOMigration({ onClose }) {
  const [status, setStatus] = useState("idle"); // idle | running | done | error
  const [log, setLog] = useState([]);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const push = msg => setLog(p => [...p, msg]);

  const run = async () => {
    setStatus("running"); setLog([]); setProgress({ done: 0, total: 0 });
    try {
      const legacy = await loadData(LEGACY_KEY);
      if (!Array.isArray(legacy) || !legacy.length) {
        push("No legacy RTO customers found in app_storage — nothing to migrate.");
        setStatus("done");
        return;
      }
      const already = new Set((await listCustomers()).map(c => String(c.id)));
      const todo = legacy.filter(c => !already.has(String(c.id)));
      push(`Found ${legacy.length} legacy customers (${legacy.length - todo.length} already migrated, ${todo.length} to go).`);
      setProgress({ done: 0, total: todo.length });

      for (const customer of todo) {
        const payments = customer.payments || {};
        const paidEntries = Object.values(payments).filter(p => p?.paid);
        const paidCount = paidEntries.length;
        const totalReceived = paidEntries.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);

        const result = await saveCustomer({ ...customer, paidCount, totalReceived });
        if (!result.ok) {
          push(`✗ Customer ${customer.memberId || customer.id} (${customer.name || "?"}) — save failed: ${result.error?.message || result.error}`);
          continue;
        }
        for (const [schedKey, payData] of Object.entries(payments)) {
          await updatePayment(customer.id, schedKey, payData, { paidCount, totalReceived });
        }
        setProgress(p => ({ ...p, done: p.done + 1 }));
        push(`✓ Migrated ${customer.memberId || customer.id} — ${customer.name || "?"}`);
      }
      push("Done. Spot-check a few customers in the app, then you can delete the old app_storage row for \"emax_v5_rto_customers\" from Supabase.");
      setStatus("done");
    } catch (e) {
      push(`✗ Migration failed: ${e.message || e}`);
      setStatus("error");
    }
  };

  return <div style={{ position: "fixed", inset: 0, background: "rgba(10,22,40,.65)", backdropFilter: "blur(4px)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
    <div style={{ background: "#fff", borderRadius: 12, width: "90%", maxWidth: 640, maxHeight: "80vh", display: "flex", flexDirection: "column", overflow: "hidden", fontFamily: "Inter,sans-serif" }}>
      <div style={{ background: "linear-gradient(135deg,#0A1628,#162B52)", padding: "14px 18px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontWeight: 800, fontSize: 14, color: "#fff" }}>Migrate Legacy RTO Customers → New Schema</div>
        <button onClick={onClose} style={{ background: "rgba(255,255,255,.1)", border: "1px solid rgba(255,255,255,.2)", color: "rgba(255,255,255,.7)", borderRadius: 7, padding: "4px 10px", cursor: "pointer" }}>✕</button>
      </div>
      <div style={{ padding: 18, overflowY: "auto", flex: 1 }}>
        <div style={{ fontSize: 12, color: "#4A5568", marginBottom: 14, lineHeight: 1.5 }}>
          Moves customers out of the old single-blob <code>app_storage</code> row into the new <code>rto_customers</code> / <code>rto_payments</code> tables. Safe to run more than once — already-migrated customers are skipped. The old blob is <b>not</b> deleted automatically.
        </div>
        {status !== "idle" && <div style={{ marginBottom: 12 }}>
          <div style={{ height: 6, background: "#E4EAF2", borderRadius: 3, overflow: "hidden" }}>
            <div style={{ height: "100%", width: progress.total ? `${Math.round(progress.done / progress.total * 100)}%` : "0%", background: "#1B3F72", transition: "width .2s" }} />
          </div>
          <div style={{ fontSize: 11, color: "#8A96A8", marginTop: 4 }}>{progress.done}/{progress.total} customers</div>
        </div>}
        <div style={{ background: "#F7F9FC", border: "1px solid #E4EAF2", borderRadius: 8, padding: "10px 12px", fontSize: 11, fontFamily: "monospace", maxHeight: 260, overflowY: "auto", color: "#0A1628" }}>
          {log.length === 0 ? <span style={{ color: "#8A96A8" }}>Ready.</span> : log.map((l, i) => <div key={i} style={{ marginBottom: 2 }}>{l}</div>)}
        </div>
      </div>
      <div style={{ padding: "12px 16px", borderTop: "1px solid #E4EAF2", display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button onClick={onClose} style={{ padding: "8px 14px", background: "transparent", color: "#4A5568", border: "1px solid #E4EAF2", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Close</button>
        <button onClick={run} disabled={status === "running"} style={{ padding: "8px 16px", background: status === "running" ? "#E4EAF2" : "linear-gradient(135deg,#1B3F72,#2C5AA0)", color: status === "running" ? "#8A96A8" : "#fff", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: status === "running" ? "default" : "pointer" }}>{status === "running" ? "Migrating…" : "Run Migration"}</button>
      </div>
    </div>
  </div>;
}
