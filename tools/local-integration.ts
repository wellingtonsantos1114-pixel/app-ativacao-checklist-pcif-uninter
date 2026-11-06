/** Piloto local: PostgreSQL real em memória; Auth e transporte HTTPS simulados.
 * Não usa rede, contas, banco ou segredos reais. Requer o segundo checkout.
 */
import {PGlite} from '@electric-sql/pglite'
import {createClient} from '@supabase/supabase-js'
import {readFile,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import assert from 'node:assert/strict'
import login from '../netlify/functions/operator-login'
import change from '../netlify/functions/operator-password'
import {PilotWriter,readProfile,readSnapshot,type PilotSnapshot} from '../src/pilot/service'
import {vehicleItems,cargoItems} from '../src/lib/checklist'
const root=process.cwd(),panel=process.env.PCIF_PANEL_ROOT
if(!panel)throw Error('Informe PCIF_PANEL_ROOT com o caminho do checkout do painel, na branch de integração.')
const {default:panelOperations}=await import(resolve(panel,'netlify/functions/operations.ts'))
const db=new PGlite(),operator='00000000-0000-4000-8000-000000000001',analyst='00000000-0000-4000-8000-000000000002'
const fakeUrl='https://pcif-local-test.supabase.co'
Object.assign(process.env,{SUPABASE_URL:fakeUrl,SUPABASE_PUBLISHABLE_KEY:'sb_publishable_local_test_only',PCIF_PILOT_ENABLED:'true',PCIF_OPERATOR_EMAIL_DOMAIN:'pcif-operators.invalid',PCIF_AUTH_EMAIL:'analyst@example.invalid',PCIF_DATA_SOURCE:'PCIF_APP',PCIF_PASSWORD_ADMIN_KEY:'sb_secret_local_test_only'})
const users=new Map([[operator,{id:operator,email:'gar03@pcif-operators.invalid',password:'Initial-Test-Only-2026!'}],[analyst,{id:analyst,email:'analyst@example.invalid',password:'Analyst-Test-Only-2026!'}]])
const tokens=new Map<string,{id:string;session:string}>()
let loseNextSubmit=false
async function query(token:string,sql:string,params:unknown[]=[]){
 const identity=tokens.get(token);if(!identity)throw Error('Token de teste desconhecido')
 await db.exec(`reset role;select set_config('request.jwt.claim.sub','${identity.id}',false);select set_config('request.jwt.claims','{"session_id":"${identity.session}"}',false);set role authenticated`)
 return db.query<any>(sql,params)
}
async function session(id:string){
 const sid=crypto.randomUUID();await db.exec('reset role');await db.query('insert into auth.sessions values($1,$2)',[sid,id])
 const user=users.get(id)!,now=Math.floor(Date.now()/1000)
 const access=[{alg:'HS256',typ:'JWT'},{sub:id,aud:'authenticated',role:'authenticated',email:user.email,session_id:sid,iat:now,exp:now+3600}].map(v=>Buffer.from(JSON.stringify(v)).toString('base64url')).join('.')+'.local-test-signature'
 tokens.set(access,{id,session:sid})
 return {access_token:access,refresh_token:'local-refresh-'+sid,token_type:'bearer',expires_in:3600,user:{id,email:user.email,aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{}}}
}
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}})
const originalFetch=globalThis.fetch
// As únicas URLs aceitas são as de teste. Nenhum pedido pode alcançar Supabase externo.
globalThis.fetch=async(input:RequestInfo|URL,init?:RequestInit)=>{
 const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url)
 assert.equal(url.origin,fakeUrl,'Rede externa bloqueada pelo teste')
 const headers=new Headers(init?.headers),token=(headers.get('Authorization')||'').replace(/^Bearer /,'')
 const body=typeof init?.body==='string'?JSON.parse(init.body):{}
 const identity=tokens.get(token),user=identity?users.get(identity.id):undefined
 if(url.pathname==='/auth/v1/token'){
  const found=[...users.values()].find(u=>u.email===body.email&&u.password===body.password)
  return found?json(await session(found.id)):json({error:'Invalid test credentials'},401)
 }
 if(url.pathname==='/auth/v1/user'){
  if(!user||!identity)return json({},401)
  await db.exec('reset role');if(!(await db.query('select 1 from auth.sessions where id=$1',[identity.session])).rows.length)return json({},401)
  if(init?.method==='PUT'){user.password=body.password;await db.query('update auth.users set encrypted_password=$1 where id=$2',['changed-test-hash',user.id])}
  return json({id:user.id,email:user.email,aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{}})
 }
 if(url.pathname==='/auth/v1/logout'){
  if(identity){await db.exec('reset role');await db.query(url.searchParams.get('scope')==='global'?'delete from auth.sessions where user_id=$1':'delete from auth.sessions where id=$1',[url.searchParams.get('scope')==='global'?identity.id:identity.session])}
  return json({})
 }
 if(url.pathname==='/rest/v1/rpc/pcif_ops_complete_password_change'){assert.equal(headers.get('apikey'),process.env.PCIF_PASSWORD_ADMIN_KEY);await db.exec('reset role;set role service_role');try{return json((await db.query<any>('select public.pcif_ops_complete_password_change($1::uuid) result',[body.p_user_id])).rows[0].result)}finally{await db.exec('reset role')}}
 const name=url.pathname.replace('/rest/v1/rpc/','')
 const calls:Record<string,[string,unknown[]]>={
  pcif_has_access:['select public.pcif_has_access() result',[]],pcif_ops_profile:['select public.pcif_ops_profile() result',[]],
  pcif_ops_snapshot:['select public.pcif_ops_snapshot() result',[]],pcif_ops_panel_snapshot:['select public.pcif_ops_panel_snapshot() result',[]],
  pcif_ops_submit:['select public.pcif_ops_submit($1::uuid,$2,$3::jsonb,$4::bigint) result',[body.p_request_id,body.p_kind,JSON.stringify(body.p_payload),body.p_expected_revision]],
 }
 assert(calls[name],`Rota não simulada: ${url.pathname}`)
 try{const [sql,params]=calls[name];const result=(await query(token,sql,params)).rows[0].result
  if(name==='pcif_ops_submit'&&loseNextSubmit){loseNextSubmit=false;throw Error('simulated-response-loss')}
  return json(result)
 }catch(e){if((e as Error).message==='simulated-response-loss')throw e;return json({message:(e as Error).message,code:(e as {code?:string}).code},400)}
}
function request(path:string,body?:unknown,token?:string){return new Request('https://pilot.example.invalid/.netlify/functions/'+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body)})}
try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,encrypted_password text);create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id));create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create function auth.jwt() returns jsonb language sql stable as $$select nullif(current_setting('request.jwt.claims',true),'')::jsonb$$;grant usage on schema auth to authenticated;grant execute on function auth.uid(),auth.jwt() to authenticated;`)
 for(const file of ['202610140001_pcif_comments.sql','202610170001_pcif_session_access.sql'])await db.exec(await readFile(resolve(root,'supabase/test-fixtures',file),'utf8'))
 for(const file of ['202610180001_operational_foundation.sql','202610180002_operational_pilot.sql'])await db.exec(await readFile(resolve(root,'supabase/migrations',file),'utf8'))
 for(const id of users.keys())await db.query('insert into auth.users values($1,$2)',[id,'initial-test-hash'])
 await db.exec(`insert into pcif_ops.memberships(user_id,team_id,role,must_change_password) values('${operator}','GAR 03','team',false),('${analyst}',null,'analyst',false);insert into public.pcif_comment_members(user_id) values('${analyst}')`)
 let response=await login(request('operator-login',{team:'GAR 03',password:users.get(operator)!.password}));assert.equal(response.status,200);let tokensResponse=await response.json()
 const client=createClient(fakeUrl,'sb_publishable_local_test_only',{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}})
 await client.auth.setSession(tokensResponse);assert.equal((await readProfile(client)).mustChangePassword,false)
 await readSnapshot(client);console.log('PASS GAR 03: login imediato sem troca obrigatória')
 // Troca voluntária: snapshot já estava acessível antes desta chamada.
 const newPassword='Rotated-Test-Only-2026!'
 response=await change(request('operator-password',{currentPassword:users.get(operator)!.password,newPassword,confirmation:newPassword},tokensResponse.access_token));assert.equal(response.status,200)
 response=await login(request('operator-login',{team:'GAR 03',password:newPassword}));assert.equal(response.status,200);tokensResponse=await response.json();await client.auth.setSession(tokensResponse)
 let current:PilotSnapshot=await readSnapshot(client);assert.equal(current.profile.mustChangePassword,false)
 const writer=new PilotWriter(client,()=>current,value=>{current=value})
 const activation={shift:'Diurno','person.0':'Pessoa Fictícia Alfa','person.1':'Pessoa Fictícia Beta',vehicleType:'Oficial',model:'L200',plate:'TEST123',project:'Piloto',city:'Município fictício','condition.0':'Inoperante','condition.1':'Operante','condition.2':'Operante'}
 loseNextSubmit=true;await assert.rejects(()=>writer.submit('ATIVAÇÃO',activation,'Piloto fictício'));assert.equal(current.reports.length,0)
 await writer.submit('ATIVAÇÃO',activation,'Piloto fictício');assert.equal(current.reports.length,1);assert.equal(current.status,'Ativa');console.log('PASS ativação + resposta perdida + retry sem duplicação')
 const analystSession=await session(analyst)
 async function panelRead(){const r=await panelOperations(request('operations',undefined,analystSession.access_token));assert.equal(r.status,200);return r.json()}
 let view=await panelRead();assert.equal(view.teams.find((t:any)=>t.id==='GAR 03').state,'SP');assert.equal(view.checklists.length,1)
 const fields=Object.fromEntries([...vehicleItems.flatMap((_,i)=>[[`vehicle.${i}.answer`,'Conforme']]),...cargoItems.flatMap((_,i)=>[[`cargo.${i}.answer`,'Conforme'],[`cargo.${i}.quantity`,'1']])])
 fields['vehicle.0.answer']='Não conforme';fields['vehicle.0.problem']='Problema fictício'
 await writer.submit('CHECKLIST',fields,'Inspeção fictícia');view=await panelRead();assert.equal(view.checklists.length,1);assert.equal(view.app.reports.filter((r:any)=>r.kind==='checklist').length,1)
 console.log('PASS checklist independente + 33 respostas + leitura pelo handler real do painel')
 // Reutilizar respostas não deve sobrescrever o checklist anterior.
 const firstChecklist=current.reports.find(r=>r.kind==='checklist')!
 await writer.submit('CHECKLIST',{...fields},'Segunda conferência fictícia')
 const checklists=current.reports.filter(r=>r.kind==='checklist')
 assert.equal(checklists.length,2);assert.notEqual(checklists[0].id,checklists[1].id)
 assert.deepEqual(current.reports.find(r=>r.id===firstChecklist.id),firstChecklist)
 console.log('PASS reutilização: novo checklist preserva o anterior e recebe outro ID')

 await writer.submit('MANUTENÇÃO',{},'Iniciar');assert.equal(current.status,'Em manutenção');await writer.submit('MANUTENÇÃO',{},'Finalizar');assert.equal(current.status,'Ativa')
 await writer.submit('DESATIVAÇÃO',{detail:'Fim da operação'},'Fim do piloto');assert.equal(current.status,'OFF')
 view=await panelRead();assert.equal(view.app.states.find((s:any)=>s.team_id==='GAR 03').status,'OFF');assert.equal(view.app.reports.length,6)
 console.log('PASS manutenção + restauração + OFF + recuperação completa do histórico no painel')
 await db.exec('reset role');assert.equal((await db.query('select * from pcif_ops.checklist_answers')).rows.length,66)
 const denied=await panelOperations(request('operations',undefined,tokensResponse.access_token));assert.equal(denied.status,401)
 await client.auth.signOut({scope:'local'});console.log('PASS operador sem acesso de analista + encerramento de sessão')
 await writeFile('/tmp/pcif-local-integration-result.json',JSON.stringify({status:'passed',reports:6,answers:66,auth:'simulated',database:'PGlite PostgreSQL',hosted:false}))
 console.log('PILOTO LOCAL APROVADO. Auth/transporte simulados; não valida Supabase hospedado ou dispositivos físicos.')
}finally{globalThis.fetch=originalFetch;await db.close()}
