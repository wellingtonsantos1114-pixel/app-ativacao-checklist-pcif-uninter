import {randomBytes,randomUUID,pbkdf2Sync,createCipheriv,createDecipheriv,createHash} from 'node:crypto'
import {readFile,open,rename,unlink,realpath,lstat} from 'node:fs/promises'
import {dirname,resolve,relative,isAbsolute,sep} from 'node:path'
import {fileURLToPath} from 'node:url'
import {target,root,invariantsSql} from '../homologation/sql.mjs'
export const teams=[...Array.from({length:23},(_,i)=>`GAR ${String(i+1).padStart(2,'0')}`),...Array.from({length:8},(_,i)=>`GAC ${String(i+1).padStart(2,'0')}`)]
export const emailFor=team=>`${team.toLowerCase().replace(' ','')}@pcif-operators.invalid`
const quoted=s=>`'${String(s).replaceAll("'","''")}'`
const fail=message=>{throw Error(message)}
export function seal(data,passphrase,salt=randomBytes(16)){
 const iv=randomBytes(12),key=pbkdf2Sync(passphrase,salt,310000,32,'sha256'),cipher=createCipheriv('aes-256-gcm',key,iv)
 const bytes=Buffer.concat([cipher.update(JSON.stringify(data),'utf8'),cipher.final(),cipher.getAuthTag()])
 return {format:'pcif-vault-v1',iterations:310000,salt:salt.toString('base64'),iv:iv.toString('base64'),ciphertext:bytes.toString('base64')}
}
export function unseal(envelope,passphrase){
 try{
  if(envelope.format!=='pcif-vault-v1'||envelope.iterations!==310000)fail('format')
  const salt=Buffer.from(envelope.salt,'base64'),iv=Buffer.from(envelope.iv,'base64'),bytes=Buffer.from(envelope.ciphertext,'base64')
  const decipher=createDecipheriv('aes-256-gcm',pbkdf2Sync(passphrase,salt,310000,32,'sha256'),iv)
  decipher.setAuthTag(bytes.subarray(-16));return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(0,-16)),decipher.final()]).toString('utf8'))
 }catch{fail('Cofre inválido ou frase de proteção incorreta. Nenhuma senha foi impressa.')}
}
export function classify(users,memberships,vault){
 const result=[]
 for(const team of teams){
  const email=emailFor(team),matches=users.filter(u=>u.email?.toLowerCase()===email),links=memberships.filter(m=>m.team_id===team)
  if(matches.length>1||links.length>1)fail(`Conflito: identidade duplicada em ${team}.`)
  const user=matches[0],entry=vault?.entries[team]
  if(!user){if(links.length||entry?.id)fail(`Conflito: conta ausente com vínculo prévio em ${team}.`);result.push({team,email,action:'create'});continue}
  if(!user.email_confirmed_at||user.is_anonymous)fail(`Conflito: conta não confirmada em ${team}.`)
  const mine=memberships.filter(m=>m.user_id===user.id)
  if(mine.length){
   const m=mine[0]
   if(mine.length!==1||links.length!==1||links[0].user_id!==user.id||m.team_id!==team||m.role!=='team'||m.environment!=='pilot'||m.active!==true||m.must_change_password!==false)fail(`Conflito: perfil incompatível em ${team}; nada será substituído.`)
   result.push({team,email,id:user.id,action:'preserve'});continue
  }
  if(links.length||!entry||entry.email!==email||entry.id&&entry.id!==user.id||user.app_metadata?.pcif_provision_run!==vault.run_id||user.app_metadata?.pcif_team!==team)fail(`Conflito: conta existente sem vínculo reconhecido em ${team}.`)
  result.push({team,email,id:user.id,action:'resume'})
 }
 return result
}
export const membershipSql=(team,id)=>`begin; do $link$ begin
 if not exists(select 1 from auth.users where id=${quoted(id)}::uuid and email=${quoted(emailFor(team))} and email_confirmed_at is not null) then raise exception 'Identidade incompatível';end if;
 if exists(select 1 from pcif_ops.memberships where user_id=${quoted(id)}::uuid or team_id=${quoted(team)}) then raise exception 'Vínculo concorrente: inspecione antes de retomar';end if;
 insert into pcif_ops.memberships(user_id,team_id,role,environment,active,must_change_password) values(${quoted(id)}::uuid,${quoted(team)},'team','pilot',true,false);
 end $link$;commit;`
