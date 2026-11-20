# Pendências do proprietário
## Decisões que dependem de você (nada foi feito sem elas)
1. Autorizar a correção da cota (lock) + trava de pré-requisito da 028.
2. Limite de exclusões por mês? (não implementado; só com sua decisão — a regra comercial de cotas não foi mexida.)
3. Autorizar: 410 em `billing-subscribe`; depois, desativar Asaas (após conferir o painel).
4. Política de acesso do `admin` a dados financeiros (S-08) e desabilitar provedor GitHub.
5. Senha mínima 8+ e requisitos.
6. Manter ou comunicar a retenção por plano (6/24 meses).
7. Contratar plano do Supabase com backup (e/ou PITR) — **obrigatório antes de clientes pagantes**.
8. Domínio próprio.
## Informações e acessos necessários
- Os **4 IDs reais** da Kiwify (produto ou oferta) + uma **oferta de teste** (não usar produto real).
- Criar o **Supabase de homologação** (URL, anon key, service role de homologação) e um ambiente Vercel de teste.
- Painel do **Asaas**: há assinaturas/cobranças ativas? Qual webhook está cadastrado? (o banco tem 0 registros, o painel externo pode divergir.)
- Acesso à lista completa dos 38 avisos do Advisor (exportar CSV no painel) se quiser tratar todos.
- Seus aparelhos (iPhone/Android) para o teste final e uma máquina com Firefox/WebKit (`npx playwright install firefox webkit`).
## O que você precisa fazer pessoalmente
Trocar a senha que foi colada no chat antes; rodar passos 1–4 do `homologacao/LEIA-ME.md`; conferir o painel da Kiwify/Asaas; autorizar a próxima etapa por escrito.
