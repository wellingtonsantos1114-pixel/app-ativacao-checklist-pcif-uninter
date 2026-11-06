// @vitest-environment node
import {it,expect} from 'vitest'
import {mkdtemp,readFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {webcrypto} from 'node:crypto'
import {database} from '../homologation/reference.mjs'
import {run,teams,emailFor,classify,seal,unseal} from './teams.mjs'
const passphrase='Local fixture only — vault passphrase 2026'
const adminKey='sb_secret_fixture_only',token='management_fixture_only'
const userFor=team=>({id:'00000000-0000-4000-8000-'+String(teams.indexOf(team)+1).padStart(12,'0'),email:emailFor(team),email_confirmed_at:'2026-10-18T00:00:00Z',app_metadata:{}})
const memberFor=(team,user)=>({user_id:user.id,team_id:team,role:'team',environment:'pilot',active:true,must_change_password:false})
it('lista 31 identidades únicas no mapeamento existente, incluindo GAR 03',()=>{
 expect(teams.length).toBe(31);expect(new Set(teams.map(emailFor)).size).toBe(31);expect(emailFor('GAR 03')).toBe('gar03@pcif-operators.invalid')
})
it('preserva conta correta e recusa flag antiga, equipe cruzada, produção e usuário sem vínculo',()=>{
 const u=userFor('GAR 03'),m=memberFor('GAR 03',u)
 expect(classify([u],[m]).find(a=>a.team==='GAR 03').action).toBe('preserve')
 for(const patch of [{must_change_password:true},{team_id:'GAR 04'},{environment:'production'},{active:false}])expect(()=>classify([u],[{...m,...patch}])).toThrow('Conflito')
 expect(()=>classify([u],[])).toThrow('Conflito')
 expect(()=>classify([u],[m,m])).toThrow('duplicada')
})
it('cofre autenticado é compatível com Web Crypto do navegador e não contém senha em claro',async()=>{
 const data={project_ref:'exemploprojetoref000',entries:{fixture:{password:'Synthetic-local-fixture-only'}}},env=seal(data,passphrase)
 expect(JSON.stringify(env).includes(data.entries.fixture.password)).toBe(false)
 expect(unseal(env,passphrase)).toEqual(data)
 expect(()=>unseal(env,'incorrect')).toThrow('Cofre inválido')
 const raw=await webcrypto.subtle.importKey('raw',Buffer.from(passphrase),'PBKDF2',false,['deriveKey'])
 const key=await webcrypto.subtle.deriveKey({name:'PBKDF2',salt:Buffer.from(env.salt,'base64'),iterations:310000,hash:'SHA-256'},raw,{name:'AES-GCM',length:256},false,['decrypt'])
 const plain=await webcrypto.subtle.decrypt({name:'AES-GCM',iv:Buffer.from(env.iv,'base64')},key,Buffer.from(env.ciphertext,'base64'))
 expect(JSON.parse(Buffer.from(plain).toString())).toEqual(data)
})
it('sem credenciais não faz chamadas HTTP',async()=>{
 let count=0
 await expect(run({token:'',adminKey:'',fetcher:()=>{count++}})).rejects.toThrow('Acesso ausente');expect(count).toBe(0)
})
it('destino incorreto é recusado antes de Auth ou SQL',async()=>{
 const calls=[],dir=await mkdtemp(join(tmpdir(),'pcif-destination-'))
 try{await expect(run({token,adminKey,vaultPath:join(dir,'teams.vault.json'),fetcher:async(url)=>{calls.push(url);return Response.json({ref:'production',name:'pcif-homologacao',status:'ACTIVE_HEALTHY'})}})).rejects.toThrow('Destino recusado')
 expect(calls.length).toBe(1)}finally{await rm(dir,{recursive:true,force:true})}
})
it('aprovação, retomada após falha, 31 vínculos sem troca obrigatória, senhas cifradas e idempotência',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'pcif-teams-test-')),vaultPath=join(dir,'teams.vault.json'),db=await database(),users=[]
 let mutations=0,failLink=false
 const fetcher=async(url,options)=>{
  const u=new URL(url),body=options.body?JSON.parse(options.body):undefined
  if(u.hostname==='api.supabase.com'){
   if(u.pathname.endsWith('/database/query')){
    if(body.query.startsWith('select '))return Response.json((await db.query(body.query)).rows)
    if(body.read_only===false){mutations++;if(failLink){failLink=false;throw Error('simulated interrupted link')}}
    await db.exec(body.query);return Response.json([])
   }
   if(u.pathname==='/v1/organizations')return Response.json([{slug:'pilot-org',name:'Painel de Ativação PCIF'}])
   return Response.json({ref:'exemploprojetoref000',name:'pcif-homologacao',status:'ACTIVE_HEALTHY',organization_slug:'pilot-org'})
  }
  expect(u.hostname).toBe('exemploprojetoref000.supabase.co')
  expect(u.pathname).toBe('/auth/v1/admin/users')
  if(options.method==='GET')return Response.json({users})
  expect(options.method).toBe('POST');mutations++
  const team=body.app_metadata.pcif_team,user={...userFor(team),app_metadata:body.app_metadata}
  expect(body.email_confirm).toBe(true)
  await db.query('insert into auth.users(id,email,email_confirmed_at,encrypted_password) values($1,$2,now(),$3)',[user.id,user.email,'fixture-hash'])
  users.push(user);return Response.json(user)
 }
 const options={token,adminKey,passphrase,vaultPath,fetcher}
 try{
  await db.exec(await readFile(new URL('../../supabase/homologation/install.sql',import.meta.url),'utf8'))
  await db.exec('alter table auth.users add column email text unique;alter table auth.users add column email_confirmed_at timestamptz')
  const plan=await run(options);expect(plan.create).toBe(31);expect(mutations).toBe(0)
  await expect(run({...options,apply:true,approval:'wrong'})).rejects.toThrow('Aprovação');expect(mutations).toBe(0)
  failLink=true
  await expect(run({...options,apply:true,approval:plan.approval})).rejects.toThrow('Conexão interrompida')
  expect(users.length).toBe(1)
  const resumed=await run(options);expect(resumed.resume).toBe(1);expect(resumed.create).toBe(30)
  const result=await run({...options,apply:true,approval:resumed.approval});expect(result.linked).toBe(31)
  const members=(await db.query('select * from pcif_ops.memberships')).rows
  expect(members.length).toBe(31);expect(members.every(m=>!m.must_change_password&&m.environment==='pilot'&&m.active&&m.role==='team')).toBe(true)
  const raw=await readFile(vaultPath,'utf8'),vault=unseal(JSON.parse(raw),passphrase),entries=Object.values(vault.entries)
  expect(entries.length).toBe(31);expect(new Set(entries.map(e=>e.password)).size).toBe(31)
  expect(entries.every(e=>e.password.length>=32&&/[A-Z]/.test(e.password)&&/[a-z]/.test(e.password)&&/\d/.test(e.password)&&/[^\w\s]/.test(e.password))).toBe(true)
  expect(entries.every(e=>!raw.includes(e.password))).toBe(true)
  expect(entries.every(e=>!JSON.stringify(result).includes(e.password))).toBe(true)
  // GAR 03 opera imediatamente; GAR 04 não lê nem grava em seu nome.
  const gar03=userFor('GAR 03'),gar04=userFor('GAR 04')
  for(const u of [gar03,gar04])await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[u.id,u.id])
  async function as(u,sql,params=[]){
   await db.exec(`reset role;select set_config('request.jwt.claim.sub','${u.id}',false);select set_config('request.jwt.claims','{"session_id":"${u.id}"}',false);set role authenticated`)
   return db.query(sql,params)
  }
  const profile=(await as(gar03,'select public.pcif_ops_profile() profile')).rows[0].profile
  expect(profile.mustChangePassword).toBe(false);expect(profile.team).toBe('GAR 03')
  const payload={notes:'Ensaio local fictício',fields:{shift:'Diurno','person.0':'Pessoa Alfa','person.1':'Pessoa Beta',vehicleType:'Oficial',model:'L200',plate:'TEST123',project:'Piloto',city:'Fictícia','condition.0':'Operante','condition.1':'Operante','condition.2':'Operante'}}
  await as(gar03,'select public.pcif_ops_submit($1::uuid,$2,$3::jsonb,0)',['20000000-0000-4000-8000-000000000003','activation',JSON.stringify(payload)])
  expect((await as(gar03,'select team_id from pcif_ops.reports')).rows).toEqual([{team_id:'GAR 03'}])
  expect((await as(gar04,'select * from pcif_ops.reports')).rows.length).toBe(0)
  await expect(as(gar04,"update pcif_ops.reports set team_id='GAR 04'")).rejects.toThrow('permission denied')
  await db.exec('reset role')
  const before=mutations,again=await run(options);expect(again.preserve).toBe(31)
  await run({...options,apply:true,approval:again.approval});expect(mutations).toBe(before)
 }finally{await db.close();await rm(dir,{recursive:true,force:true})}
},90000)
