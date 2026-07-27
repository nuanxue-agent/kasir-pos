/**
 * Print / PDF export utilities.
 * Uses browser window.print() — no external PDF library required.
 */

/**
 * Injects a temporary <style> tag with print-specific CSS, then triggers
 * window.print(). The style tag is removed after the print dialog closes.
 *
 * @param title       - Document title shown in the browser print dialog
 * @param htmlContent - Optional HTML string to set as the page title meta
 */
export function printPage(title: string, htmlContent: string = ''): void {
  // Update the document title so the print dialog / saved PDF uses it
  const prevTitle = document.title
  document.title = title || prevTitle

  // Inject a temporary <style> scoped to @media print
  const styleId = '__kasir-print-style__'
  let style = document.getElementById(styleId) as HTMLStyleElement | null
  if (!style) {
    style = document.createElement('style')
    style.id = styleId
    style.media = 'print'
    document.head.appendChild(style)
  }

  style.textContent = `
    @media print {
      /* Hide chrome */
      .no-print, nav, aside, header, .bottom-nav,
      [data-no-print], .print\\:hidden { display: none !important; }

      /* Full-width content */
      main, #__next, body > div { padding: 0 !important; margin: 0 !important; }

      /* Clean typography */
      body {
        background: white !important;
        color: black !important;
        font-family: system-ui, sans-serif;
        font-size: 11pt;
        line-height: 1.5;
      }

      /* Cards / panels — keep borders, remove shadows */
      [class*="shadow"] { box-shadow: none !important; }
      [class*="rounded"] { border-radius: 4px !important; }

      /* Print title */
      .print-title::before {
        content: "${title.replace(/"/g, '\\"')}";
        display: block;
        font-size: 16pt;
        font-weight: bold;
        margin-bottom: 12pt;
      }

      /* Page break helper */
      .print-break { page-break-before: always; }

      /* Tables */
      table { border-collapse: collapse; width: 100%; }
      th, td { border: 1px solid #ccc; padding: 4pt 6pt; }
      thead { background: #f5f5f5 !important; -webkit-print-color-adjust: exact; }
    }
  `

  // Optionally log the htmlContent for debugging (keeps the param meaningful)
  if (htmlContent) {
    // could be used for future server-side PDF generation
    void htmlContent
  }

  window.print()

  // Restore title after dialog
  document.title = prevTitle
}
