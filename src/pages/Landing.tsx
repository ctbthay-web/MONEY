import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  CreditCard,
  HandCoins,
  PieChart,
  ShieldCheck,
  Gauge,
  LineChart,
  FileSpreadsheet,
  Smartphone,
  Sparkles,
  Target,
  Wallet,
} from 'lucide-react'
import { MIN_PRICE_CENTS } from '../lib/plans'
import { formatCentsToBRL } from '../lib/format'
import { PlanCards } from '../components/finance/PlanCards'
import { SupportLinks } from '../components/ui/SupportLinks'
import { hasSupport } from '../lib/legal'
import { trackOnce } from '../lib/track'

const cta =
  'inline-flex h-12 items-center justify-center gap-2 rounded-full bg-brand-gradient px-7 text-base font-semibold text-[#04241C] shadow-glow transition hover:brightness-110 active:brightness-95'
const ghost =
  'glass inline-flex h-12 items-center justify-center gap-2 rounded-full px-7 text-base font-semibold text-ink-primary transition hover:bg-white/[0.08]'

const FEATURES = [
  {
    icon: CreditCard,
    title: 'Contas e cartões',
    text: 'Cadastre contas, carteira e cartões de crédito. A fatura é calculada pelo fechamento e vencimento do seu cartão.',
  },
  {
    icon: CheckCircle2,
    title: 'Contas a pagar e receber',
    text: 'Veja o que vence e confirme "Pago" ou "Recebido" com um toque. Errou? Desfaça na hora e o saldo se ajusta.',
  },
  {
    icon: Target,
    title: 'Metas e reservas',
    text: 'Defina quanto quer juntar, faça aportes e resgates e acompanhe o progresso até o prazo.',
  },
  {
    icon: HandCoins,
    title: 'Empréstimos',
    text: 'Registre o que emprestou ou pegou emprestado, com vencimento e pagamentos, agrupado por pessoa. (A partir do plano Plus)',
  },
  {
    icon: PieChart,
    title: 'Relatórios que explicam',
    text: 'Comparativo com o mês anterior, maiores gastos, distribuição por categoria e o que mais mudou no seu mês.',
  },
  {
    icon: Gauge,
    title: 'Orçamento por categoria',
    text: 'Defina quanto quer gastar em cada categoria e receba aviso ao chegar em 80% e ao estourar. (Planos Pro e Premium)',
  },
  {
    icon: LineChart,
    title: 'Previsão do seu saldo',
    text: 'Veja quanto vai sobrar até o fim do mês e se alguma conta vai te deixar no vermelho antes. (Planos Pro e Premium)',
  },
  {
    icon: FileSpreadsheet,
    title: 'Exporte seus dados',
    text: 'Baixe seus lançamentos em Excel (CSV) ou relatório em PDF, com os mesmos filtros da tela. (Planos Pro e Premium)',
  },
  {
    icon: Sparkles,
    title: 'Assistente financeira com o nome que você escolher',
    text: 'Pergunte "como está minha saúde financeira?", "posso comprar isso?" ou "o que devo fazer agora?". Ela analisa seus números reais, aponta o que é mais urgente e sugere o próximo passo. (Plano Premium)',
  },
  {
    icon: ShieldCheck,
    title: 'Só você vê seus dados',
    text: 'Cada conta acessa apenas os próprios dados, com isolamento garantido no banco de dados e conexão criptografada.',
  },
]

const STEPS = [
  { n: '1', title: 'Escolha seu plano', text: 'Crie sua conta em menos de um minuto e assine o plano que cabe no seu mês.' },
  { n: '2', title: 'Cadastre suas contas', text: 'Conta corrente, carteira, poupança e cartões com fechamento e vencimento.' },
  { n: '3', title: 'Registre e acompanhe', text: 'Lance receitas e despesas e veja saldo, faturas e relatórios se atualizarem.' },
]

