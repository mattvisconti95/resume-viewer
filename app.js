"use strict";
/* Document Viewer: all logic in one file, read top to bottom.
   1) Setup and helpers  2) Loading libraries  3) Opening a file
   4) PDF viewer  5) DOCX viewer  6) Buttons, drag-and-drop, theme */

/* ---------- 0) Settings you can change ---------- */
// The file that opens automatically when the site loads. Set DEFAULT_FILE to "" for an empty drop zone.
const DEFAULT_FILE = "resume.pdf";
const DEFAULT_NAME = "Matthew Visconti - Resume.pdf"; // the name shown in the top bar

/* ---------- 1) Setup and helpers ---------- */
const $ = (id) => document.getElementById(id);
const state = { token: 0, kind: null, pdf: null, base: null, scale: 1, fit: true, gen: 0, docScale: 1 };
let toastTimer;

function toast(msg) {
  const t = $("toast"); t.textContent = msg; t.classList.add("show");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("show"), 3500);
}

// Show exactly one "screen" at a time: drop | loading | error | pdf | docx
function show(screen) {
  const map = { drop: "dropZone", loading: "loading", error: "error", pdf: "pdfView", docx: "docView" };
  Object.values(map).forEach((id) => ($(id).hidden = true));
  $(map[screen]).hidden = false;
  const viewing = screen === "pdf" || screen === "docx";
  $("toolbar").hidden = !viewing;
  $("pdfTools").hidden = screen !== "pdf";
  $("docTools").hidden = screen !== "docx";
  $("fileInfo").hidden = screen === "drop";
}

function showError(err, title) {
  console.error(err);
  $("errorTitle").textContent = title || "This file couldn't be opened";
  $("errorText").textContent = err && err.message ? err.message : String(err);
  show("error");
}

function formatSize(n) { return n < 1048576 ? (n / 1024).toFixed(0) + " KB" : (n / 1048576).toFixed(1) + " MB"; }

/* ---------- 2) Loading libraries (only when first needed) ---------- */
// Each list is tried in order, so if one CDN is down the next one is used.
const PDFJS = "3.11.174";
const LIBS = {
  pdf: [`https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS}/pdf.min.js`, `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS}/build/pdf.min.js`],
  docx: ["https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js", "https://unpkg.com/mammoth@1.8.0/mammoth.browser.min.js"],
};
const loaded = {};

function loadScript(url) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = url; s.onload = () => resolve(url); s.onerror = () => { s.remove(); reject(new Error("blocked or offline")); };
    document.head.appendChild(s);
  });
}

async function loadLib(name) {
  if (loaded[name]) return loaded[name];
  for (const url of LIBS[name]) {
    try {
      await loadScript(url);
      if (name === "pdf") window.pdfjsLib.GlobalWorkerOptions.workerSrc = url.replace("pdf.min.js", "pdf.worker.min.js");
      return (loaded[name] = url);
    } catch (e) { /* try the next address */ }
  }
  throw new Error("Couldn't load the viewer library. Check your internet connection (it is loaded from a CDN) and try again.");
}

/* ---------- 3) Opening a file ---------- */
// Identify the file by its first bytes ("magic bytes"), not just its name.
function sniff(buf, name) {
  const b = new Uint8Array(buf, 0, Math.min(1024, buf.byteLength));
  const head = String.fromCharCode(...b);
  if (head.includes("%PDF-")) return "pdf";
  if (head.startsWith("PK")) {
    if (/\.docx$/i.test(name)) return "docx";
    throw new Error("Only Word .docx files are supported, not other ZIP-based formats like .xlsx or .pptx.");
  }
  if (b[0] === 0xd0 && b[1] === 0xcf) throw new Error("This looks like an old .doc file. Open it in Word and use Save As > .docx, then try again.");
  if (buf.byteLength === 0) throw new Error("This file is empty.");
  throw new Error("Unsupported file type. Please choose a .pdf or .docx file.");
}

async function openFile(file) {
  const token = ++state.token;
  closeDoc();
  $("downloadBtn").hidden = true;
  show("loading"); $("loadingText").textContent = "Opening " + file.name + "…";
  try {
    const buf = await file.arrayBuffer();
    const kind = sniff(buf, file.name);
    $("fileName").textContent = file.name; $("fileType").textContent = kind.toUpperCase(); $("fileSize").textContent = formatSize(file.size);
    document.title = file.name + " – Document Viewer";
    if (kind === "pdf") await openPdf(buf, token); else await openDocx(buf, token);
  } catch (err) {
    if (token === state.token) showError(err);
  }
}

