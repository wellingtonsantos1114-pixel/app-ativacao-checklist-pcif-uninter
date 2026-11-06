// @vitest-environment node
import { PGlite } from '@electric-sql/pglite'
import { readFile,writeFile } from 'node:fs/promises'
import { beforeAll, afterAll, expect, it } from 'vitest'
import { teams, teamRegion } from '../lib/teams'
import { cargoItems, vehicleItems } from '../lib/checklist'
import {latestChecklist} from './checklistReference'
const db=new PGlite()
const op='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002',analyst='00000000-0000-4000-8000-000000000003'
const session=(id:string)=>id.replace('00000000-','10000000-')
async function as(id:string,sql:string,params:unknown[]=[]){
 await db.exec(`reset role;select set_config('request.jwt.claim.sub','${id}',false);select set_config('request.jwt.claims','{"session_id":"${session(id)}"}',false);set role authenticated;`)
 return db.query(sql,params)
}
const activation={notes:'Piloto fictício',fields:{shift:'Diurno','person.0':'Pessoa Fictícia Alfa','person.1':'Pessoa Fictícia Beta',vehicleType:'Oficial',model:'L200',plate:'TEST123',project:'Piloto',city:'Município fictício','condition.0':'Inoperante','condition.1':'Operante','condition.2':'Operante'}}
const checklist={notes:'Inspeção piloto',fields:Object.fromEntries([...vehicleItems.flatMap((_,i)=>[[`vehicle.${i}.answer`,'Conforme']]),...cargoItems.flatMap((_,i)=>[[`cargo.${i}.answer`,'Conforme'],[`cargo.${i}.quantity`,'1']])])}
let n=0
function uuid(){return `20000000-0000-4000-8000-${String(++n).padStart(12,'0')}`}
async function submit(kind:string,payload:unknown,revision:number,id=uuid()){
 const r=await as(op,'select public.pcif_ops_submit($1::uuid,$2,$3::jsonb,$4::bigint) result',[id,kind,JSON.stringify(payload),revision]);return (r.rows[0] as {result:any}).result
}
beforeAll(async()=>{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
 create table auth.users(id uuid primary key,encrypted_password text);
 create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id));
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function auth.jwt() returns jsonb language sql stable as $$select nullif(current_setting('request.jwt.claims',true),'')::jsonb$$;
 grant usage on schema auth to authenticated;grant execute on function auth.uid(),auth.jwt() to authenticated;`)
 for(const file of ['202610140001_pcif_comments.sql','202610170001_pcif_session_access.sql']) {
  // Fixtures das migrações reais do painel; a suíte independe de outro checkout.
  await db.exec(await readFile(new URL(`../../supabase/test-fixtures/${file}`,import.meta.url),'utf8'))
 }
 for(const file of ['202610180001_operational_foundation.sql','202610180002_operational_pilot.sql']) await db.exec(await readFile(new URL(`../../supabase/migrations/${file}`,import.meta.url),'utf8'))
 for(const id of [op,other,analyst]) await db.query('insert into auth.users values($1,$2);',[id,'initial-password-hash-test'])
 for(const id of [op,other,analyst]) await db.query('insert into auth.sessions values($1,$2)',[session(id),id])
 await db.exec(`insert into pcif_ops.memberships(user_id,team_id,role,environment,must_change_password) values
 ('${op}','GAR 23','team','pilot',true),
 ('${other}','GAR 01','team','pilot',false),('${analyst}',null,'analyst','pilot',false);
 insert into public.pcif_comment_members(user_id) values('${analyst}');`)
},60000)
afterAll(async()=>{await db.close()})
it('migrações preservam cadastro regional e os 33 itens oficiais',async()=>{
 await db.exec('reset role');const result=await db.query<any>('select * from pcif_ops.teams order by id');expect(result.rows).toHaveLength(31)
 for(const row of result.rows)expect({state:row.state,region:row.region}).toEqual(teamRegion(row.id))
 expect(result.rows.map(r=>r.id).sort()).toEqual([...teams].sort())
 const items=await db.query<any>('select * from pcif_ops.checklist_items order by id');expect(items.rows.map(r=>r.label)).toEqual([...vehicleItems,...cargoItems.map(([label])=>label)])
})
it('senha inicial bloqueia envio e troca real libera; anonimato é recusado',async()=>{
 const result=await as(op,'select public.pcif_ops_profile() profile');expect((result.rows[0] as any).profile.mustChangePassword).toBe(true)
 await expect(submit('activation',activation,0)).rejects.toThrow('Acesso negado')
 await db.exec(`reset role;update auth.users set encrypted_password='rotated-hash-test' where id='${op}';`)
 await expect(submit('activation',activation,0)).rejects.toThrow('Acesso negado')
 await expect(as(op,'select public.pcif_ops_complete_password_change($1::uuid)',[op])).rejects.toThrow('permission denied')
 await db.exec(`reset role;set role service_role;select public.pcif_ops_complete_password_change('${op}');reset role;set role anon;`)
 await expect(db.query('select public.pcif_ops_snapshot()')).rejects.toThrow(/permission denied/)
})
it('valida campos obrigatórios, registra ativação com identidade e tempo do servidor',async()=>{
 await expect(submit('activation',{fields:{},notes:''},0)).rejects.toThrow('Ativação incompleta')
 const result=await submit('activation',{...activation,team:'GAR 01',created_at:'1999-01-01'},0)
 expect(result.snapshot.profile).toMatchObject({team:'GAR 23',state:'Minas Gerais',environment:'pilot',mustChangePassword:false})
 expect(result.snapshot.status).toBe('Ativa');expect(result.snapshot.revision).toBe(1)
 expect(result.snapshot.reports[0]).toMatchObject({team_id:'GAR 23',author_id:op,environment:'pilot'})
 expect(result.snapshot.reports[0].created_at).not.toContain('1999')
})
it('repetir request_id é idempotente e payload diferente não pode reutilizá-lo',async()=>{
 const id=uuid(),payload={fields:{},notes:'Entrar na manutenção'}
 const first=await submit('maintenance_enter',payload,1,id)
 const second=await submit('maintenance_enter',payload,1,id)
 expect(second.reportId).toBe(first.reportId);expect(second.snapshot.revision).toBe(2)
 await expect(submit('maintenance_enter',{fields:{},notes:'alterado'},1,id)).rejects.toThrow('Identificador já utilizado')
})
it('valida transições, revisão concorrente e restaura estado sem reparar os dados',async()=>{
 await expect(submit('maintenance_enter',{fields:{},notes:''},2)).rejects.toThrow('já está')
 await expect(submit('activation',activation,2)).rejects.toThrow('Finalize a manutenção')
 await expect(submit('maintenance_exit',{fields:{},notes:''},1)).rejects.toThrow('Estado alterado')
 const result=await submit('maintenance_exit',{fields:{},notes:''},2);expect(result.snapshot.status).toBe('Ativa');expect(result.snapshot.revision).toBe(3)
 expect(result.snapshot.reports.find((r:any)=>r.kind==='maintenance_enter')).toMatchObject({status_before:'Ativa',status_after:'Em manutenção'})
 expect(result.snapshot.reports.find((r:any)=>r.kind==='maintenance_exit')).toMatchObject({status_before:'Em manutenção',status_after:'Ativa'})
 expect(result.snapshot.reports.find((r:any)=>r.kind==='activation').payload.fields['condition.0']).toBe('Inoperante')
})
it('exige 33 avaliações, quantidade e descrição de não conformidade; preserva ativação',async()=>{
 await expect(submit('checklist',{fields:{},notes:''},3)).rejects.toThrow('Checklist incompleto')
 await expect(submit('checklist',{...checklist,fields:{...checklist.fields,'cargo.0.quantity':'-1'}},3)).rejects.toThrow('Checklist incompleto')
 await expect(submit('checklist',{...checklist,fields:{...checklist.fields,'vehicle.99.answer':'Conforme'}},3)).rejects.toThrow('item desconhecido')
 const invalid={...checklist,fields:{...checklist.fields,'vehicle.0.answer':'Não conforme'}}
 await expect(submit('checklist',invalid,3)).rejects.toThrow('Checklist incompleto')
 const result=await submit('checklist',{...invalid,fields:{...invalid.fields,'vehicle.0.problem':'Problema fictício'}},3)
 expect(result.snapshot.status).toBe('Ativa');expect(result.snapshot.reports.filter((r:any)=>r.kind==='activation')).toHaveLength(1)
 await db.exec('reset role');const answers=await db.query<{report_id:string;field_key:string;answer:string;problem:string|null;quantity:number|null}>(`select a.report_id,i.field_key,a.answer,a.problem,a.quantity from pcif_ops.checklist_answers a join pcif_ops.checklist_items i on i.id=a.item_id`);expect(answers.rows).toHaveLength(33)
 const reference=latestChecklist(result.snapshot)
 expect(reference?.id).toBe(result.reportId)
 for(const row of answers.rows){
  expect(row.report_id).toBe(reference?.id)
  expect(reference?.fields[row.field_key+'.answer']).toBe(row.answer)
  if(row.problem)expect(reference?.fields[row.field_key+'.problem']).toBe(row.problem)
  if(row.quantity!==null)expect(reference?.fields[row.field_key+'.quantity']).toBe(String(row.quantity))
 }
 expect(Object.keys(reference!.fields).filter(k=>k.endsWith('.answer'))).toHaveLength(33)
})
it('RLS isola equipe, ambiente e autoriza analista sem alterar comentários',async()=>{
 const hidden=await as(other,'select * from pcif_ops.reports');expect(hidden.rows).toHaveLength(0)
 expect((await as(other,'select * from pcif_ops.checklist_answers')).rows).toHaveLength(0)
 expect((await as(other,'select * from pcif_ops.audit_events')).rows).toHaveLength(0)
 await expect(as(other,'update pcif_ops.memberships set must_change_password=false')).rejects.toThrow('permission denied')
 await expect(as(other,'select public.pcif_ops_panel_snapshot()')).rejects.toThrow('Analista não autorizado')
 const panel=await as(analyst,'select public.pcif_ops_panel_snapshot() snapshot');expect((panel.rows[0] as any).snapshot.reports).toHaveLength(4)
 await expect(as(analyst,'select public.pcif_ops_submit($1::uuid,$2,$3::jsonb,0)',[uuid(),'maintenance_enter',JSON.stringify({fields:{},notes:''})])).rejects.toThrow('Acesso negado')
 expect((await as(analyst,'select public.pcif_has_access() allowed')).rows[0]).toEqual({allowed:true})
 await as(analyst,"insert into public.pcif_comments(analyst_name,body) values('Analista fictício','Comentário preservado')")
 await db.exec(`reset role;update pcif_ops.memberships set environment='production' where user_id='${other}'`)
 expect((await as(other,'select * from pcif_ops.reports')).rows).toHaveLength(0)
})
it('desativação preserva histórico, é OFF e eventos não permitem update/delete ou insert direto',async()=>{
 const result=await submit('deactivation',{fields:{detail:'Fim da operação'},notes:''},4);expect(result.snapshot.status).toBe('OFF');expect(result.snapshot.reports).toHaveLength(5)
 await expect(submit('deactivation',{fields:{detail:'Fim da operação'},notes:''},5)).rejects.toThrow('já está OFF')
 if(process.env.PCIF_PILOT_SNAPSHOT_OUTPUT){const panel=await as(analyst,'select public.pcif_ops_panel_snapshot() snapshot');await writeFile(process.env.PCIF_PILOT_SNAPSHOT_OUTPUT,JSON.stringify((panel.rows[0] as any).snapshot))}
 await expect(as(op,"update pcif_ops.reports set payload='{}'")).rejects.toThrow('permission denied')
 await expect(as(op,'delete from pcif_ops.reports')).rejects.toThrow('permission denied')
 await expect(as(op,"insert into pcif_ops.reports(team_id,author_id,kind,payload,request_id) values('GAR 01',$1,'activation','{}',$2)",[op,uuid()])).rejects.toThrow('permission denied')
})
it('sessão revogada e membership inativa perdem leitura e escrita',async()=>{
 await db.exec(`reset role;delete from auth.sessions where user_id='${op}'`)
 expect((await as(op,'select * from pcif_ops.reports')).rows).toHaveLength(0)
 await expect(submit('maintenance_enter',{fields:{},notes:''},5)).rejects.toThrow('Acesso negado')
 await db.exec(`reset role;update pcif_ops.memberships set active=false where user_id='${analyst}'`)
 await expect(as(analyst,'select public.pcif_ops_panel_snapshot()')).rejects.toThrow('Analista não autorizado')
})
