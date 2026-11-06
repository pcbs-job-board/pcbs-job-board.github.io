// ESLint (flat config) – the app is plain browser scripts loaded in order by index.html (no modules, no build step),
// so the top-level names of every js/ file are shared globals. They are collected here from the files themselves:
// a typo or a name that exists nowhere is still reported (no-undef).
import fs from "node:fs";
import path from "node:path";
import * as espree from "espree";

const JS = path.join(path.dirname(new URL(import.meta.url).pathname), "js");
const shared = {};
const names = (node) => node.type === "Identifier" ? [node.name] : node.type === "ObjectPattern" ? node.properties.flatMap((p) => names(p.value || p.argument))
  : node.type === "ArrayPattern" ? node.elements.filter(Boolean).flatMap(names) : node.type === "AssignmentPattern" ? names(node.left) : node.type === "RestElement" ? names(node.argument) : [];
for (const f of fs.readdirSync(JS).filter((f) => f.endsWith(".js"))) {
  const ast = espree.parse(fs.readFileSync(path.join(JS, f), "utf8"), { ecmaVersion: 2023, sourceType: "script" });
  for (const n of ast.body) {
    if ((n.type === "FunctionDeclaration" || n.type === "ClassDeclaration") && n.id) shared[n.id.name] = "writable";
    if (n.type === "VariableDeclaration") for (const d of n.declarations) for (const k of names(d.id)) shared[k] = "writable";
  }
}
// browser features the app uses (plus Tesseract.js from the CDN and the generated parts database)
const browser = Object.fromEntries(`window document navigator location history localStorage sessionStorage console fetch performance
  setTimeout clearTimeout setInterval clearInterval requestAnimationFrame cancelAnimationFrame requestIdleCallback queueMicrotask
  alert confirm prompt open structuredClone getComputedStyle matchMedia innerWidth innerHeight scrollTo addEventListener removeEventListener
  Image FileReader File Blob URL URLSearchParams DataTransfer Event CustomEvent KeyboardEvent ClipboardEvent DragEvent MutationObserver
  ResizeObserver IntersectionObserver HTMLElement HTMLCanvasElement HTMLVideoElement OffscreenCanvas ImageData createImageBitmap
  TextEncoder TextDecoder AbortController Intl ImageCapture Tesseract`.split(/\s+/).filter(Boolean).map((n) => [n, "readonly"]));

export default [
  { ignores: ["data/parts-db.js", "node_modules/**"] },
  {
    files: ["js/**/*.js"],
    languageOptions: { ecmaVersion: 2023, sourceType: "script", globals: { ...browser, ...shared, module: "readonly" } },
    linterOptions: { reportUnusedDisableDirectives: "warn" },
    rules: {
      "no-undef": "error",
      "no-unused-vars": ["warn", { vars: "local", args: "none", caughtErrors: "none", ignoreRestSiblings: true }],
      "no-redeclare": "off",                 // the shared top-level names above are declared in their own files
      "no-dupe-keys": "error", "no-duplicate-case": "error", "no-unreachable": "error", "no-unsafe-finally": "error",
      "no-self-assign": "error", "no-self-compare": "error", "no-constant-binary-expression": "error", "no-dupe-else-if": "error",
      "no-cond-assign": ["error", "except-parens"], "no-empty": ["warn", { allowEmptyCatch: true }], "use-isnan": "error",
      "valid-typeof": "error", "no-shadow-restricted-names": "error", "eqeqeq": ["warn", "smart"], "no-var": "error",
      "prefer-const": ["warn", { destructuring: "all" }],
    },
  },
  {
    files: ["eslint.config.mjs"],
    languageOptions: { ecmaVersion: 2023, sourceType: "module" },
  },
];
