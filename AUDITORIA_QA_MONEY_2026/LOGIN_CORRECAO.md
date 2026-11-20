# Login preso na tela de carregamento — causa, correção e testes
## Causa (investigada antes de alterar)
Em `AuthProvider`: `getSession().then(...)` sem tratamento de erro e `loadProfile` sem try/catch, com `await` dentro de `onAuthStateChange`. Se a leitura do perfil falhava (rede, 500, lentidão), `loading`/perfil nunca resolviam e `AccessGate` mantinha `if (session && !profile) → <FullScreenLoader/>` **para sempre**. Reproduzi isso antes de mexer: LOGIN-10, 12 e 13 falhavam; login válido em si funcionava.
## Correção
`AuthProvider`: estado `profileStatus` (idle/loading/ready/error), carga do perfil com limite de 8 s e 2 tentativas, `try/catch/finally`, sem `await` dentro do callback do Supabase; `retryProfile()`. `AccessGate`: em erro mostra "Não foi possível carregar sua conta" com **Tentar novamente** e **Sair**. Arquivos em `FASE3/src/features/auth/`.
## Testes (13 cenários × 2 perfis: desktop Chromium e iPhone 14 emulado no Chromium)
LOGIN-01 válido · 02 inválido · 03 sessão persiste ao atualizar · 04 atualizar rota protegida · 05 sessão expirada · 06 logout · 07/08 recuperação de senha (ok e falha de servidor) · 09 erro de conexão · 10 perfil 500 · 11 perfil lento · 12 sessão guardada + Supabase fora do ar · 13 "tentar novamente". **13/13 em ambos.**
**Limite honesto:** rodaram contra um **Supabase simulado** (mock), não contra o real; e o iPhone é emulação em Chromium, não o Safari/WebKit. A confirmação final é rodar `session-flow.spec.ts` contra a homologação e testar no seu celular. Ainda **não está em produção**: precisa de deploy.
