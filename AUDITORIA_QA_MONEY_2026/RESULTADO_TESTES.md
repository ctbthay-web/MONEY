# Resultado dos testes
Execução: 11/11/2026, Playwright 1.63, build local `dist`, tráfego externo bloqueado.
Projetos executados: chromium (desktop) e mobile-android (Pixel 7). Não executados: firefox, webkit, mobile-ios, tablet.

## Executados — 84 aprovados, 0 reprovados, 2 pulados
| ID | Cenário | Resultado |
|---|---|---|
| AUTH-01 | Landing sem erro de JS | OK |
| AUTH-02 | 11 rotas protegidas sem sessão não expõem dados | OK |
| AUTH-03/04/05 | Login vazio, login inválido, senha curta no cadastro permanecem na tela | OK (verifica só permanência; não valida o texto das mensagens) |
| AUTH-06/07 | Esqueci a senha; 404 | OK |
| INT-01..03 | Manifest (start_url=/login), service worker, ícones | OK |
| RESP | 5 larguras (320→1920) × 4 páginas públicas: sem rolagem horizontal, sem erro JS | OK (screenshots em screenshots/) |
| PERF-01 | Landing carrega < 10 s (local, indicativo) | OK (≈0,3 s local) |
| SEC-01 | Bundle sem service_role/segredos | OK |
| SEC-02 | Webhook Kiwify rejeita sem assinatura | NÃO EXECUTADO (exige deploy de teste) |

## NÃO executados (exigem login em ambiente de teste) — status: pendente, nunca "aprovado"
Dashboard; criar/editar/excluir receita e despesa; recorrência e parcelamento; transferência não é receita/despesa; conta paga antecipada sem 2ª despesa; pagar fatura sem 2ª despesa; empréstimo entra/sai do saldo sem ser receita; metas e reservas; relatórios × lançamentos; filtros por período; exportação CSV/PDF; notificações; assistente; limites por plano (Start 25 … Premium ilimitado); bloqueio de recurso por plano; RLS com 2 usuários; sincronização entre aparelhos; negativos (valor 0, negativo, enorme, data inválida, XSS em descrição, duplo clique); performance autenticada.
Esses cenários têm esqueleto/fixtures em `tests/` e rodam com `TEST_USER_A_*`/`TEST_USER_B_*`.
