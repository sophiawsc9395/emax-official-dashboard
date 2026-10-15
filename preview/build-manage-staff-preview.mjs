// Builds the standalone preview bundle for the REAL src/App.jsx SRBMModal.
// The only thing swapped out is the storage import (Supabase-backed in
// production) — everything else (SRBMModal, StaffUpdatePanel,
// AdjustBalanceWidget) is the real, unmodified component code.
import * as esbuild from "esbuild";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const storageMockPath = path.join(__dirname, "manageStaffStorageMock.js");
const dailyReportStubPath = path.join(__dirname, "daily-report-panel-stub.js");

const stubStorage = {
  name: "stub-storage",
  setup(build) {
    // App.jsx imports "./storage/index.js" directly; the ordersApi.js and
    // rtoApi.js modules it pulls in are THEMSELVES inside src/storage/, so
    // they import their sibling as the bare "./index.js" instead — both
    // forms need redirecting to the in-memory mock, or the real
    // storage/index.js still gets bundled via the second path and throws
    // at module-init time (createClient() with undefined env vars).
    build.onResolve({ filter: /(^|[\/\\])storage[\/\\]index\.js$/ }, () => ({
      path: storageMockPath,
    }));
    build.onResolve({ filter: /^\.\/index\.js$/ }, (args) => {
      if (/[\/\\]storage$/.test(args.resolveDir)) return { path: storageMockPath };
      return null;
    });
    // DailyReportPanel.jsx does `new URL(..., import.meta.url)` at module
    // scope — harmless in the real Vite/ESM build, but throws under this
    // bundle's iife output. It's unrelated to Manage Staff, so it's
    // stubbed out entirely (see daily-report-panel-stub.js).
    build.onResolve({ filter: /DailyReportPanel\.jsx$/ }, () => ({
      path: dailyReportStubPath,
    }));
  },
};

await esbuild.build({
  entryPoints: [path.join(__dirname, "manage-staff-real-preview.jsx")],
  bundle: true,
  format: "iife",
  jsx: "automatic",
  external: ["react", "react-dom/client", "react-dom", "react/jsx-runtime"],
  outfile: path.join(__dirname, "..", "dist", "manage-staff-bundle.js"),
  plugins: [stubStorage],
  logLevel: "info",
});

console.log("Built dist/manage-staff-bundle.js");