function closeDoc() {
  if (state.pdf) { state.pdf.destroy(); state.pdf = null; }
  if (state.io) { state.io.disconnect(); state.io = null; }
  $("pages").replaceChildren(); $("sheet").replaceChildren();
  state.kind = null;
}

/* ---------- 4) PDF viewer ---------- */
async function openPdf(buf, token) {
  await loadLib("pdf");
  const lib = window.pdfjsLib;
  const task = lib.getDocument({
    data: new Uint8Array(buf),
    cMapUrl: `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS}/cmaps/`, cMapPacked: true,
  });
  task.onPassword = (submit, reason) => {
    const pw = prompt(reason === 2 ? "Wrong password. Try again:" : "This PDF is password-protected. Enter the password:");
    if (pw === null) task.destroy(); else submit(pw);
  };
  let pdf;
  try { pdf = await task.promise; }
  catch (e) {
    if (e && e.name === "PasswordException") throw new Error("This PDF needs a password to open.");
    if (e && e.name === "InvalidPDFException") throw new Error("This PDF looks damaged or isn't a valid PDF.");
    throw new Error(e && e.message ? e.message : "The PDF couldn't be read.");
  }
  if (token !== state.token) { pdf.destroy(); return; }

  state.pdf = pdf; state.kind = "pdf";
  const first = await pdf.getPage(1);
  state.base = first.getViewport({ scale: 1 });

  // One empty placeholder box per page. Canvases are drawn only for pages near the screen.
  const frag = document.createDocumentFragment();
  for (let i = 1; i <= pdf.numPages; i++) {
    const el = document.createElement("div");
    el.className = "pdf-page"; el.dataset.n = i; el.setAttribute("aria-label", "Page " + i);
    frag.appendChild(el);
  }
  $("pages").appendChild(frag);
  $("pageCount").textContent = "of " + pdf.numPages;
  $("pageInput").max = pdf.numPages; $("pageInput").value = 1;

  state.io = new IntersectionObserver((entries) => entries.forEach((e) => (e.isIntersecting ? renderPage(e.target) : unloadPage(e.target))),
    { root: $("pdfView"), rootMargin: "100% 0px" });
  show("pdf");
  $("pdfView").scrollTop = 0;
  setScale(fitScale(), true);
  $("pdfView").focus({ preventScroll: true });
}

const pageEls = () => $("pages").children;
const fitScale = () => Math.min(5, Math.max(0.25, ($("pdfView").clientWidth - 32) / state.base.width));

// Draw one page into a canvas (sharp on high-DPI screens, capped to stay within browser canvas limits).
async function renderPage(el) {
  if (el.dataset.done) return;
  el.dataset.done = "1";
  const gen = state.gen;
  try {
    const page = await state.pdf.getPage(+el.dataset.n);
    if (gen !== state.gen || !el.dataset.done) return;
    const vp = page.getViewport({ scale: state.scale });
    el.style.width = vp.width + "px"; el.style.height = vp.height + "px";
    const dpr = Math.min(window.devicePixelRatio || 1, Math.sqrt(16e6 / (vp.width * vp.height)));
    const c = document.createElement("canvas");
    c.width = Math.floor(vp.width * dpr); c.height = Math.floor(vp.height * dpr);
    el._task = page.render({ canvasContext: c.getContext("2d"), viewport: vp, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null });
    await el._task.promise;
    if (gen === state.gen && el.dataset.done) el.replaceChildren(c);
  } catch (e) {
    if (!e || e.name !== "RenderingCancelledException") { delete el.dataset.done; el.textContent = "Page " + el.dataset.n + " couldn't be drawn."; }
  }
}

// Free memory for pages that scrolled far away.
function unloadPage(el) {
  if (!el.dataset.done) return;
  if (el._task) el._task.cancel();
  delete el.dataset.done; el.replaceChildren();
}

function currentPage() {
  const y = $("pdfView").scrollTop + $("pdfView").clientHeight / 3;
  const els = pageEls(); let n = 1;
  for (let i = 0; i < els.length; i++) { if (els[i].offsetTop <= y) n = i + 1; else break; }
  return n;
}