const FAQ = [
  {
    q: 'Como eu pago?',
    a: 'Pelo checkout seguro da Kiwify, com Pix, cartão ou boleto. A primeira cobrança é promocional e a mensalidade vem a partir do mês seguinte.',
  },
  {
    q: 'O que acontece se eu parar de pagar?',
    a: `Seus dados continuam guardados e você segue vendo tudo. Para registrar e editar, é preciso ter um plano ativo (a partir de ${formatCentsToBRL(MIN_PRICE_CENTS)}/mês).`,
  },
  {
    q: 'Como funciona o limite de lançamentos?',
    a: 'Cada plano tem um número de lançamentos por mês (25, 50, 70 ou sem limite). Parcelamentos e recorrências contam como um só, e o limite zera todo mês. Você pode trocar de plano quando quiser.',
  },
  {
    q: 'Posso cancelar quando quiser?',
    a: 'Sim. A assinatura é mensal, sem fidelidade, e o acesso continua até o fim do período já pago.',
  },
  {
    q: 'Funciona no celular?',
    a: 'Sim. O Money abre no navegador do celular e do computador, com os dados sincronizados entre os aparelhos.',
  },
  {
    q: 'Meus dados estão seguros?',
    a: 'Cada usuário só enxerga e altera os próprios dados — a regra é aplicada no banco de dados, não só na tela. A conexão é criptografada e as senhas nunca ficam guardadas em texto.',
  },
  {
    q: 'Por quanto tempo meus lançamentos ficam guardados?',
    a: 'Movimentações já quitadas ficam guardadas por 6 meses nos planos Start e Plus, 24 meses no Pro e sem limite no Premium. Saldos, metas, categorias e empréstimos são sempre mantidos, e o que ainda não foi pago nunca é apagado.',
  },
]

function Phone({ src, alt, className = '' }: { src: string; alt: string; className?: string }) {
  return (
    <div
      className={`mx-auto w-full rounded-[2.2rem] border border-white/15 bg-black/40 p-2 shadow-[0_30px_80px_-24px_rgb(var(--a-400)/0.4)] ${className}`}
    >
      <div className="overflow-hidden rounded-[1.75rem]">
        <img src={src} alt={alt} width={780} height={1688} loading="lazy" className="block h-auto w-full" />
      </div>
    </div>
  )
}

