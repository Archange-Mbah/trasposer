// Copies the pdf.js worker into /public so the browser can load it at a stable URL
// (legacy build: polyfilled for older browsers) and it always matches the installed pdfjs-dist version.
import { copyFileSync, mkdirSync } from "node:fs";
mkdirSync("public", { recursive: true });
copyFileSync("node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs", "public/pdf.worker.min.mjs");