// Change zoom while keeping the same spot on screen.
function setScale(scale, fit) {
  if (!state.pdf) return;
  const view = $("pdfView"), n = currentPage(), el = pageEls()[n - 1];
  const frac = el ? (view.scrollTop - el.offsetTop) / (el.offsetHeight || 1) : 0;
  state.scale = Math.min(5, Math.max(0.25, scale)); state.fit = !!fit; state.gen++;
  for (const p of pageEls()) {
    if (p._task) p._task.cancel();
    delete p.dataset.done; p.replaceChildren();
    p.style.width = state.base.width * state.scale + "px"; p.style.height = state.base.height * state.scale + "px";
  }
  const target = pageEls()[n - 1];
  if (target) view.scrollTop = target.offsetTop + frac * target.offsetHeight;
  state.io.disconnect(); for (const p of pageEls()) state.io.observe(p); // re-check which pages are visible
  $("zoomLabel").textContent = Math.round(state.scale * 100) + "%";
  $("fitBtn").setAttribute("aria-pressed", state.fit);
}

function goToPage(n) {
  const els = pageEls(); n = Math.min(els.length, Math.max(1, Math.round(n) || 1));
  $("pdfView").scrollTo({ top: els[n - 1].offsetTop - 8 });
  $("pageInput").value = n;
}

const STEPS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4, 5];
function zoomStep(dir) {
  const s = state.scale;
  const next = dir > 0 ? STEPS.find((v) => v > s + 0.01) : [...STEPS].reverse().find((v) => v < s - 0.01);
  setScale(next || s, false);
}

