// @vitest-environment node
import {afterEach,beforeAll,expect,it} from 'vitest'
import {readFile} from 'node:fs/promises'
import {PGlite} from '@electric-sql/pglite'
// @ts-expect-error Ferramenta Node ESM, sem dependência de frontend.
import {database} from '../../tools/homologation/reference.mjs'
// @ts-expect-error Ferramenta Node ESM, sem dependência de frontend.
import {buildSql,catalogSql,sources,root} from '../../tools/homologation/sql.mjs'
// @ts-expect-error Ferramenta Node ESM, sem dependência de frontend.
import {run} from '../../tools/homologation/apply.mjs'
let sql:string;const opened:PGlite[]=[]
async function db(){const result=await database();opened.push(result);return result as PGlite}
beforeAll(async()=>{sql=await readFile(root+'supabase/homologation/install.sql','utf8')})
afterEach(async()=>{for(const db of opened.splice(0))await db.close()})
it('instala quatro migrações e valida tabelas, funções, RLS e Realtime em PostgreSQL',async()=>{
 const d=await db();await d.exec(sql)
 expect((await d.query('select * from pcif_bootstrap.migrations')).rows).toHaveLength(4)
 expect((await d.query('select * from pcif_ops.teams')).rows).toHaveLength(31)
 expect((await d.query('select * from pcif_ops.checklist_items')).rows).toHaveLength(33)
 const expected=JSON.parse(await readFile(root+'supabase/homologation/catalog.json','utf8'));expect((await d.query<any>(catalogSql)).rows[0].catalog).toEqual(expected)
},30000)
it('reexecução preserva dados e ignora etapas instaladas',async()=>{
 const d=await db();await d.exec(sql)
 await d.exec("insert into auth.users values('00000000-0000-4000-8000-000000000001','test-hash');insert into pcif_ops.memberships(user_id,team_id,role) values('00000000-0000-4000-8000-000000000001','GAR 23','team')")
 const before=await d.query('select * from pcif_bootstrap.migrations order by version');await d.exec(sql)
 expect((await d.query('select * from pcif_bootstrap.migrations order by version')).rows).toEqual(before.rows)
 expect((await d.query('select * from pcif_ops.memberships')).rows).toHaveLength(1)
},30000)
it('continua dependências já aplicadas sem reaplicar o SQL anterior',async()=>{
 const d=await db();const migrations=await sources();await d.exec(migrations[0].sql);await d.exec(migrations[1].sql);await d.exec(sql)
 expect((await d.query<any>("select applied_by_bootstrap from pcif_bootstrap.migrations order by version")).rows.map((r:any)=>r.applied_by_bootstrap)).toEqual([false,false,true,true])
},30000)
it('instalação parcial cancela tudo sem apagar nem completar objetos desconhecidos',async()=>{
 const d=await db();await d.exec('create table public.pcif_comments(id integer)')
 await expect(d.exec(sql)).rejects.toThrow('Instalação parcial')
 await d.exec('rollback');expect((await d.query("select to_regclass('pcif_bootstrap.target') t")).rows[0]).toEqual({t:null})
 expect((await d.query("select data_type from information_schema.columns where table_name='pcif_comments' and column_name='id'")).rows[0]).toEqual({data_type:'integer'})
},30000)
it('diferenças de definição ou privilégios não são corrigidas silenciosamente',async()=>{
 const d=await db();await d.exec(sql);await d.exec('grant update on pcif_ops.reports to authenticated')
 await expect(d.exec(sql)).rejects.toThrow('Mutação direta indevida');await d.exec('rollback')
 expect((await d.query("select has_table_privilege('authenticated','pcif_ops.reports','UPDATE') allowed")).rows[0]).toEqual({allowed:true})
},30000)
it('ledger com outro destino impede reutilizar o instalador',async()=>{
 const d=await db();await d.exec(sql);await d.exec("update pcif_bootstrap.target set project_ref='another-project'")
 await expect(d.exec(sql)).rejects.toThrow('Registro de destino incompatível');await d.exec('rollback')
},30000)
it('pacote é reprodutível e corresponde às fontes',async()=>{
 const expected=JSON.parse(await readFile(root+'supabase/homologation/catalog.json','utf8'));expect(await buildSql(expected)).toBe(sql)
})
const good={ref:'exemploprojetoref000',name:'pcif-homologacao',status:'ACTIVE_HEALTHY',organization_slug:'org-pilot'}
const orgs=[{slug:'org-pilot',name:'Painel de Ativação PCIF'}]
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status})
it.each([{...good,name:'painel-de-ativacao-pcif'},{...good,ref:'production-ref'},{...good,status:'COMING_UP'}])('destino incorreto não recebe consulta SQL: $name / $ref / $status',async project=>{
 const calls:unknown[]=[];await expect(run({token:'test-only',fetcher:async(...args:any[])=>{calls.push(args);return json(project)},reportPath:'/tmp/pcif-bootstrap-wrong-target.json'})).rejects.toThrow()
 expect(calls).toHaveLength(1)
})
it('organização incorreta também bloqueia qualquer SQL',async()=>{
 let calls=0;await expect(run({token:'test-only',fetcher:async()=>++calls===1?json(good):json([{slug:'org-pilot',name:'Another organization'}]),reportPath:'/tmp/pcif-bootstrap-wrong-org.json'})).rejects.toThrow('Organização')
 expect(calls).toBe(2)
})
it('sem autorização nem sequer faz pedido HTTP',async()=>{
 let calls=0;await expect(run({token:'',fetcher:async()=>{calls++;return json({})},reportPath:'/tmp/pcif-bootstrap-no-auth.json'})).rejects.toThrow('Acesso ausente');expect(calls).toBe(0)
})
it('plano autorizado só usa inspeção read_only, sem enviar migrações',async()=>{
 const calls:any[]=[];const responses=[good,orgs,[{inspection:{auth_ready:true}}]]
 const report=await run({token:'test-only',fetcher:async(...args:any[])=>{calls.push(args);return json(responses.shift())},reportPath:'/tmp/pcif-bootstrap-plan.json'})
 expect(report.status).toBe('planned');expect(report.remote_changes).toBe(false);expect(JSON.parse(calls[2][1].body).read_only).toBe(true)
})
it('fluxo Management API aplica e valida somente o ref fixado usando PostgreSQL local',async()=>{
 const d=await db();const paths:string[]=[]
 const fetcher=async(url:string,init:any)=>{paths.push(url);if(url.endsWith('/v1/organizations'))return json(orgs);if(!init.body)return json(good);const {query}=JSON.parse(init.body);const results=await d.exec(query);return json(results.at(-1)?.rows??[])}
 const report=await run({apply:true,token:'test-only',fetcher,reportPath:'/tmp/pcif-bootstrap-apply-local.json'})
 expect(report.status).toBe('validated');expect(paths.filter(p=>p.includes('/projects/')).every(p=>p.includes('exemploprojetoref000'))).toBe(true)
},30000)