export function LandingPage() {
  useEffect(() => {
    trackOnce('page', 'landing_view')
  }, [])
  return (
    <div className="min-h-svh w-full text-ink-primary">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <Link to="/vendas" className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-brand-gradient text-[#04241C] shadow-glow">
            <Wallet className="h-5 w-5" strokeWidth={2.5} />
          </div>
          <span className="font-display text-lg font-bold tracking-tight">Money</span>
        </Link>
        <nav className="flex items-center gap-2">
          <a href="#planos" className="hidden rounded-full px-4 py-2 text-sm font-semibold text-ink-secondary transition hover:text-ink-primary sm:inline-block">
            Planos
          </a>
          <Link to="/login" className="rounded-full px-4 py-2 text-sm font-semibold text-ink-secondary transition hover:text-ink-primary">
            Entrar
          </Link>
          <Link to="/planos" className="hidden h-10 items-center rounded-full bg-brand-gradient px-5 text-sm font-semibold text-[#04241C] sm:inline-flex">
            Criar conta
          </Link>
        </nav>
      </header>

      <main>
        {/* Hero */}
        <section className="mx-auto grid w-full max-w-6xl items-center gap-10 px-4 pb-16 pt-6 sm:px-6 md:grid-cols-[1.1fr_0.9fr] md:pb-24 md:pt-12">
          <div>
            <span className="glass inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-semibold text-brand-300">
              <Check className="h-3.5 w-3.5" /> Primeira cobrança promocional
            </span>
            <h1 className="font-display mt-5 text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl md:text-6xl">
              Suas finanças no controle, <span className="text-gradient-brand">sem planilha</span>.
            </h1>
            <p className="mt-5 max-w-xl text-base text-ink-secondary sm:text-lg">
              Contas, cartões, metas e empréstimos em um só lugar. Saiba quanto tem, o que vence e para onde o dinheiro
              está indo — no celular ou no computador.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link to="/planos" className={cta}>
                Escolher meu plano <ArrowRight className="h-4 w-4" />
              </Link>
              <Link to="/login" className={ghost}>
                Já tenho conta
              </Link>
            </div>
            <p className="mt-4 text-sm text-ink-muted">
              Planos a partir de {formatCentsToBRL(MIN_PRICE_CENTS)}/mês. Cancele quando quiser.
            </p>
          </div>
          <Phone src="/landing/app-dashboard.jpg" alt="Tela inicial do Money com saldo total, receitas, despesas e observações do mês" className="max-w-[300px] md:max-w-[340px]" />
        </section>

        {/* Recursos */}
        <section className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6">
          <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Tudo o que você precisa, sem complicar</h2>
          <p className="mt-3 max-w-2xl text-ink-secondary">
            Feito para o dia a dia: registrar rápido, entender o mês e não perder nenhum vencimento.
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <div key={title} className="glass rounded-3xl p-5">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-500/15 text-brand-300">
                  <Icon className="h-5 w-5" strokeWidth={2} />
                </div>
                <h3 className="font-display mt-4 text-lg font-bold">{title}</h3>
                <p className="mt-1.5 text-sm text-ink-secondary">{text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Telas */}
        <section className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6">
          <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Veja como é por dentro</h2>
          <p className="mt-3 max-w-2xl text-ink-secondary">Telas reais do app, com dados de exemplo.</p>
          <div className="mt-10 grid gap-10 sm:grid-cols-3">
            {[
              { src: '/landing/app-movimentacoes.jpg', alt: 'Lista de movimentações em aberto com botões Pagar e Receber', label: 'O que vence, com um toque para confirmar' },
              { src: '/landing/app-dashboard.jpg', alt: 'Painel com saldo total e evolução do saldo', label: 'Seu saldo e o que mudou no mês' },
              { src: '/landing/app-relatorios.jpg', alt: 'Relatório com gráfico de receitas e despesas e distribuição por categoria', label: 'Relatórios por período e categoria' },
            ].map((s) => (
              <figure key={s.src}>
                <Phone src={s.src} alt={s.alt} className="max-w-[260px]" />
                <figcaption className="mt-4 text-center text-sm font-medium text-ink-secondary">{s.label}</figcaption>
              </figure>
            ))}
          </div>
        </section>

        {/* Como funciona */}
        <section className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6">
          <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Comece em 3 passos</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.n} className="glass flex gap-4 rounded-3xl p-5">
                <div className="font-display flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-gradient text-lg font-bold text-[#04241C]">
                  {s.n}
                </div>
                <div>
                  <h3 className="font-display text-lg font-bold">{s.title}</h3>
                  <p className="mt-1 text-sm text-ink-secondary">{s.text}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Preço */}
        <section id="planos" className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6">
          <h2 className="font-display text-center text-3xl font-bold tracking-tight sm:text-4xl">Escolha o plano ideal</h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-ink-secondary">
            A primeira cobrança é promocional e a mensalidade vem a partir do mês seguinte. Troque de plano quando quiser.
          </p>
          <div className="mt-10">
            <PlanCards mode="landing" />
          </div>
          <p className="mt-6 text-center text-xs text-ink-muted">
            Lançamentos parcelados ou recorrentes contam como um só. Sem fidelidade: cancele quando quiser.
          </p>
        </section>

        {/* FAQ */}
        <section className="mx-auto w-full max-w-3xl px-4 py-14 sm:px-6">
          <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Perguntas frequentes</h2>
          <div className="mt-8 flex flex-col gap-3">
            {FAQ.map((f) => (
              <details key={f.q} className="glass group rounded-2xl px-5 py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-base font-semibold">
                  {f.q}
                  <ChevronDown className="h-4 w-4 shrink-0 text-ink-muted transition group-open:rotate-180" />
                </summary>
                <p className="mt-3 text-sm text-ink-secondary">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* CTA final */}
        <section className="mx-auto w-full max-w-6xl px-4 pb-20 pt-6 sm:px-6">
          <div className="glass flex flex-col items-center gap-5 rounded-[2rem] px-6 py-10 text-center">
            <Smartphone className="h-8 w-8 text-brand-300" />
            <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Comece hoje a organizar seu dinheiro</h2>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link to="/planos" className={cta}>
                Escolher meu plano <ArrowRight className="h-4 w-4" />
              </Link>
              <Link to="/login" className={ghost}>
                Entrar
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-3 px-4 pb-10 text-sm text-ink-muted sm:flex-row sm:px-6">
        <span>© {new Date().getFullYear()} Money</span>
        <span className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
          <Link to="/termos" className="hover:text-ink-primary">Termos de Uso</Link>
          <Link to="/privacidade" className="hover:text-ink-primary">Política de Privacidade</Link>
          {hasSupport && <SupportLinks />}
        </span>
        <Link to="/login" className="font-medium text-ink-secondary hover:text-ink-primary">
          Já sou usuário — Entrar
        </Link>
      </footer>
    </div>
  )
}
