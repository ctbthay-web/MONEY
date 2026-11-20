-- PROPOSTA — NÃO APLICADA EM LUGAR NENHUM (aguarda autorização). Validada só num banco de teste local (cópia isolada).
-- Fecha a corrida da cota: serializa a conferência por usuário. Testado: 0 de 15 rodadas acima do limite (antes: 4 de 10).
create or replace function public.check_tx_quota() returns trigger language plpgsql security definer set search_path = public as $$
declare lim int;
begin
  if auth.uid() is null then return null; end if;
  perform pg_advisory_xact_lock(hashtextextended('txquota:'||new.user_id::text,0));
  lim := public.tx_month_limit(new.user_id);
  if lim is not null and public.tx_used_this_month(new.user_id) > lim then
    raise exception 'Você chegou ao limite de % lançamentos por mês do seu plano. Faça upgrade em Assinatura para continuar.', lim;
  end if;
  return null;
end $$;
