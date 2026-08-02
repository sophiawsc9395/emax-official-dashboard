import { useEffect, useRef, useState } from "react";

// Full HTML string of the report system — loaded at runtime
const REPORT_HTML_URL = new URL('./report-system.html', import.meta.url).href;

export default function DailyReportPanel({ onClose }) {
  const iframeRef = useRef(null);

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
