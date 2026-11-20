// Lê o texto de um PDF de fatura DENTRO do navegador (nada é enviado a servidor algum).
// Reconstrói as linhas pela posição de cada trecho (mesma altura = mesma linha) para que
// "data · descrição · valor" de uma compra continuem juntos e o parser de fatura consiga ler.
import type { PDFDocumentProxy } from 'pdfjs-dist'

interface PdfItem {
  str: string
  transform: number[]
  width?: number
}

/** Junta os trechos de texto de uma página em linhas (de cima para baixo, da esquerda para a direita). */
export function linesFromItems(items: PdfItem[]): string[] {
  const rows: { y: number; parts: { x: number; w: number; s: string }[] }[] = []
  for (const it of items) {
    if (!it.str || !it.str.trim()) continue
    const x = it.transform[4]
    const y = it.transform[5]
    let row = rows.find((r) => Math.abs(r.y - y) <= 2.5)
    if (!row) {
      row = { y, parts: [] }
      rows.push(row)
    }
    row.parts.push({ x, w: it.width ?? it.str.length * 4, s: it.str })
  }
  return rows
    .sort((a, b) => b.y - a.y)
    .map((r) => {
      const parts = r.parts.sort((a, b) => a.x - b.x)
      let line = ''
      let end = -Infinity
      for (const p of parts) {
        const gap = p.x - end
        if (line && gap > 0.5) line += gap > 8 ? '  ' : ' '
        else if (line && !line.endsWith(' ') && !p.s.startsWith(' ')) line += ' '
        line += p.s.trim()
        end = p.x + p.w
      }
      return line.trim()
    })
    .filter(Boolean)
}

export async function textFromDocument(doc: PDFDocumentProxy): Promise<string> {
  const out: string[] = []
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n)
    const content = await page.getTextContent()
    out.push(...linesFromItems(content.items as unknown as PdfItem[]))
  }
  return out.join('\n')
}

export class PdfReadError extends Error {
  kind: 'password' | 'empty' | 'invalid'
  constructor(message: string, kind: 'password' | 'empty' | 'invalid') {
    super(message)
    this.kind = kind
  }
}

/**
 * Extrai o texto do PDF. `askPassword` é chamado se o PDF tiver senha (faturas costumam usar o CPF);
 * devolva null para desistir.
 */
export async function extractPdfText(file: File, askPassword: (wrong: boolean) => string | null): Promise<string> {
  const [pdfjs, worker] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')])
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default

  const data = new Uint8Array(await file.arrayBuffer())
  const task = pdfjs.getDocument({ data })
  task.onPassword = (update: (pw: string) => void, reason: number) => {
    const pw = askPassword(reason === pdfjs.PasswordResponses.INCORRECT_PASSWORD)
    if (pw) update(pw)
    else void task.destroy()
  }

  let doc: PDFDocumentProxy
  try {
    doc = await task.promise
  } catch (err) {
    const name = (err as { name?: string })?.name
    if (name === 'PasswordException' || /password/i.test(String((err as Error)?.message))) {
      throw new PdfReadError('PDF protegido por senha.', 'password')
    }
    throw new PdfReadError('Não consegui abrir esse PDF.', 'invalid')
  }

  try {
    const text = await textFromDocument(doc)
    if (!text.trim()) {
      throw new PdfReadError('Esse PDF não tem texto (parece uma imagem escaneada).', 'empty')
    }
    return text
  } finally {
    void doc.destroy()
  }
}
