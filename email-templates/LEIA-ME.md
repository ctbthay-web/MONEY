# Modelos de e-mail do Money (português)

Cole cada arquivo em **Supabase → Authentication → Emails → Templates**,
na aba correspondente, junto com o assunto (Subject) indicado.

| Aba no Supabase | Assunto (Subject) | Arquivo |
|---|---|---|
| Confirm sign up | Confirme seu e-mail no Money | 1-confirmar-cadastro.html |
| Reset password | Redefina sua senha do Money | 2-redefinir-senha.html |
| Magic link | Seu link de acesso ao Money | 3-link-de-acesso.html |
| Invite user | Você foi convidado para o Money | 4-convite.html |
| Change email address | Confirme a troca de e-mail no Money | 5-trocar-email.html |
| Reauthentication | Seu código de confirmação do Money | 6-codigo-de-confirmacao.html |

O app usa de fato **Confirm sign up** e **Reset password**. Os outros
ficam prontos caso você ative convite, link mágico ou troca de e-mail.

Os modelos usam as variáveis do Supabase (`{{ .ConfirmationURL }}`, `{{ .Email }}`,
`{{ .NewEmail }}`, `{{ .Token }}`). Não troque esses trechos.
