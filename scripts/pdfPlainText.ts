/**
 * Pull visible strings from a PDF buffer. Used by the offline report harness.
 */
export async function pdfPlainText(buffer: Buffer): Promise<string> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs') as {
    getDocument: (src: { data: Uint8Array; isEvalSupported: boolean; verbosity: number }) => {
      promise: Promise<{
        numPages: number
        getPage: (page: number) => Promise<{
          getTextContent: () => Promise<{ items: ReadonlyArray<{ str?: string }> }>
        }>
      }>
    }
  }
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(buffer),
    isEvalSupported: false,
    verbosity: 0,
  }).promise
  const parts: string[] = []
  for (let page = 1; page <= doc.numPages; page += 1) {
    const content = await (await doc.getPage(page)).getTextContent()
    for (const item of content.items) {
      if (item.str) parts.push(item.str)
    }
  }
  return parts.join(' ')
}
