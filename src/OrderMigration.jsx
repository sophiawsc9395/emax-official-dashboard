import { useState } from "react";
import { loadData } from "./storage/index.js";
import { supabase } from "./storage/index.js";
import { reconcile, listOrders } from "./storage/ordersApi.js";

const LEGACY_KEY = "emax_v5_orders";
const BUCKET = "order-files";

// Any {name, data:"data:...base64"} anywhere in the object gets uploaded to
// Storage and replaced with {name, path}. Legacy files were all produced by
// the old readFile() helper, so they're always shaped this way.
function isLegacyFile(v) {
  return !!v && typeof v === "object" && typeof v.data === "string" && v.data.startsWith("data:") && typeof v.name === "string";
}

async function uploadLegacyFile(orderId, file) {
  const blob = await (await fetch(file.data)).blob();
  const ext = (/\.([a-zA-Z0-9]+)$/.exec(file.name || "") || [, "bin"])[1];
  const path = `${orderId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { upsert: false, contentType: blob.type || undefined });
  if (error) throw error;
  return { name: file.name, path };
}

async function migrateFilesDeep(orderId, obj) {
  if (Array.isArray(obj)) {
    const out = [];
    for (const item of obj) out.push(await migrateFilesDeep(orderId, item));
    return out;
  }
  if (obj && typeof obj === "object") {
    if (isLegacyFile(obj)) return await uploadLegacyFile(orderId, obj);
    const out = {};
    for (const k of Object.keys(obj)) out[k] = await migrateFilesDeep(orderId, obj[k]);
    return out;
  }
  return obj;
}

export default function OrderMigration({ onClose }) {
  const [status, setStatus] = useState("idle"); // idle | running | done | error
  const [log, setLog] = useState([]);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const push = msg => setLog(p => [...p, msg]);

  const run = async () => {
    setStatus("running"); setLog([]); setProgress({ done: 0, total: 0 });
    try {
      const legacy = await loadData(LEGACY_KEY);
      if (!Array.isArray(legacy) || !legacy.length) {
        push("No legacy orders found in app_storage — nothing to migrate.");
        setStatus("done");
        return;
      }
      const already = new Set((await listOrders()).map(o => String(o.id)));
      const todo = legacy.filter(o => !already.has(String(o.id)));
      push(`Found ${legacy.length} legacy orders (${legacy.length - todo.length} already migrated, ${todo.length} to go).`);
      setProgress({ done: 0, total: todo.length });

      const BATCH = 10;
      for (let i = 0; i < todo.length; i += BATCH) {
        const batch = todo.slice(i, i + BATCH);
        const transformed = [];
        for (const order of batch) {
          try {
            const migrated = await migrateFilesDeep(order.id, order);
            transformed.push(migrated);
          } catch (e) {
            push(`✗ Order ${order.id} (${order.customerName || "?"}) — file upload failed: ${e.message || e}`);
          }
        }
        const result = await reconcile([], transformed);
        if (!result.ok) {
          push(`✗ Batch insert failed: ${result.error?.message || result.error}`);
          setStatus("error");
          return;
        }
        setProgress(p => ({ ...p, done: Math.min(p.done + batch.length, todo.length) }));
        push(`✓ Migrated ${Math.min(i + BATCH, todo.length)}/${todo.length}`);
      }
      push("Done. Spot-check a few orders in the app, then you can delete the old app_storage row for \"emax_v5_orders\" from Supabase.");
      setStatus("done");
    } catch (e) {
      push(`✗ Migration failed: ${e.message || e}`);
      setStatus("error");
    }
  };

  return <div style={{ position: "fixed", inset: 0, background: "rgba(10,22,40,.65)", backdropFilter: "blur(4px)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
    <div style={{ background: "#fff", borderRadius: 12, width: "90%", maxWidth: 640, maxHeight: "80vh", display: "flex", flexDirection: "column", overflow: "hidden", fontFamily: "Inter,sans-serif" }}>
      <div style={{ background: "linear-gradient(135deg,#0A1628,#162B52)", padding: "14px 18px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontWeight: 800, fontSize: 14, color: "#fff" }}>Migrate Legacy Orders → New Schema</div>
        <button onClick={onClose} style={{ background: "rgba(255,255,255,.1)", border: "1px solid rgba(255,255,255,.2)", color: "rgba(255,255,255,.7)", borderRadius: 7, padding: "4px 10px", cursor: "pointer" }}>✕</button>
      </div>
      <div style={{ padding: 18, overflowY: "auto", flex: 1 }}>
        <div style={{ fontSize: 12, color: "#4A5568", marginBottom: 14, lineHeight: 1.5 }}>
          Moves orders out of the old single-blob <code>app_storage</code> row into the new <code>orders</code> / <code>order_history</code> tables, uploading every embedded file to Storage. Safe to run more than once — already-migrated orders are skipped. The old blob is <b>not</b> deleted automatically.
        </div>
        {status !== "idle" && <div style={{ marginBottom: 12 }}>
          <div style={{ height: 6, background: "#E4EAF2", borderRadius: 3, overflow: "hidden" }}>
            <div style={{ height: "100%", width: progress.total ? `${Math.round(progress.done / progress.total * 100)}%` : "0%", background: "#1B3F72", transition: "width .2s" }} />
          </div>
          <div style={{ fontSize: 11, color: "#8A96A8", marginTop: 4 }}>{progress.done}/{progress.total} orders</div>
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
