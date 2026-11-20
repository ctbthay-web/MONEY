# Falhas críticas
Nenhuma falha de severidade CRÍTICA confirmada neste ciclo. Atenção: a ausência é limitada ao que foi analisado estaticamente; nada foi provado dinamicamente. As três ALTA abaixo são as candidatas a bloqueio de lançamento:
- ALTA-01 Cota de lançamentos burlável pelo cliente.
- ALTA-02 Validação HMAC do webhook Kiwify sobre JSON re-serializado.
- ALTA-03 Webhook marca evento como processado sem checar falha da atualização do perfil.
Detalhes em FALHAS_E_CORRECOES.md.
