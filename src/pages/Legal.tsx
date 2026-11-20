import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Wallet } from 'lucide-react'
import { LEGAL, hasSupport } from '../lib/legal'
import { SupportLinks } from '../components/ui/SupportLinks'

interface Section {
  h: string
  p: ReactNode[]
}

function LegalLayout({ title, intro, sections }: { title: string; intro: ReactNode; sections: Section[] }) {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <header className="mb-6 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-brand-gradient text-[#04241C] shadow-glow">
            <Wallet className="h-5 w-5" strokeWidth={2.5} />
          </span>
          <span className="font-display text-lg font-bold tracking-tight">Money</span>
        </Link>
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-secondary hover:text-ink-primary">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Link>
      </header>

      <article className="glass rounded-3xl p-6 sm:p-9">
        <h1 className="font-display text-3xl font-bold tracking-tight text-ink-primary">{title}</h1>
        <p className="mt-1 text-xs text-ink-muted">Última atualização: {LEGAL.updatedAt}</p>
        <div className="mt-5 text-sm leading-relaxed text-ink-secondary">{intro}</div>

        <div className="mt-6 flex flex-col gap-6">
          {sections.map((s, i) => (
            <section key={s.h}>
              <h2 className="font-display text-lg font-bold text-ink-primary">
                {i + 1}. {s.h}
              </h2>
              <div className="mt-2 flex flex-col gap-2 text-sm leading-relaxed text-ink-secondary">
                {s.p.map((t, k) => (
                  <p key={k}>{t}</p>
                ))}
              </div>
            </section>
          ))}
        </div>

        <div className="mt-8 border-t border-border pt-5 text-sm text-ink-secondary">
          <p className="font-semibold text-ink-primary">Fale com a gente</p>
          <p className="mt-1">
            {hasSupport ? <SupportLinks /> : 'Use os canais de suporte indicados dentro do aplicativo.'}
          </p>
        </div>
      </article>

      <p className="mt-5 text-center text-xs text-ink-muted">
        <Link to="/termos" className="hover:text-ink-secondary">Termos de Uso</Link> ·{' '}
        <Link to="/privacidade" className="hover:text-ink-secondary">Política de Privacidade</Link>
      </p>
    </div>
  )
}

const who = LEGAL.company
  ? `${LEGAL.company}${LEGAL.document ? ` (CPF/CNPJ ${LEGAL.document})` : ''}`
  : 'o Money'
const whoBy = LEGAL.company ? who : 'a equipe do Money'

// ---------------------------------------------------------------- Termos de Uso

