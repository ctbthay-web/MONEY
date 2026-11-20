// Exporta os lançamentos filtrados em Relatórios para planilha (CSV com ";" e BOM: abre direto no Excel pt-BR).
import { transactionDueDate } from './invoices'
import type { PdfRow } from './reportPdf'

// Evita "injeção de fórmula": texto que começa com = + - @ viraria fórmula ao abrir no Excel.
function cell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
  return `"${safe.replace(/"/g, '""')}"`
}

const brDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
const brMoney = (cents: number) => (cents / 100).toFixed(2).replace('.', ',')

export function downloadTransactionsCsv(rows: PdfRow[], fileBase: string) {
  const header = ['Data', 'Vencimento', 'Descrição', 'Categoria', 'Conta', 'Tipo', 'Valor (R$)', 'Situação']
  const lines = rows.map(({ transaction: t, settled }) =>
    [
      brDate(t.date),
      brDate(transactionDueDate(t, t.account)),
      t.description,
      t.category?.name ?? 'Sem categoria',
      t.account?.name ?? '',
      t.type === 'income' ? 'Receita' : 'Despesa',
      brMoney(t.type === 'income' ? t.amount_cents : -t.amount_cents),
      settled ? 'Quitada' : 'Em aberto',
    ].map((v) => cell(String(v))).join(';')
  )
  const csv = '﻿' + [header.map(cell).join(';'), ...lines].join('\r\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `${fileBase}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
