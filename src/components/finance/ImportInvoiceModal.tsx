import { useMemo, useRef, useState } from 'react'
import { ClipboardPaste, FileUp, ListChecks, Plus, Receipt, Trash2 } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Select } from '../ui/Select'
import { CurrencyInput } from '../ui/CurrencyInput'
import { useToast } from '../ui/Toast'
import { useAccounts } from '../../lib/queries/useAccounts'
import { useCategories } from '../../lib/queries/useCategories'
import { useTransactionMutations, type TransactionInput } from '../../lib/queries/useTransactions'
import { invoiceSectionLines, mergeMultilineItems, parseInvoiceText } from '../../lib/invoiceImport'
import { extractPdfText, PdfReadError } from '../../lib/pdfText'
import { centsToInputValue, formatCentsToBRL, parseBRLToCents, todayISO } from '../../lib/format'
import { cn } from '../../lib/cn'

type Mode = 'items' | 'single'

interface Row {
  key: number
  include: boolean
  date: string
  description: string
  amountCents: number
  categoryId: string
  credit: boolean
}

let rowKey = 0

export function ImportInvoiceModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: accounts = [] } = useAccounts()
  const { data: categories = [] } = useCategories('expense')
  const { createMany } = useTransactionMutations()
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement>(null)

  const cards = useMemo(() => accounts.filter((a) => a.type === 'credit_card'), [accounts])
  const [accountId, setAccountId] = useState('')
  const [mode, setMode] = useState<Mode>('items')
  const [text, setText] = useState('')
  const [rows, setRows] = useState<Row[]>([])
  const [readingPdf, setReadingPdf] = useState(false)
  const [bulkCategory, setBulkCategory] = useState('')
  // "Um lançamento só"
  const [singleDesc, setSingleDesc] = useState('')
  const [singleCents, setSingleCents] = useState(0)
  const [singleDate, setSingleDate] = useState(todayISO())
  const [singleCategory, setSingleCategory] = useState('')

  const card = cards.find((c) => c.id === (accountId || cards[0]?.id))
  const selected = rows.filter((r) => r.include && r.amountCents > 0)
  const selectedTotal = selected.reduce((s, r) => s + r.amountCents, 0)

  function reset() {
    setText('')
    setRows([])
    setSingleDesc('')
    setSingleCents(0)
    setSingleDate(todayISO())
    setSingleCategory('')
    setBulkCategory('')
  }

  function close() {
    reset()
    onClose()
  }

  function readText(raw: string, fromPdf = false) {
    // PDF: só o trecho de transações da fatura, só linhas com data e sem os pagamentos da fatura anterior
    const parsed = fromPdf
      ? parseInvoiceText(mergeMultilineItems(invoiceSectionLines(raw)), todayISO(), new Date(), { requireDate: true, skipPayments: true })
      : parseInvoiceText(raw, todayISO())
    if (parsed.length === 0) {
      toast.error('Não encontrei itens com valor nesse texto. Confira o conteúdo ou adicione os itens manualmente.')
      return
    }
    setRows((prev) => [
      ...prev,
      ...parsed.map((p) => ({
        key: ++rowKey,
        // PDF: o que tem data futura costuma ser prévia de parcelas das próximas faturas; vem desmarcado
        include: !p.credit && !(fromPdf && p.date > todayISO()),
        date: p.date,
        description: p.description,
        amountCents: p.amountCents,
        categoryId: '',
        credit: p.credit,
      })),
    ])
    setText('')
  }

  async function onFile(file: File | undefined) {
    if (!file) return
    if (/\.pdf$/i.test(file.name) || file.type === 'application/pdf') {
      setReadingPdf(true)
      try {
        const pdfText = await extractPdfText(file, (wrong) =>
          window.prompt(
            wrong
              ? 'Senha incorreta. Digite de novo a senha do PDF:'
              : 'Esse PDF tem senha. Digite a senha (em muitas faturas são os primeiros dígitos do CPF):'
          )
        )
        readText(pdfText, true)
      } catch (err) {
        if (err instanceof PdfReadError && err.kind === 'password') {
          toast.error('Não foi possível abrir o PDF sem a senha. Tente de novo ou cole o texto da fatura.')
        } else if (err instanceof PdfReadError && err.kind === 'empty') {
          toast.error('Esse PDF é uma imagem (sem texto). Use o CSV do banco, cole o texto ou adicione os itens manualmente.')
        } else {
          toast.error('Não consegui ler esse PDF. Tente o CSV do banco ou cole o texto da fatura.')
        }
      } finally {
        setReadingPdf(false)
      }
      return
    }
    readText(await file.text())
  }

  function patch(key: number, p: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...p } : r)))
  }

  function addBlank() {
    setRows((prev) => [
      ...prev,
      { key: ++rowKey, include: true, date: todayISO(), description: '', amountCents: 0, categoryId: '', credit: false },
    ])
  }

  function applyBulkCategory(id: string) {
    setBulkCategory(id)
    if (id) setRows((prev) => prev.map((r) => ({ ...r, categoryId: id })))
  }

  async function submit() {
    if (!card) return
    let inputs: TransactionInput[]
    if (mode === 'single') {
      if (!singleDesc.trim() || singleCents <= 0) {
        toast.error('Informe a descrição e o valor da fatura.')
        return
      }
      inputs = [
        {
          account_id: card.id,
          category_id: singleCategory || null,
          type: 'expense',
          amount_cents: singleCents,
          description: singleDesc.trim(),
          note: 'Importado da fatura',
          date: singleDate,
          due_date: null,
        },
      ]
    } else {
      if (selected.length === 0) {
        toast.error('Marque ao menos um item com valor.')
        return
      }
      if (selected.some((r) => !r.description.trim() || !r.date)) {
        toast.error('Todo item marcado precisa de descrição e data.')
        return
      }
      inputs = selected.map((r) => ({
        account_id: card.id,
        category_id: r.categoryId || null,
        type: 'expense' as const,
        amount_cents: r.amountCents,
        description: r.description.trim(),
        note: 'Importado da fatura',
        date: r.date,
        due_date: null,
      }))
    }
    try {
      const n = await createMany.mutateAsync(inputs)
      toast.success(n === 1 ? '1 lançamento criado no cartão.' : `${n} lançamentos criados no cartão.`)
      close()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao importar a fatura.')
    }
  }

  const modeBtn = (m: Mode, Icon: typeof Receipt, title: string, hint: string) => (
    <button
      type="button"
      onClick={() => setMode(m)}
      aria-pressed={mode === m}
      className={cn(
        'flex flex-col items-start gap-1 rounded-2xl border p-3 text-left transition-colors',
        mode === m ? 'border-brand-400/60 bg-brand-500/15' : 'border-border hover:bg-white/5'
      )}
    >
      <Icon className="h-5 w-5 text-brand-300" strokeWidth={2} />
      <span className="text-sm font-semibold text-ink-primary">{title}</span>
      <span className="text-xs text-ink-secondary">{hint}</span>
    </button>
  )

  return (
    <Modal open={open} onClose={close} title="Importar fatura do cartão" className="sm:max-w-2xl">
      {cards.length === 0 ? (
        <p className="text-sm text-ink-secondary">
          Cadastre um cartão de crédito em "Contas e cartões" para importar a fatura.
        </p>
      ) : (
        <div className="flex flex-col gap-5">
          <Select label="Cartão" value={card?.id ?? ''} onChange={(e) => setAccountId(e.target.value)}>
            {cards.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>

          <div className="grid grid-cols-2 gap-3">
            {modeBtn('items', ListChecks, 'Cada item da fatura', 'Revise e configure cada compra')}
            {modeBtn('single', Receipt, 'Um lançamento só', 'Registra o total como uma despesa')}
          </div>

          {mode === 'single' ? (
            <div className="flex flex-col gap-4">
              <Input
                label="Descrição"
                placeholder={`Fatura ${card?.name ?? ''}`}
                value={singleDesc}
                onChange={(e) => setSingleDesc(e.target.value)}
              />
              <CurrencyInput label="Valor total" valueCents={singleCents} onValueChange={setSingleCents} />
              <div className="grid grid-cols-2 gap-3">
                <Input label="Data" type="date" value={singleDate} onChange={(e) => setSingleDate(e.target.value)} />
                <Select label="Categoria" value={singleCategory} onChange={(e) => setSingleCategory(e.target.value)}>
                  <option value="">Sem categoria</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label className="flex items-center gap-2 text-sm font-medium text-ink-secondary" htmlFor="invoice-text">
                  <ClipboardPaste className="h-4 w-4" /> Cole o texto da fatura ou do extrato
                </label>
                <textarea
                  id="invoice-text"
                  rows={4}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={'15/10 Mercado Livre 3/12 189,90\n18/10 Uber 23,40'}
                  className="w-full rounded-2xl border border-border bg-surface p-3 text-sm text-ink-primary placeholder:text-ink-muted focus:border-brand-400/60 focus:outline-none focus:ring-2 focus:ring-brand-400/20"
                />
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" disabled={!text.trim()} onClick={() => readText(text)}>
                    Ler itens
                  </Button>
                  <Button type="button" size="sm" variant="secondary" loading={readingPdf} onClick={() => fileRef.current?.click()}>
                    <FileUp className="h-4 w-4" /> Enviar PDF/CSV/TXT
                  </Button>
                  <Button type="button" size="sm" variant="secondary" onClick={addBlank}>
                    <Plus className="h-4 w-4" /> Item manual
                  </Button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".pdf,.csv,.txt,.ofx,application/pdf,text/csv,text/plain"
                    className="hidden"
                    onChange={(e) => {
                      void onFile(e.target.files?.[0])
                      e.target.value = ''
                    }}
                  />
                </div>
              </div>

              {rows.length > 0 && (
                <div className="flex flex-col gap-3">
                  <Select
                    label="Categoria para todos os itens"
                    value={bulkCategory}
                    onChange={(e) => applyBulkCategory(e.target.value)}
                  >
                    <option value="">Escolher uma categoria…</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>

                  <ul className="flex flex-col gap-2">
                    {rows.map((r) => (
                      <li key={r.key} className={cn('glass rounded-2xl p-3', !r.include && 'opacity-60')}>
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={r.include}
                            onChange={(e) => patch(r.key, { include: e.target.checked })}
                            aria-label="Incluir item"
                            className="h-4 w-4 accent-[rgb(var(--a-500))]"
                          />
                          <input
                            value={r.description}
                            onChange={(e) => patch(r.key, { description: e.target.value })}
                            placeholder="Descrição"
                            className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-ink-primary placeholder:text-ink-muted focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => setRows((prev) => prev.filter((x) => x.key !== r.key))}
                            className="text-ink-muted hover:text-danger"
                            aria-label="Remover item"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                        {r.credit && (
                          <p className="mt-1 text-xs text-warning">
                            Valor negativo (estorno/crédito): não será lançado, a menos que você marque.
                          </p>
                        )}
                        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                          <input
                            type="date"
                            value={r.date}
                            onChange={(e) => patch(r.key, { date: e.target.value })}
                            className="h-10 rounded-xl border border-border bg-surface px-3 text-sm text-ink-primary"
                          />
                          <input
                            inputMode="decimal"
                            value={r.amountCents ? centsToInputValue(r.amountCents) : ''}
                            onChange={(e) => patch(r.key, { amountCents: parseBRLToCents(e.target.value) })}
                            placeholder="0,00"
                            className="h-10 rounded-xl border border-border bg-surface px-3 text-right text-sm font-semibold text-ink-primary"
                          />
                          <select
                            value={r.categoryId}
                            onChange={(e) => patch(r.key, { categoryId: e.target.value })}
                            className="col-span-2 h-10 rounded-xl border border-border bg-surface px-3 text-sm text-ink-primary sm:col-span-1"
                          >
                            <option value="">Sem categoria</option>
                            {categories.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </li>
                    ))}
                  </ul>

                  <p className="text-sm text-ink-secondary">
                    {selected.length} {selected.length === 1 ? 'item' : 'itens'} ·{' '}
                    <span className="font-display font-bold text-ink-primary">{formatCentsToBRL(selectedTotal)}</span>
                  </p>
                </div>
              )}
            </div>
          )}

          <p className="text-xs text-ink-muted">
            Os itens entram como despesas no cartão e caem na fatura certa pelo fechamento cadastrado.
          </p>

          <div className="flex gap-3">
            <Button variant="secondary" onClick={close} className="flex-1" type="button">
              Cancelar
            </Button>
            <Button onClick={submit} loading={createMany.isPending} className="flex-1" type="button">
              Importar
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