export async function run({apply=false,approval,token=process.env.SUPABASE_ACCESS_TOKEN,adminKey=process.env.PCIF_PROVISION_ADMIN_KEY,passphrase=process.env.PCIF_VAULT_PASSPHRASE,vaultPath='/tmp/pcif-admin/teams.vault.json',fetcher=fetch}={}){
 if(!token||!adminKey)fail('Acesso ausente. Configure os segredos administrativos fora do código e da conversa.')
 if(!adminKey.startsWith('sb_secret_')){
  try{if(JSON.parse(Buffer.from(adminKey.split('.')[1],'base64url')).role!=='service_role')fail('key')}catch{fail('Chave administrativa inválida. Não use anon/publishable.')}
 }
 const path=resolve(vaultPath),parent=await realpath(dirname(path)),actual=resolve(parent,path.split('/').at(-1)),rel=relative(root,actual)
 if(!isAbsolute(vaultPath)||!(rel==='..'||rel.startsWith('..'+sep)||isAbsolute(rel)))fail('O cofre deve ficar fora do repositório, em diretório privado do administrador.')
 const parentInfo=await lstat(parent)
 if((parentInfo.mode&0o077)!==0||parentInfo.uid!==process.getuid?.())fail('Use um diretório privado do administrador (permissão 0700).')
 let vault
 try{const info=await lstat(actual);if(!info.isFile()||(info.mode&0o077)!==0||info.uid!==process.getuid?.())fail('Permissões do cofre incompatíveis.');const envelope=await readFile(actual,'utf8');if(!passphrase)fail('Frase do cofre ausente.');vault=unseal(JSON.parse(envelope),passphrase)}catch(e){if(e.code!=='ENOENT')throw Error('Não foi possível abrir o cofre com segurança. Confira o arquivo e a frase de proteção.')}
 if(vault&&(vault.project_ref!==target.project_ref||!vault.run_id||!vault.entries))fail('Cofre pertence a outro destino ou formato.')
 async function request(origin,path,{method='GET',data,management=false}={}){
  let response
  try{response=await fetcher(origin+path,{method,headers:management?{Authorization:`Bearer ${token}`,'Content-Type':'application/json'}:{apikey:adminKey,...(!adminKey.startsWith('sb_secret_')?{Authorization:`Bearer ${adminKey}`} :{}),'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data),signal:AbortSignal.timeout(30000),redirect:'error'})}catch{fail('Conexão interrompida; estado pode ser parcial. Preserve o cofre e execute novo plano, sem repetir cegamente.')}
  if(!response.ok)fail(`Etapa recusada (HTTP ${response.status}). Estado pode ser parcial; preserve o cofre. Resposta omitida para proteger credenciais.`)
  try{return await response.json()}catch{fail('Resposta administrativa inválida; inspecione o estado antes de retomar.')}
 }
 const mgmt=(path,options={})=>request('https://api.supabase.com',path,{...options,management:true})
 const sql=(query,readOnly=true)=>mgmt(`/v1/projects/${target.project_ref}/database/query`,{method:'POST',data:{query,read_only:readOnly}})
 const project=await mgmt(`/v1/projects/${target.project_ref}`)
 if((project.ref??project.id)!==target.project_ref||project.name!==target.project_name||project.status!=='ACTIVE_HEALTHY')fail('Destino recusado: ref, nome ou estado incompatível.')
 const orgs=await mgmt('/v1/organizations')
 if(!Array.isArray(orgs)||!orgs.some(o=>(o.slug??o.id)===(project.organization_slug??project.organization_id)&&o.name===target.organization_name))fail('Organização incompatível.')
 await sql(invariantsSql)
 const roster=await sql('select id,state,region from pcif_ops.teams order by id')
 if(!Array.isArray(roster)||roster.length!==31||teams.some(t=>!roster.some(r=>r.id===t)))fail('Cadastro oficial das 31 equipes incompatível.')
 const getMembers=()=>sql('select user_id,team_id,role,environment,active,must_change_password from pcif_ops.memberships order by user_id')
 const auth=(path,options={})=>request(`https://${target.project_ref}.supabase.co`,path,options)
 async function getUsers(){
  const all=[]
  for(let page=1;page<=100;page++){
   const data=await auth(`/auth/v1/admin/users?page=${page}&per_page=1000`)
   if(!Array.isArray(data.users))fail('Listagem administrativa inválida.')
   all.push(...data.users.map(({id,email,email_confirmed_at,is_anonymous,app_metadata})=>({id,email,email_confirmed_at,is_anonymous,app_metadata})))
   if(data.users.length<1000)return all
  }
  fail('Listagem excedeu o limite de segurança; não foi provisionado.')
 }
 const users=await getUsers(),members=await getMembers()
 if(!Array.isArray(members))fail('Listagem de perfis inválida.')
 const actions=classify(users,members,vault)
 const fingerprint=createHash('sha256').update(JSON.stringify({target,roster,actions,members})).digest('hex')
 const summary={target:target.project_ref,mode:apply?'apply':'plan',create:actions.filter(a=>a.action==='create').length,resume:actions.filter(a=>a.action==='resume').length,preserve:actions.filter(a=>a.action==='preserve').length,must_change_password:false,approval:fingerprint,remote_writes:false}
 if(!apply)return summary
 if(approval!==fingerprint)fail('Aprovação ausente ou plano mudou. Revise um novo --plan e informe seu hash com --approve.')
 if(!passphrase||passphrase.length<20)fail('Cadastre PCIF_VAULT_PASSPHRASE exclusiva, com no mínimo 20 caracteres, como segredo administrativo.')
 const lock=await open(actual+'.lock','wx',0o600).catch(()=>fail('Cofre em uso ou lock pendente. Não execute provisionamentos simultâneos.'))
 let temp
 async function save(){
  temp=actual+'.'+randomUUID()+'.tmp'
  const file=await open(temp,'wx',0o600)
  try{await file.writeFile(JSON.stringify(seal(vault,passphrase)));await file.sync()}finally{await file.close()}
  await rename(temp,actual);temp=undefined
 }
 try{
  vault??={project_ref:target.project_ref,run_id:randomUUID(),entries:{}}
  for(const action of actions){
   if(action.action==='preserve')continue
   const {team,email}=action
   if(!vault.entries[team]){
    let password
    do{password='Aa1!'+randomBytes(24).toString('base64url')}while(Object.values(vault.entries).some(e=>e.password===password))
    vault.entries[team]={email,password,status:'intent'}
   }
   const entry=vault.entries[team]
   await save() // Grava senha CIFRADA antes de qualquer criação Auth, inclusive timeout ambíguo.
   let id=action.id
   if(!id){
    const user=await auth('/auth/v1/admin/users',{method:'POST',data:{email,password:entry.password,email_confirm:true,app_metadata:{pcif_provision_run:vault.run_id,pcif_team:team}}})
    if(!user.id||user.email?.toLowerCase()!==email||!user.email_confirmed_at)fail('Criação não confirmada. Preserve o cofre e execute novo plano.')
    id=user.id
   }
   entry.id=id;entry.status='auth-created';await save()
   await sql(membershipSql(team,id),false)
   entry.status='linked';await save()
  }
  const final=classify(await getUsers(),await getMembers(),vault)
  if(final.some(a=>a.action!=='preserve'))fail('Validação incompleta. Preserve o cofre e inspecione o estado.')
  await sql(invariantsSql)
  return {...summary,status:'validated',linked:31,remote_writes:summary.create+summary.resume>0,vault:actual}
 }finally{await lock.close();await unlink(actual+'.lock');if(temp)await unlink(temp).catch(()=>{})}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2);let apply=false,approval,vaultPath
 try{
  for(let i=0;i<args.length;i++){
   if(args[i]==='--apply')apply=true
   else if(args[i]==='--plan')continue
   else if(args[i]==='--approve'&&args[i+1])approval=args[++i]
   else if(args[i]==='--vault'&&args[i+1])vaultPath=args[++i]
   else fail('Argumentos inválidos. Use --plan ou --apply --approve HASH e --vault /diretorio-privado/pcif-teams.vault.json.')
  }
  console.log(JSON.stringify(await run({apply,approval,vaultPath}),null,2))
 }catch(error){console.error(error.message?.startsWith('ENO')?'Arquivo/diretório administrativo indisponível.':error.message);process.exitCode=1}
}
