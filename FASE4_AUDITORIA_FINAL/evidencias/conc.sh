#!/bin/bash
# Teste de concorrência da cota: N sessões simultâneas, cada uma insere 1 lançamento (plano Start, limite 25).
P="psql -h /tmp/pgreal -p 5544 -U postgres -d money -At -q"
U=00000000-0000-0000-0000-0000000000c1
N=${1:-40}; ROUNDS=${2:-15}
$P -c "insert into auth.users(id,email) values('$U','c1@t.test') on conflict do nothing" >/dev/null
$P -c "update profiles set plan_id='start', paid_until=now()+interval '30 days' where id='$U'" >/dev/null
ACC=$($P -c "select id from accounts where user_id='$U' limit 1")
[ -z "$ACC" ] && ACC=$($P -c "set role authenticated; select set_config('request.jwt.claim.sub','$U',false); insert into accounts(user_id,name,type) values('$U','c','checking') returning id" | tail -1 | tr -d ' ')
ACC=$($P -c "select id from accounts where user_id='$U' limit 1")
over=0
for r in $(seq 1 $ROUNDS); do
  $P -c "delete from transactions where user_id='$U'" >/dev/null
  seq 1 $N | xargs -P $N -I{} psql -h /tmp/pgreal -p 5544 -U postgres -d money -q -c "begin; set local role authenticated; select set_config('request.jwt.claim.sub','$U',true); insert into transactions(user_id,account_id,type,amount_cents,description) values('$U','$ACC','expense',100,'c{}'); commit;" >/dev/null 2>&1
  c=$($P -c "select count(*) from transactions where user_id='$U'")
  [ "$c" -gt 25 ] && over=$((over+1))
  echo "rodada $r: $c lançamentos gravados (limite 25)"
done
echo "RODADAS ACIMA DO LIMITE: $over de $ROUNDS"