export function TermsPage() {
  return (
    <LegalLayout
      title="Termos de Uso"
      intro={
        <p>
          Estes Termos explicam as regras para usar o Money, um aplicativo de organização de finanças pessoais operado por {whoBy}. Ao criar uma
          conta, você declara que leu e concorda com eles e com a{' '}
          <Link to="/privacidade" className="font-semibold text-brand-300 hover:underline">Política de Privacidade</Link>.
        </p>
      }
      sections={[
        {
          h: 'O que é o Money',
          p: [
            'O Money é uma ferramenta para registrar receitas, despesas, contas, cartões, metas, empréstimos e acompanhar relatórios, previsões e orçamentos. Os cálculos e sugestões do app (inclusive os da assistente, nos planos que a incluem) usam os dados que você mesmo informou.',
            'O Money não é banco, corretora, instituição financeira nem consultoria de investimentos. Nada no app é recomendação de investimento, de crédito ou de qualquer produto financeiro. As análises são educativas e dependem da qualidade dos dados lançados por você.',
          ],
        },
        {
          h: 'Cadastro e conta',
          p: [
            'Para usar o Money você precisa ter capacidade civil para contratar (18 anos ou mais, ou estar devidamente assistido) e informar dados verdadeiros. Você é responsável por manter sua senha em sigilo e por tudo o que acontece na sua conta.',
            'Cada conta é pessoal. Avise-nos imediatamente se suspeitar de uso indevido do seu acesso.',
          ],
        },
        {
          h: 'Planos, preços e pagamento',
          p: [
            'O Money é um serviço por assinatura mensal, com os planos Start, Plus, Pro e Premium. Cada plano tem um limite de lançamentos por mês e recursos próprios, descritos na página de planos. Os valores e a promoção da primeira cobrança aparecem na página de vendas e na tela de pagamento antes da compra.',
            'O pagamento é processado pela Kiwify, plataforma de pagamentos parceira, por Pix, cartão ou boleto, conforme a disponibilidade. O Money não armazena números de cartão. A assinatura renova automaticamente todo mês até ser cancelada.',
            'O acesso ao app é liberado quando a Kiwify confirma o pagamento. Se o pagamento for recusado, atrasar, for reembolsado ou contestado, o acesso para registrar e editar dados pode ser suspenso; seus dados continuam guardados e visíveis para consulta.',
            'Mudança de plano: ao contratar outro plano, a nova assinatura é criada na Kiwify e a anterior deve ser cancelada por você na própria Kiwify para não haver cobrança em duplicidade.',
          ],
        },
        {
          h: 'Cancelamento e reembolso',
          p: [
            'Você pode cancelar a renovação a qualquer momento, sem multa, pela Kiwify (pelo e-mail de compra ou pela área do cliente). O acesso continua até o fim do período já pago.',
            'Conforme o Código de Defesa do Consumidor (art. 49), em compras feitas à distância você pode desistir em até 7 dias corridos contados da primeira contratação, com devolução do valor pago. Para isso, solicite pela Kiwify ou fale com a gente.',
          ],
        },
        {
          h: 'Uso adequado',
          p: [
            'É proibido usar o Money para fins ilícitos, tentar acessar dados de outras pessoas, burlar limites e proteções do serviço, sobrecarregar a infraestrutura, copiar o sistema ou revender o acesso. Contas que violarem estas regras podem ser suspensas ou encerradas.',
          ],
        },
        {
          h: 'Seus dados',
          p: [
            'Os dados que você lança são seus. Tratamos esses dados para prestar o serviço, conforme a Política de Privacidade. Você pode exportar ou excluir seus dados a qualquer momento em Perfil → Meus dados.',
            'Os limites de histórico variam por plano: movimentações já quitadas podem ser removidas após o prazo do plano (6 meses no Start e no Plus, 24 meses no Pro, sem limite no Premium). Saldos, metas, categorias e empréstimos são mantidos, e o que ainda não foi pago nunca é apagado por esse prazo.',
          ],
        },
        {
          h: 'Disponibilidade e segurança',
          p: [
            'Trabalhamos para manter o serviço disponível e seguro, mas não prometemos funcionamento ininterrupto: pode haver manutenções, instabilidades e falhas de terceiros (hospedagem, banco de dados, pagamentos). Faça exportações dos seus dados de tempos em tempos para ter uma cópia sua.',
          ],
        },
        {
          h: 'Responsabilidade',
          p: [
            'O Money é uma ferramenta de apoio. Decisões financeiras são suas. Na extensão permitida pela lei, não nos responsabilizamos por perdas decorrentes de dados lançados incorretamente, de decisões tomadas com base nas informações do app ou de indisponibilidade de serviços de terceiros. Nada aqui limita direitos que a lei garante ao consumidor.',
          ],
        },
        {
          h: 'Propriedade intelectual',
          p: ['O software, a marca Money, o design e os textos do app pertencem a quem opera o serviço. Você recebe apenas o direito de usar o app, de forma pessoal, enquanto sua assinatura estiver ativa.'],
        },
        {
          h: 'Mudanças nestes Termos',
          p: ['Podemos atualizar estes Termos. Mudanças relevantes serão avisadas no app ou por e-mail com antecedência razoável. Continuar usando o Money depois da mudança significa concordar com a nova versão; se não concordar, você pode cancelar e excluir sua conta.'],
        },
        {
          h: 'Lei aplicável e foro',
          p: ['Estes Termos seguem a lei brasileira. Fica eleito o foro do domicílio do consumidor para resolver qualquer questão, conforme o Código de Defesa do Consumidor.'],
        },
      ]}
    />
  )
}

// ---------------------------------------------------------------- Política de Privacidade (LGPD)

