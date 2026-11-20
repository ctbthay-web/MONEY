// Geração do PDF de lançamentos (Relatórios). jsPDF é carregado só quando o usuário gera o PDF.
import { transactionDueDate } from './invoices'
import { formatCentsToBRL, formatDate } from './format'
import type { TransactionWithRelations } from '../types/database'

export interface PdfRow {
  transaction: TransactionWithRelations
  settled: boolean
}

export interface PdfOptions {
  rows: PdfRow[]
  situation: 'settled' | 'open' | 'both'
  periodLabel: string
  filtersText: string
  userName?: string
}

const signed = (t: TransactionWithRelations) => (t.type === 'income' ? t.amount_cents : -t.amount_cents)

export async function generateTransactionsPdf(opts: PdfOptions) {
  const { jsPDF } = await import('jspdf')
  const autoTable = (await import('jspdf-autotable')).default

  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const margin = 40
  const brand: [number, number, number] = [15, 118, 110]

  // ---- cabeçalho ----
  doc.setFillColor(...brand)
  doc.rect(0, 0, pageW, 70, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  doc.text('Money', margin, 36)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'normal')
  doc.text('Relatório de lançamentos', margin, 54)
  doc.setFontSize(9)
  doc.text(`Gerado em ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`, pageW - margin, 36, { align: 'right' })
  if (opts.userName) doc.text(opts.userName, pageW - margin, 54, { align: 'right' })

  // ---- filtros usados ----
  doc.setTextColor(40, 40, 40)
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  const situationLabel = { settled: 'Quitadas', open: 'Em aberto', both: 'Em aberto e quitadas' }[opts.situation]
  doc.text(`Período: ${opts.periodLabel}   |   Situação: ${situationLabel}`, margin, 92)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(90, 90, 90)
  const filterLines = doc.splitTextToSize(`Filtros: ${opts.filtersText}`, pageW - margin * 2)
  doc.text(filterLines, margin, 107)

  let y = 107 + filterLines.length * 12 + 8

  // ---- resumo ----
  const all = opts.rows.map((r) => r.transaction)
  const income = all.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount_cents, 0)
  const expense = all.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount_cents, 0)
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [['Receitas', 'Despesas', 'Saldo do período', 'Lançamentos']],
    body: [[formatCentsToBRL(income), formatCentsToBRL(expense), formatCentsToBRL(income - expense), String(all.length)]],
    theme: 'grid',
    styles: { fontSize: 10, halign: 'center', cellPadding: 6 },
    headStyles: { fillColor: [235, 245, 243], textColor: [40, 40, 40], fontStyle: 'bold' },
    bodyStyles: { fontStyle: 'bold' },
  })
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 18

  // ---- tabelas (uma por situação) ----
  const groups: { title: string; rows: PdfRow[] }[] = []
  if (opts.situation !== 'settled') groups.push({ title: 'Em aberto', rows: opts.rows.filter((r) => !r.settled) })
  if (opts.situation !== 'open') groups.push({ title: 'Quitadas', rows: opts.rows.filter((r) => r.settled) })

  for (const g of groups) {
    const net = g.rows.reduce((s, r) => s + signed(r.transaction), 0)
    if (y > doc.internal.pageSize.getHeight() - 120) {
      doc.addPage()
      y = margin
    }
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.setTextColor(...brand)
    doc.text(`${g.title} (${g.rows.length})`, margin, y)
    doc.setTextColor(60, 60, 60)
    doc.setFontSize(10)
    doc.text(`Saldo: ${formatCentsToBRL(net)}`, pageW - margin, y, { align: 'right' })

    autoTable(doc, {
      startY: y + 8,
      margin: { left: margin, right: margin },
      head: [['Vencimento', 'Data', 'Descrição', 'Categoria', 'Conta', 'Valor']],
      body:
        g.rows.length === 0
          ? [[{ content: 'Nenhum lançamento com esses filtros.', colSpan: 6, styles: { halign: 'center', textColor: [120, 120, 120] } }]]
          : g.rows.map(({ transaction: t }) => [
              formatDate(transactionDueDate(t, t.account)),
              formatDate(t.date),
              t.description,
              t.category?.name ?? 'Sem categoria',
              t.account?.name ?? '—',
              `${t.type === 'income' ? '+' : '-'} ${formatCentsToBRL(t.amount_cents)}`,
            ]),
      theme: 'striped',
      styles: { fontSize: 8.5, cellPadding: 4, overflow: 'linebreak' },
      headStyles: { fillColor: brand, textColor: 255 },
      columnStyles: { 0: { cellWidth: 58 }, 1: { cellWidth: 52 }, 5: { halign: 'right', cellWidth: 70, fontStyle: 'bold' } },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 5 && g.rows[data.row.index]) {
          const income = g.rows[data.row.index].transaction.type === 'income'
          data.cell.styles.textColor = income ? [15, 118, 110] : [190, 38, 52]
        }
      },
    })
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 22
  }

  // ---- rodapé com paginação ----
  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    doc.setFontSize(8)
    doc.setTextColor(140, 140, 140)
    doc.text(`Money · página ${i} de ${pages}`, pageW / 2, doc.internal.pageSize.getHeight() - 20, { align: 'center' })
  }

  const slug = opts.periodLabel.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  doc.save(`money-lancamentos-${slug || 'relatorio'}.pdf`)
}
