# Relatório da Fase 3 — Money
**Veredito (provisório): continua NÃO APROVADO para lançamento comercial**, mas **PRONTO PARA HOMOLOGAÇÃO**. Os bloqueios restantes dependem de você ou de sistemas externos (abaixo). Nada foi aplicado em produção; nenhuma cobrança real; nada apagado; preços intactos.

## Pronto (testado de verdade, em ambiente simulado salvo indicação)
- **Cota (§1):** migração 028 — apagar devolve cota; auditoria de exclusões; brecha nova fechada. 39/39. A 027b NÃO deve ser usada. Doc: `COTA_E_EXCLUSOES.md`.
- **Asaas (§2):** consultas de leitura em produção feitas: zero vestígios de Asaas no banco; plano de desativação e rollback documentados; nada desativado. Doc: `ASAAS_FASE3.md`.
- **Kiwify (§3):** mapeamento estrito por ID, variáveis documentadas, script de verificação sem expor segredos. 14/14 + 29/29. Doc: `KIWIFY_CONFIGURACAO.md`.
- **Login (§4):** causa achada e reproduzida, corrigida, 13/13 (desktop e iPhone emulado). Doc: `LOGIN_CORRECAO.md`.
- **Homologação (§5):** pacote de migrações, seed A/B, env, passo a passo. Regressão financeira idêntica (11/11).
- **Playwright (§6):** suíte `tests/homologacao` (24 testes de backend + fluxos de tela) compilada e listada (33 testes), todos "skip" sem o ambiente.

## O que depende de você
1. **Aplicar** 027+028 (primeiro na homologação, depois em produção) — decisão sua; 2. **Criar o Supabase de homologação** e preencher o `.env.local`; 3. **IDs reais da Kiwify** (4) + produto/oferta de teste; 4. **Painel do Asaas:** conferir assinaturas e webhook; autorizar (ou não) a desativação; 5. **Deploy** da correção de login e teste no seu celular; 6. Rodar Firefox/WebKit/iPhone na sua máquina; 7. Trocar a senha que foi colada no chat antes.
## Limites que não escondo
Mock e PGlite não são o Supabase/Kiwify reais; o seed script e a suíte de backend nunca rodaram contra um Supabase real; Firefox/WebKit indisponíveis aqui; specs autenticados de telas continuam esqueleto. Pendências antigas não tratadas: tamanho do bundle (M-07), senha mínima (B-01).
