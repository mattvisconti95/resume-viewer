# Resume site (Document Viewer)

A private, in-browser viewer for **PDF** and **Word (.docx)** files. Plain HTML, CSS and JavaScript: no build step, no backend, no accounts, no paid services. It costs $0 to run.

## Your resume opens automatically

The site loads `resume.pdf` when it starts, and shows a **Download** button. `resume.docx` is included as the editable original.

**To update your resume:** replace `resume.pdf` with the new PDF (keep the same file name), then re-upload it to your host. For the most accurate layout and fonts, export the PDF from Word (File > Save As > PDF). To change the file name or turn this off, edit `DEFAULT_FILE` and `DEFAULT_NAME` at the top of `app.js`.

**Note:** the auto-open needs the site hosted or run with the local server below. Double-clicking `index.html` still works, but you'll use **Open file** to pick the resume.

## What's in the folder

| File | What it does |
|---|---|
| `index.html` | The page structure: top bar, toolbar, drop zone, viewer areas. |
| `style.css` | All the looks: light/dark colors, layout, mobile rules. |
| `resume.pdf` / `resume.docx` | Your resume: the PDF is what visitors see; the DOCX is your editable copy. |
| `app.js` | All the behavior: opening files, PDF and DOCX viewing, buttons. Comments explain each section. |

## Run it on your computer

Easiest: **double-click `index.html`**. It opens in your browser.

If a PDF doesn't show up that way (some browsers restrict local files), run a tiny local server instead. In a terminal, inside this folder:

```
python3 -m http.server 8000
```

Then visit `http://localhost:8000`. (Windows may use `py -m http.server 8000`.) Press Ctrl+C to stop.

You need an internet connection the first time a file type is opened, because the PDF and DOCX libraries load from a CDN (a free public file host). Browsers usually cache them afterward.

## Put it online for free

Any static host works because there is no server code. Upload the three files (`index.html`, `style.css`, `app.js`):

- **GitHub Pages:** create a repository, upload the files, then Settings > Pages > deploy from the main branch.
- **Netlify:** drag the folder onto app.netlify.com/drop.
- **Cloudflare Pages:** create a project and upload the folder.

## How to use it

- Drop a file anywhere on the page, or use **Open file**.
- PDF: previous/next page, type a page number, zoom - / +, **Fit width**, **Full screen**. Shortcuts: Left/Right arrows change page, `+` and `-` zoom, `0` fits width.
- Word: **A-** / **A+** change text size. The word count shows in the toolbar.
- Use the theme button for dark or light. Your choice is remembered.

## How it works (plain English)

1. When you pick a file, the browser reads it into memory. **Nothing is uploaded.**
2. The app checks the file's first bytes to confirm it's really a PDF or .docx, not just named like one.
3. **PDF.js** (from Mozilla) draws each PDF page onto a canvas. Only pages near your screen are drawn, so big PDFs stay fast.
4. **Mammoth.js** converts a .docx into simple HTML. The app then removes anything unsafe (scripts, styles, odd links) and shows it on a white "sheet".

## Good to know

- Word files show content and basic structure (headings, lists, tables, images, links). Exact page layout, headers/footers and some fonts aren't reproduced. That's how Mammoth works.
- Old `.doc` files aren't supported. Open them in Word and Save As `.docx`.
- Password-protected PDFs ask for the password in a browser prompt.
- iPhone Safari lacks the standard Full screen feature, so the button uses a full-window mode there.

## Customizing

- **Colors:** edit the variables at the top of `style.css`. The yellow highlight is `--accent`.
- **Library versions:** change the addresses in the `LIBS` block near the top of `app.js`.
- **Work fully offline:** download `pdf.min.js`, `pdf.worker.min.js` and `mammoth.browser.min.js`, put them next to `app.js`, and change the `LIBS` addresses to those file names.
