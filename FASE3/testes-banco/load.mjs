import { PGlite } from '@electric-sql/pglite'
import fs from 'fs'
const dir='/mnt/user-data/uploads/CLAUDE/sql/'
export async function build(upto=26, extra=[]) {
  const db = new PGlite()
  await db.exec(fs.readFileSync('/tmp/pg/prelude.sql','utf8'))
  const errs=[]
  const files=fs.readdirSync(dir).filter(f=>/^0\d\d_.*\.sql$/.test(f)).sort().filter(f=>parseInt(f)<=upto)
  for (const f of files) {
    let sql=fs.readFileSync(dir+f,'utf8')
    sql=sql.replace(/create extension[^;]*;/gi,'-- ext')
    try { await db.exec(sql) } catch(e){ errs.push(f+': '+e.message.slice(0,200)) }
  }
  for (const x of extra) { try { await db.exec(fs.readFileSync(x,'utf8')) } catch(e){ errs.push(x+': '+e.message.slice(0,300)) } }
  return {db, errs}
}
if (process.argv[1].endsWith('load.mjs')) { const {errs}=await build(); console.log(errs.length?errs.join('\n'):'ALL OK') }
