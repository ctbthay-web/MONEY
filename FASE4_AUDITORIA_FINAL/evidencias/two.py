import subprocess, time, select, os
U='00000000-0000-0000-0000-0000000000c1'
def q(sql): return subprocess.run(['psql','-h','/tmp/pgreal','-p','5544','-U','postgres','-d','money','-At','-q','-c',sql],capture_output=True,text=True).stdout.strip()
ACC=q(f"select id from accounts where user_id='{U}' limit 1")
q(f"insert into accounts(user_id,name,type) select '{U}','segunda','checking' where (select count(*) from accounts where user_id='{U}')<2")
ACC2=q(f"select id from accounts where user_id='{U}' and id<>'{ACC}' limit 1")
q(f"delete from transactions where user_id='{U}'"); q(f"insert into transactions(user_id,account_id,type,amount_cents,description) select '{U}','{ACC}','expense',100,'pre'||g from generate_series(1,24) g")
def sess(): return subprocess.Popen(['psql','-h','/tmp/pgreal','-p','5544','-U','postgres','-d','money','-At'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,bufsize=1)
def send(p,s): p.stdin.write(s+'\n'); p.stdin.flush()
def drain(p,t=1.5):
    out=''; 
    while select.select([p.stdout],[],[],t)[0]:
        l=p.stdout.readline()
        if not l: break
        out+=l
    return out
a,b=sess(),sess()
for p in (a,b):
    send(p,f"begin; set local role authenticated; select set_config('request.jwt.claim.sub','{U}',true) \\g /dev/null"); drain(p,2.0)
ins=lambda d,ac=None:f"insert into transactions(user_id,account_id,type,amount_cents,description) values('{U}','{ac or ACC}','expense',100,'{d}');"
send(a,ins('A')+" set constraints all immediate; select 'A: checagem OK';"); print(drain(a).strip())
send(b,ins('B',ACC2)+" set constraints all immediate; select 'B: checagem OK';"); print(drain(b).strip())
send(a,"commit; select 'A: commit';"); print(drain(a).strip())
send(b,"commit; select 'B: commit';"); print(drain(b).strip())
print('final:',q(f"select count(*) from transactions where user_id='{U}'"),'(limite 25)')
