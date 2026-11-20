# Resumo executivo — Money (para quem não é técnico)
**Dá para lançar hoje? Não.** Hoje só há 2 usuários (os dois vitalícios) e ninguém pagando, então o risco de colocar no ar agora é baixo — mas o risco de **vender** é alto.
## O que está pronto
O banco está bem protegido: um usuário não vê dados de outro, não consegue mudar o próprio plano e nem virar administrador (testado). O login corrigido funciona nos testes. As regras de cota (apagar devolve; parcelamento conta 1) funcionam em testes.
## O que está errado ou perigoso
1. **Não existe backup** do banco (plano gratuito do Supabase). Se algo der errado, os dados dos clientes se perdem.
2. **O que foi corrigido (cobrança, login, cota) ainda não está no ar** — está só em pastas. O sistema de cobrança em produção é o antigo: um cliente pode pagar e não receber acesso.
3. **A cota pode ser ultrapassada** com requisições simultâneas (achei e reproduzi; tenho a correção pronta, esperando sua autorização).
4. Aplicar as correções do banco fora de ordem deixa uma proteção desligada em silêncio.
5. Senha pode ter só 6 caracteres.
6. Existe um endpoint antigo do Asaas ainda ativo que poderia gerar cobrança de R$ 12,90 (fora dos preços oficiais).
7. A página principal é pesada (1,4 MB) e o endereço é `vercel.app` (sem domínio próprio).
## O que falta
IDs reais da Kiwify, um banco de homologação separado, testes com Kiwify/Supabase reais, testes de todas as telas autenticadas, Firefox/Safari/iPhone reais, e conferir o painel do Asaas.
## O que fazer primeiro
1) Contratar backup. 2) Criar o ambiente de homologação. 3) Me autorizar a corrigir cota/ordem das migrações/senha. 4) Passar os IDs da Kiwify e criar a oferta de teste. 5) Só então publicar, seguindo o plano de deploy.
