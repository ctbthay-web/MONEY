# Money

Aplicativo de gestão financeira pessoal — React + Vite + TypeScript + Tailwind CSS + Supabase.

## Como rodar

```bash
npm install
cp .env.example .env   # depois preencha com as credenciais do seu projeto Supabase
npm run dev
```

## Configurar o banco de dados

Veja o passo a passo completo em [`sql/README.md`](./sql/README.md). Resumo:

1. Crie um projeto gratuito em [supabase.com](https://supabase.com).
2. Copie a `Project URL` e a `anon public key` para o `.env`.
3. Rode os arquivos de `sql/` no SQL Editor do Supabase, na ordem numérica (001 → 007).

Sem essas duas etapas, o app carrega mas login/cadastro e qualquer operação de dados não vão funcionar.

## Prévia visual offline

`money-preview-standalone.html` é um arquivo único, sem dependências, com o novo visual do sistema
(dados de exemplo, sem conexão com o banco) — dá pra mandar pra qualquer pessoa que só precisa
clicar duas vezes para abrir no navegador. Não usar como fonte de dados real.

## Scripts

- `npm run dev` — servidor de desenvolvimento
- `npm run build` — build de produção (roda o type-check do TypeScript antes)
- `npm run lint` — lint
- `npm run preview` — pré-visualiza o build de produção
