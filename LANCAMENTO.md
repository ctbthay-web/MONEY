# Money — roteiro de lançamento

Estado em 15/11/2026. Marque conforme for fazendo.

## 1. Teste de compra real (obrigatório antes de divulgar)

Objetivo: provar que **comprar → a Kiwify avisa → o plano libera sozinho** funciona de ponta a ponta.

**Preparação (uma vez)**
- [ ] Na Kiwify, a cobrança do plano **Start** (R$ 9,90 na 1ª cobrança) está ativa e o link está nas variáveis `VITE_KIWIFY_URL_START` da Vercel.
- [ ] O webhook da Kiwify aponta para `https://money-app-woad.vercel.app/api/kiwify-webhook`, com o mesmo token de `KIWIFY_WEBHOOK_TOKEN`, e os eventos: compra aprovada, compra reembolsada, chargeback, assinatura cancelada/atrasada/renovada.
- [ ] Use um e-mail seu que **não tenha conta** (no Gmail, `seunome+teste1@gmail.com` vale como e-mail novo).

**Passo a passo**
1. Página de vendas → **Assinar Start** → preencha o cadastro e marque o aceite dos Termos.
2. Abra o e-mail "Confirme seu e-mail no Money" (veja o spam) e clique em confirmar.
3. Você deve ver "E-mail confirmado! Levando você ao pagamento do plano Start…" e cair na Kiwify, com o e-mail preenchido.
4. Pague (Pix é o mais rápido).
5. Volte ao app. Em até ~1 minuto ele deve abrir sozinho (a tela confere a cada 5 segundos).

**O que conferir**
- [ ] O app abriu com acesso liberado (Perfil mostra "Assinante" e a data de renovação ~1 mês à frente).
- [ ] Em **Assinatura**, aparece o plano **Start** e o contador "x de 25 lançamentos".
- [ ] Na Kiwify, a venda aparece como aprovada; no painel do webhook, o último envio retornou **200**.
- [ ] Se **não** liberou: veja o log do webhook na Kiwify (status 401 = token/assinatura; 200 `ignored` = plano não reconhecido pelo nome; 200 `pending` = não achou a conta). Me mande o log.

**Reembolso (testa o caminho contrário)**
- [ ] Peça o reembolso na Kiwify. O acesso deve **cair** em instantes (o app volta à tela de escolher plano).

**Conta já existente que tenta se cadastrar de novo**
- [ ] Tente se cadastrar com o mesmo e-mail: deve aparecer "Você já tem cadastro" (e não ficar esperando e-mail).

## 2. Antes de divulgar

- [ ] **Dados dos Termos e da Privacidade**: definir na Vercel `VITE_LEGAL_NAME`, `VITE_LEGAL_DOC` (CPF/CNPJ), `VITE_SUPPORT_EMAIL`, `VITE_SUPPORT_WHATSAPP` e republicar. O que ficar vazio é omitido nas páginas.
- [ ] **Revisão jurídica** dos Termos (`/termos`) e da Política (`/privacidade`) por um advogado. São modelos redigidos para o app, não substituem parecer jurídico.
- [ ] **E-mail**: domínio próprio + envio via Resend (SMTP) para sair do limite de 2 e-mails/hora do Supabase e usar os modelos em português. Os 13 modelos já estão prontos.
- [ ] **Planos pagos de infraestrutura**: Supabase (sem pausa por inatividade, com backups) e Vercel (uso comercial). Confirmar nos painéis.
- [ ] **Kiwify — retorno após a compra**: em cada produto/oferta (Start, Plus, Pro, Premium), configure a "URL de redirecionamento após a compra" para `https://money-app-woad.vercel.app/obrigado`. Essa página não libera nada; só orienta a entrar. A liberação vem do webhook.
- [ ] **Kiwify — nome do plano**: o webhook identifica o plano pelo nome (START, PLUS, PRO, PREMIUM) na assinatura ou no produto. Se o nome não contiver uma dessas palavras, o pagamento é ignorado ("plano não identificado"). Alternativa: definir `KIWIFY_PRODUCT_START|PLUS|PRO|PREMIUM` (id do produto) na Vercel.
- [ ] **Domínio próprio** para o app (e para o e-mail acima).
- [ ] Texto de **cancelamento/reembolso** claro na Kiwify (garantia de 7 dias) e na landing.

## 3. Credenciais para trocar (passaram por conversa)

- [ ] Token pessoal do Supabase (`sbp_…`) — Account → Access Tokens → Revoke.
- [ ] Client Secret da API da Kiwify — gerar um novo e atualizar onde for usado.
- [ ] Token da Vercel usado nas implantações — revogar e gerar outro.

## 4. Nas primeiras semanas

- [ ] Olhar **Administração → Funil de vendas** toda semana (visitas, cliques, cadastros, ida ao pagamento) e **Erros recentes**.
- [ ] Combinar com você o que fazer com quem trocar de plano (cria uma 2ª assinatura na Kiwify; a antiga precisa ser cancelada lá).
- [ ] Avisos por notificação saem 1x por dia (09h). Horários mais precisos pedem agendamento no Supabase (`pg_cron`).
- [ ] Recursos exclusivos de plano (importar fatura, planejamento, assistente) só são travados na tela; o limite de lançamentos é imposto no banco.

## 5. O que já está pronto

- Cadastro com confirmação de e-mail → pagamento direto no plano escolhido; compra ligada à conta que abriu o pagamento; conferência de assinatura da Kiwify pelo corpo cru.
- Termos de Uso e Política de Privacidade (LGPD) com aceite no cadastro e links nos rodapés.
- **Perfil → Meus dados**: exportar tudo em JSON e excluir a própria conta (apaga todos os dados; avisa que a cobrança na Kiwify precisa ser cancelada à parte).
- Medição própria (sem serviço externo) do funil e de erros, visível só para administradores; eventos apagados após 90 dias.
- Recorrências, importação de fatura (inclui PDF), pagamento de empréstimo por conta, assistente financeira por regras.
