import { useEffect, useRef, useState } from "react";
import { loadData, saveData } from "./storage/index.js";

// Full HTML string of the report system — loaded at runtime
const REPORT_HTML_URL = new URL('./report-system.html', import.meta.url).href;

export default function DailyReportPanel({ onClose }) {
  const iframeRef = useRef(null);

  // The report system runs as a standalone HTML file inside an iframe, in
  // isolation from the rest of this app — it has no access to the Supabase
  // client or credentials the React app uses. It USED to fall back to
  // browser localStorage for its own data, which meant every device had
  // its own separate, disconnected copy — exactly why the same report
  // could show real numbers on one device and 0 on another, despite the
  // code's own comment saying it was meant to be "shared so the whole
  // team sees the same reports." This bridges the iframe's storage calls
  // to the real, shared loadData/saveData the rest of the app already
  // uses, via postMessage — the iframe asks, the parent (which has the
  // real Supabase connection) does the actual read/write and relays the
  // result back. No credentials need to be duplicated into the standalone
  // file, and everything goes through the same single source of truth.
  useEffect(() => {
    const REPORT_PREFIX = "emax_report:";
    const handleMessage = async (e) => {
      const msg = e.data;
      if (!msg || msg.source !== "emax-report-storage") return;
      const respond = (result) => {
        iframeRef.current?.contentWindow?.postMessage(
          { source: "emax-report-storage-result", requestId: msg.requestId, result },
          "*"
        );
      };
      try {
        if (msg.action === "get") {
          const value = await loadData(REPORT_PREFIX + msg.key);
          respond(value !== null && value !== undefined ? { key: msg.key, value: typeof value === "string" ? value : JSON.stringify(value) } : null);
        } else if (msg.action === "set") {
          await saveData(REPORT_PREFIX + msg.key, msg.value);
          respond({ key: msg.key, value: msg.value });
        } else if (msg.action === "delete") {
          await saveData(REPORT_PREFIX + msg.key, null);
          respond({ key: msg.key, deleted: true });
        } else if (msg.action === "list") {
          const { supabase } = await import("./storage/index.js");
          const fullPrefix = REPORT_PREFIX + (msg.prefix || "");
          const { data, error } = await supabase.from("app_storage").select("key").like("key", `${fullPrefix}%`);
          if (error) { respond({ keys: [], prefix: msg.prefix }); return; }
          respond({ keys: (data || []).map(r => r.key.replace(REPORT_PREFIX, "")), prefix: msg.prefix });
        }
      } catch (err) {
        console.error("Daily Report storage bridge error:", err);
        respond(null);
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  // We render the report-system.html in an iframe so its vanilla JS runs in isolation
  return (
    <div style={{
      position:"fixed", inset:0, zIndex:9999,
      display:"flex", flexDirection:"column",
      background:"#fff", fontFamily:"Inter,sans-serif",
    }}>
      {/* Header bar */}
      <div style={{
        display:"flex", alignItems:"center", justifyContent:"space-between",
        padding:"10px 16px", background:"#0A1628", flexShrink:0,
      }}>
        <div>
          <div style={{fontWeight:800, fontSize:14, color:"#fff"}}>Daily Financial Report</div>
          <div style={{fontSize:10, color:"rgba(255,255,255,.4)", textTransform:"uppercase", letterSpacing:"0.1em"}}>Emax Group</div>
        </div>
        <button onClick={onClose} style={{
          padding:"7px 16px", background:"rgba(255,255,255,.1)", color:"#fff",
          border:"1px solid rgba(255,255,255,.2)", borderRadius:8,
          fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"Inter,sans-serif",
        }}>Close</button>
      </div>
      {/* Iframe */}
      <iframe
        ref={iframeRef}
        src={REPORT_HTML_URL}
        style={{ flex:1, border:"none", width:"100%" }}
        title="Daily Financial Report"
      />
    </div>
  );
}
