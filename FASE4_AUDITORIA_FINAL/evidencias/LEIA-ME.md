# Evidências reproduzíveis (Fase 4)
- `conc.sh` — estresse de concorrência da cota (xargs -P, várias contas). Requer um Postgres local com o pacote 001–028 e o prelude de testes (testes-banco/prelude.sql da FASE3). Resultado observado sem a correção: 4 de 10 rodadas passaram de 25 (máx. 27).
- `two.py` — duas transações deterministas em contas diferentes: ambas passam na checagem e a cota termina em 26 (limite 25).
- `CORRECAO_PROPOSTA_cota_lock.sql` — correção proposta (NÃO aplicada).
Nada disso toca produção: rodou em um Postgres 16 local descartável.
