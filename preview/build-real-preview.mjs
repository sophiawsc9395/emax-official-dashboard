// Builds the standalone preview bundle for the REAL src/AttendanceTab.jsx.
// The only thing swapped out is the storage import (Supabase-backed in
// production) — everything else is the real, unmodified component code.
import * as esbuild from "esbuild";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const storageMockPath = path.join(__dirname, "storageMock.js");

const stubStorage = {
  name: "stub-storage",
  setup(build) {
    // AttendanceTab.jsx imports "./storage/index.js" — redirect that
    // specific import (and only that one) to the in-memory mock, so the
    // real component code is otherwise untouched.
    build.onResolve({ filter: /storage[\/\\]index\.js$/ }, () => ({
      path: storageMockPath,
    }));
  },
};

await esbuild.build({
  entryPoints: [path.join(__dirname, "attendance-real-preview.jsx")],
  bundle: true,
  format: "iife",
  jsx: "automatic",
  external: ["react", "react-dom/client", "react-dom", "react/jsx-runtime"],
  outfile: path.join(__dirname, "..", "dist", "attendance-real-bundle.js"),
  plugins: [stubStorage],
  logLevel: "info",
});

console.log("Built dist/attendance-real-bundle.js");