export function PrivacyPage() {
  return (
    <LegalLayout
      title="Política de Privacidade"
      intro={
        <p>
          Esta política explica, em linguagem simples, quais dados o Money coleta, para que usa, com quem compartilha e quais são os seus direitos,
          conforme a Lei Geral de Proteção de Dados (LGPD, Lei nº 13.709/2018). O responsável pelo tratamento dos seus dados (controlador) é {who}.
        </p>
      }
      sections={[
        {
          h: 'Dados que coletamos',
          p: [
            'Dados de cadastro: nome, e-mail e senha (a senha é guardada de forma protegida, nunca em texto aberto).',
            'Dados que você lança: contas, cartões, categorias, receitas, despesas, transferências, metas, empréstimos, orçamentos, recorrências e, se usar a assistente, o histórico das conversas. São dados financeiros pessoais, tratados com cuidado especial.',
            'Dados de assinatura: plano, situação e datas de pagamento, informados pela Kiwify. Os dados de pagamento (cartão, CPF/CNPJ, endereço de cobrança) são tratados pela Kiwify; o Money não os guarda.',
            'Dados técnicos e de uso: um identificador aleatório do navegador, páginas e etapas visitadas (por exemplo, cadastro e ida ao pagamento) e erros de tela, para medir o funcionamento do serviço. Esses registros não contêm seu nome, e-mail nem valores financeiros e são apagados em até 90 dias.',
            'Notificações: se você permitir, guardamos o endereço do seu aparelho para enviar avisos de vencimento.',
          ],
        },
        {
          h: 'Para que usamos seus dados',
          p: [
            'Para criar e manter sua conta, prestar o serviço contratado, calcular saldos, relatórios, previsões e avisos, liberar o plano que você pagou, dar suporte e cumprir obrigações legais (bases legais: execução de contrato e cumprimento de obrigação legal).',
            'Para proteger a segurança do serviço, prevenir fraudes e melhorar o produto com dados de uso e erros (base legal: legítimo interesse, sempre respeitando seus direitos).',
            'Para enviar notificações push, apenas se você permitir (base legal: consentimento, que você pode retirar a qualquer momento nas configurações do aparelho ou do app).',
            'Não vendemos seus dados e não usamos seus dados financeiros para publicidade.',
          ],
        },
        {
          h: 'Com quem compartilhamos',
          p: [
            'Usamos fornecedores que processam dados em nosso nome: Supabase (banco de dados e autenticação, com servidores no Brasil), Vercel (hospedagem do site e das funções do servidor) e Kiwify (pagamentos e assinatura; para assinaturas antigas, também o Asaas). Cada um recebe só o necessário para sua função.',
            'Alguns fornecedores podem tratar dados fora do Brasil. Quando isso acontece, é feito dentro das hipóteses da LGPD (art. 33), com as garantias oferecidas pelo fornecedor.',
            'Podemos compartilhar dados com autoridades quando houver obrigação legal ou ordem judicial.',
          ],
        },
        {
          h: 'Por quanto tempo guardamos',
          p: [
            'Mantemos seus dados enquanto sua conta existir. Movimentações quitadas seguem o prazo de histórico do seu plano (6, 24 meses ou sem limite). Ao excluir a conta, apagamos seus dados do Money; registros que a lei nos obriga a manter (por exemplo, fiscais e de pagamento) permanecem com os fornecedores de pagamento pelo prazo legal.',
          ],
        },
        {
          h: 'Seus direitos',
          p: [
            'Você pode, a qualquer momento: confirmar que tratamos seus dados; acessá-los; corrigi-los; pedir portabilidade; pedir a exclusão; saber com quem compartilhamos; e revogar consentimentos (art. 18 da LGPD).',
            'No app, em Perfil → Meus dados, você baixa uma cópia dos seus dados (arquivo JSON) e pode excluir sua conta por conta própria. Para qualquer outro pedido, fale com a gente pelos canais abaixo. Você também pode reclamar à Autoridade Nacional de Proteção de Dados (ANPD).',
          ],
        },
        {
          h: 'Segurança',
          p: [
            'Cada usuário só acessa os próprios dados: essa regra é aplicada no banco de dados, e não só na tela. A conexão é criptografada. Mesmo assim, nenhum sistema é totalmente imune a falhas: use uma senha forte e exclusiva e avise-nos se perceber algo estranho. Em caso de incidente relevante, comunicaremos você e a ANPD conforme a lei.',
          ],
        },
        {
          h: 'Cookies e armazenamento no navegador',
          p: [
            'O Money guarda no seu navegador apenas o necessário para funcionar: sua sessão de login, a aparência escolhida (tema e cor), o plano que você escolheu antes de criar a conta e um identificador anônimo de uso. Não usamos cookies de publicidade nem de rastreamento de terceiros. Se o seu navegador estiver com “Não rastrear” ativado, não registramos eventos de uso.',
          ],
        },
        {
          h: 'Crianças e adolescentes',
          p: ['O Money é destinado a maiores de 18 anos. Não coletamos intencionalmente dados de crianças e adolescentes.'],
        },
        {
          h: 'Mudanças nesta política',
          p: ['Podemos atualizar esta política. Quando a mudança for relevante, avisaremos no app ou por e-mail. A data da última atualização fica no topo desta página.'],
        },
      ]}
    />
  )
}
