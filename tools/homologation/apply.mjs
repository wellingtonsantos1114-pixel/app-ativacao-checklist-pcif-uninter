import {readFile,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {isDeepStrictEqual} from 'node:util'
import {fileURLToPath} from 'node:url'
import {target,root,sources,buildSql,inspectSql,catalogSql} from './sql.mjs'
const API='https://api.supabase.com'
export async function run({apply=false,token=process.env.SUPABASE_ACCESS_TOKEN,fetcher=fetch,reportPath='/tmp/pcif-homologacao-report.json'}={}){
 const report={target,mode:apply?'apply':'plan',status:'blocked',steps:[],remote_changes:false}
 async function api(path,{query}={}){
  let response
  try{response=await fetcher(API+path,{method:query?'POST':'GET',headers:{Authorization:`Bearer ${token}`,...(query?{'Content-Type':'application/json'}:{})},body:query?JSON.stringify(query):undefined,signal:AbortSignal.timeout(45000),redirect:'error'})}
  catch{throw Error('Management API inacessível. Confira a autorização e a liberação de api.supabase.com; nenhuma tentativa de escrita será repetida automaticamente.')}
  if(!response.ok)throw Error(`Management API recusou a etapa (HTTP ${response.status}). Nenhuma resposta de erro ou credencial foi impressa.`)
  return response.json()
 }
 try{
  if(!token)throw Error('Acesso ausente: habilite o MCP oficial ou cadastre SUPABASE_ACCESS_TOKEN exclusivamente nas configurações seguras do ambiente. Não cole segredos na conversa.')
  const expected=JSON.parse(await readFile(resolve(root,'supabase/homologation/catalog.json'),'utf8'))
  const sql=await buildSql(expected),saved=await readFile(resolve(root,'supabase/homologation/install.sql'),'utf8')
  if(sql!==saved)throw Error('Pacote SQL desatualizado ou alterado. Regenere a referência local e revise o diff antes de aplicar.')
  const project=await api(`/v1/projects/${target.project_ref}`)
  if((project.ref??project.id)!==target.project_ref||project.name!==target.project_name)throw Error('Destino recusado: nome ou project_ref não corresponde a pcif-homologacao.')
  if(project.status!=='ACTIVE_HEALTHY')throw Error('Projeto ainda não está ACTIVE_HEALTHY. Nenhum SQL foi enviado.')
  const organizations=await api('/v1/organizations')
  if(!Array.isArray(organizations))throw Error('Não foi possível verificar a organização.')
  const org=organizations.find(o=>(o.slug??o.id)===(project.organization_slug??project.organization_id))
  if(!org||org.name!==target.organization_name)throw Error('Organização não corresponde a Painel de Ativação PCIF. Nenhum SQL foi enviado.')
  report.steps.push({stage:'destination',status:'verified',name:project.name,ref:target.project_ref,organization:org.name})
  const before=await api(`/v1/projects/${target.project_ref}/database/query`,{query:{query:inspectSql,read_only:true}})
  if(!Array.isArray(before)||before[0]?.inspection?.auth_ready!==true)throw Error('Dependências Supabase Auth indisponíveis ou resposta de inspeção inválida.')
  report.before=before[0].inspection
  report.steps.push({stage:'inspection',status:'read-only'})
  if(!apply){report.status='planned';return report}
  // Uma transação inclui as quatro etapas, checksums e validação. Não há retry automático.
  report.steps.push({stage:'transaction',status:'submitted'});report.remote_changes='submitted'
  const result=await api(`/v1/projects/${target.project_ref}/database/query`,{query:{query:sql,read_only:false}})
  report.result=result
  const after=await api(`/v1/projects/${target.project_ref}/database/query`,{query:{query:catalogSql,read_only:true}})
  if(!Array.isArray(after)||!isDeepStrictEqual(after[0]?.catalog,expected))throw Error('Validação pós-aplicação não confirmada. Consulte o relatório e inspecione o projeto; não repita operações cegamente.')
  report.remote_changes='confirmed';report.status='validated';report.steps.push({stage:'catalog/rls/permissions',status:'validated'})
  return report
 }catch(error){report.error=error.message;report.status=report.remote_changes?'unconfirmed':'blocked';throw Object.assign(new Error(report.error),{report})}
 finally{await writeFile(reportPath,JSON.stringify(report,null,2)+'\n',{mode:0o600})}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2)
 if(args.some(arg=>!['--apply','--plan'].includes(arg))){console.error('Use --plan (somente leitura) ou --apply. O destino é fixo e não aceita overrides.');process.exitCode=1}
 else try{const report=await run({apply:args.includes('--apply')});console.log(JSON.stringify(report,null,2))}catch(error){console.error(error.message);console.error('Relatório sem segredos: /tmp/pcif-homologacao-report.json');process.exitCode=1}
}
