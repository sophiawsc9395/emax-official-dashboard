// Stand-in for src/DailyReportPanel.jsx in the Manage Staff preview bundle
// ONLY — that real file does `new URL('./report-system.html', import.meta.url)`
// at module scope, which is fine in the app's real ESM/Vite build but
// throws immediately under esbuild's iife output (import.meta is empty
// there), crashing the whole bundle before SRBMModal ever renders.
// DailyReportPanel itself is unrelated to Manage Staff (it's the separate
// "Daily Report" iframe tool), so it's stubbed out entirely rather than
// worked around, the same way the storage module is mocked.
export default function DailyReportPanelStub() { return null; }