/* ---------- 5) DOCX viewer ---------- */
// Only these tags survive; everything else (scripts, styles, iframes...) is removed for safety.
const ALLOWED = new Set("P H1 H2 H3 H4 H5 H6 UL OL LI TABLE THEAD TBODY TR TD TH STRONG EM B I U S SUB SUP BR A IMG BLOCKQUOTE".split(" "));
function sanitize(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  (function walk(node) {
    for (const el of [...node.children]) {
      if (/^(SCRIPT|STYLE|IFRAME|OBJECT|EMBED)$/.test(el.tagName)) { el.remove(); continue; }
      walk(el);
      if (!ALLOWED.has(el.tagName)) { el.replaceWith(...el.childNodes); continue; }
      for (const a of [...el.attributes]) {
        const ok = ["colspan", "rowspan", "alt"].includes(a.name) ||
          (a.name === "href" && /^(https?:|mailto:|tel:|#)/i.test(a.value)) ||
          (a.name === "src" && /^data:image\//i.test(a.value));
        if (!ok) el.removeAttribute(a.name);
      }
      if (el.tagName === "A") { el.target = "_blank"; el.rel = "noopener noreferrer"; }
    }
  })(doc.body);
  return doc.body;
}

async function openDocx(buf, token) {
  await loadLib("docx");
  let result;
  try { result = await window.mammoth.convertToHtml({ arrayBuffer: buf }); }
  catch (e) { throw new Error("This Word file couldn't be read. It may be damaged, or not a real .docx file."); }
  if (token !== state.token) return;
  const body = sanitize(result.value);
  const sheet = $("sheet");
  sheet.replaceChildren(...body.childNodes);
  const text = sheet.textContent.trim();
  if (!text && !sheet.querySelector("img")) throw new Error("This document has no readable content.");
  state.kind = "docx";
  const words = text ? text.split(/\s+/).length : 0;
  $("wordCount").textContent = words.toLocaleString() + " words";
  setDocScale(1);
  show("docx");
  $("docView").scrollTop = 0; $("docView").focus({ preventScroll: true });
  if (result.messages.length) toast("Some Word formatting can't be shown here.");
}

function setDocScale(v) { state.docScale = Math.min(1.8, Math.max(0.8, v)); $("sheet").style.setProperty("--doc-scale", state.docScale); }

/* ---------- 6) Buttons, drag-and-drop, theme ---------- */
const pick = () => $("fileInput").click();
$("openBtn").onclick = $("chooseBtn").onclick = $("retryBtn").onclick = pick;
$("fileInput").onchange = (e) => { if (e.target.files[0]) openFile(e.target.files[0]); e.target.value = ""; };

$("prevBtn").onclick = () => goToPage(currentPage() - 1);
$("nextBtn").onclick = () => goToPage(currentPage() + 1);
$("pageInput").onchange = (e) => goToPage(+e.target.value);
$("zoomIn").onclick = () => zoomStep(1);
$("zoomOut").onclick = () => zoomStep(-1);
$("fitBtn").onclick = () => setScale(fitScale(), true);
$("textSmaller").onclick = () => setDocScale(state.docScale - 0.1);
$("textLarger").onclick = () => setDocScale(state.docScale + 0.1);

$("pdfView").addEventListener("scroll", () => {
  if (document.activeElement !== $("pageInput")) $("pageInput").value = currentPage();
}, { passive: true });

// Re-fit when the window (or full screen) changes size.
let lastW = 0;
new ResizeObserver(() => {
  const w = $("pdfView").clientWidth;
  if (state.kind === "pdf" && state.fit && w && w !== lastW) setScale(fitScale(), true);
  lastW = w;
}).observe($("pdfView"));

// Full screen (falls back to a fixed-position layout where the API is missing)
$("fsBtn").onclick = () => {
  const v = $("viewer");
  if (document.fullscreenEnabled) { document.fullscreenElement ? document.exitFullscreen() : v.requestFullscreen(); }
  else v.classList.toggle("pseudo-fs");
};
document.addEventListener("fullscreenchange", () => ($("fsBtn").textContent = document.fullscreenElement ? "Exit full screen" : "Full screen"));

// Keyboard shortcuts (ignored while typing in the page box)
document.addEventListener("keydown", (e) => {
  if (e.target.tagName === "INPUT" || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === "Escape") $("viewer").classList.remove("pseudo-fs");
  if (state.kind !== "pdf") return;
  if (e.key === "ArrowRight") goToPage(currentPage() + 1);
  else if (e.key === "ArrowLeft") goToPage(currentPage() - 1);
  else if (e.key === "+" || e.key === "=") zoomStep(1);
  else if (e.key === "-") zoomStep(-1);
  else if (e.key === "0") setScale(fitScale(), true);
});

// Drag-and-drop anywhere on the page
let dragDepth = 0;
const hasFiles = (e) => e.dataTransfer && [...e.dataTransfer.types].includes("Files");
window.addEventListener("dragenter", (e) => { if (!hasFiles(e)) return; e.preventDefault(); dragDepth++; $("overlay").hidden = false; document.body.classList.add("dragging"); });
window.addEventListener("dragover", (e) => { if (hasFiles(e)) e.preventDefault(); });
window.addEventListener("dragleave", () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) { $("overlay").hidden = true; document.body.classList.remove("dragging"); } });
window.addEventListener("drop", (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault(); dragDepth = 0; $("overlay").hidden = true; document.body.classList.remove("dragging");
  const files = e.dataTransfer.files;
  if (files.length > 1) toast("Opened the first of " + files.length + " files.");
  if (files[0]) openFile(files[0]);
});

// Theme: remembers your choice, otherwise follows your system setting.
function setTheme(t) {
  document.documentElement.dataset.theme = t;
  $("themeBtn").textContent = t === "dark" ? "Light theme" : "Dark theme";
  try { localStorage.setItem("dv-theme", t); } catch (e) { /* storage may be blocked; that's fine */ }
}
let saved = null; try { saved = localStorage.getItem("dv-theme"); } catch (e) {}
setTheme(saved || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
$("themeBtn").onclick = () => setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");

show("drop");

// Open the default file (your resume) automatically. This uses fetch(), which needs the site to be
// hosted or run from a local server; opening index.html by double-click can't do this in most browsers.
async function loadDefault() {
  if (!DEFAULT_FILE) return;
  show("loading"); $("loadingText").textContent = "Loading…";
  try {
    const res = await fetch(DEFAULT_FILE);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const blob = await res.blob();
    const token = state.token + 1;
    await openFile(new File([blob], DEFAULT_NAME, { type: blob.type }));
    if (state.token === token && state.kind) { $("downloadBtn").href = DEFAULT_FILE; $("downloadBtn").download = DEFAULT_NAME; $("downloadBtn").hidden = false; }
  } catch (e) {
    show("drop");
    toast("Couldn't load " + DEFAULT_FILE + " automatically. Host the site or run a local server, or use Open file.");
  }
}
loadDefault();
