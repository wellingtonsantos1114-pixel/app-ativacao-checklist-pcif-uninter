import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {fileURLToPath} from 'node:url'
import {resolve} from 'node:path'
export const root=fileURLToPath(new URL('../../',import.meta.url))
export const target=JSON.parse(await readFile(new URL('./target.json',import.meta.url),'utf8'))
export const migrations=[
 {version:'202610140001',name:'pcif_comments',path:'supabase/homologation/dependencies/202610140001_pcif_comments.sql',source:'painel-web-pcif.@85a7bfbcf2ec93d1bb3bf92b3a2f100852106e15'},
 {version:'202610170001',name:'pcif_session_access',path:'supabase/homologation/dependencies/202610170001_pcif_session_access.sql',source:'painel-web-pcif.@85a7bfbcf2ec93d1bb3bf92b3a2f100852106e15'},
 {version:'202610180001',name:'operational_foundation',path:'supabase/migrations/202610180001_operational_foundation.sql',source:'app-ativacao-checklist-pcif.'},
 {version:'202610180002',name:'operational_pilot',path:'supabase/migrations/202610180002_operational_pilot.sql',source:'app-ativacao-checklist-pcif.'},
]
export const tables=['public.pcif_comment_members','public.pcif_comments','pcif_ops.teams','pcif_ops.memberships','pcif_ops.collaborators','pcif_ops.reports','pcif_ops.audit_events','pcif_ops.team_state','pcif_ops.checklist_items','pcif_ops.checklist_answers']
export const functions=['public.pcif_has_access()','pcif_ops.stamp_report()','pcif_ops.live_session()','pcif_ops.password_ready(uuid)','pcif_ops.reader(text,text)','pcif_ops.operator_access()','public.pcif_ops_profile()','public.pcif_ops_snapshot()','public.pcif_ops_panel_snapshot()','public.pcif_ops_submit(uuid,text,jsonb,bigint)','public.pcif_ops_complete_password_change(uuid)']
export const columns=['pcif_ops.memberships.active','pcif_ops.memberships.environment','pcif_ops.reports.environment','pcif_ops.reports.team_revision','pcif_ops.reports.status_before','pcif_ops.reports.status_after']
export function literal(value){return "'"+String(value).replaceAll("'","''")+"'"}
const array=values=>'array['+values.map(literal).join(',')+']'
export const inspectSql=`select jsonb_build_object(
 'database',current_database(),
 'auth_ready',to_regclass('auth.users') is not null and to_regclass('auth.sessions') is not null and to_regprocedure('auth.uid()') is not null and to_regprocedure('auth.jwt()') is not null,
 'tables',(select coalesce(jsonb_agg(jsonb_build_object('name',n,'present',to_regclass(n) is not null,'rls',(select relrowsecurity from pg_class where oid=to_regclass(n)))),'[]'::jsonb) from unnest(${array(tables)}) n),
 'functions',(select coalesce(jsonb_agg(jsonb_build_object('name',n,'present',to_regprocedure(n) is not null)),'[]'::jsonb) from unnest(${array(functions)}) n),
 'realtime_publication',exists(select 1 from pg_publication where pubname='supabase_realtime')
) as inspection;`
export async function sources(){return Promise.all(migrations.map(async m=>{const sql=await readFile(resolve(root,m.path),'utf8');return {...m,sql,sha256:createHash('sha256').update(sql).digest('hex')}}))}
export function stripTransaction(sql){return sql.replace(/^\s*begin;\s*$/mi,'').replace(/^\s*commit;\s*$/mi,'')}
export const invariantsSql=`
do $pcif_validate$
declare t text; f text; role_name text; policy_count integer;
begin
 foreach t in array ${array(tables)} loop
  if to_regclass(t) is null then raise exception 'Tabela ausente: %',t; end if;
  if not (select relrowsecurity from pg_class where oid=to_regclass(t)) then raise exception 'RLS desabilitada: %',t; end if;
  if has_table_privilege('anon',t,'SELECT,INSERT,UPDATE,DELETE') then raise exception 'Permissão pública indevida: %',t; end if;
  if has_table_privilege('authenticated',t,'UPDATE,DELETE') then raise exception 'Mutação direta indevida: %',t; end if;
  if t<>'public.pcif_comments' and has_table_privilege('authenticated',t,'INSERT') then raise exception 'INSERT direto indevido: %',t; end if;
 end loop;
 foreach f in array ${array(functions)} loop
  if to_regprocedure(f) is null then raise exception 'Função ausente: %',f; end if;
  if has_function_privilege('anon',f,'EXECUTE') then raise exception 'EXECUTE anônimo: %',f; end if;
 end loop;
 if has_function_privilege('authenticated','public.pcif_ops_complete_password_change(uuid)','EXECUTE') or not has_function_privilege('service_role','public.pcif_ops_complete_password_change(uuid)','EXECUTE') then raise exception 'Liberação de senha com permissão indevida'; end if;
 foreach f in array ${array(functions.filter(f=>f.startsWith('public.')&&!f.includes('complete_password')))} loop
  if not has_function_privilege('authenticated',f,'EXECUTE') then raise exception 'RPC autenticada sem permissão: %',f; end if;
 end loop;
 if has_column_privilege('authenticated','pcif_ops.memberships','must_change_password','UPDATE') then raise exception 'Operador pode liberar senha inicial'; end if;
 if has_column_privilege('authenticated','public.pcif_comments','author_id','INSERT') or has_column_privilege('authenticated','public.pcif_comments','created_at','INSERT') then raise exception 'Identidade/tempo de comentário alterável'; end if;
 foreach t in array array['analyst_name','team_id','body'] loop
  if not has_column_privilege('authenticated','public.pcif_comments',t,'INSERT') then raise exception 'Campo de comentário sem permissão: %',t; end if;
 end loop;
 if (select count(*) from pcif_ops.teams)<>31 or (select count(*) from pcif_ops.checklist_items)<>33 then raise exception 'Catálogos incompletos'; end if;
 if not exists(select 1 from pg_trigger where tgrelid='pcif_ops.reports'::regclass and tgname='stamp_report' and not tgisinternal and tgenabled='O') then raise exception 'Trigger de identidade ausente/desabilitado'; end if;
 if not exists(select 1 from pg_indexes where schemaname='pcif_ops' and tablename='reports' and indexname='reports_team_revision' and indexdef like '%UNIQUE%') then raise exception 'Índice de revisão ausente'; end if;
 if not exists(select 1 from pg_constraint where conrelid='pcif_ops.reports'::regclass and contype='u' and pg_get_constraintdef(oid) like '%request_id%') then raise exception 'Idempotência sem restrição única'; end if;
 foreach t in array array['public.pcif_comments','pcif_ops.reports','pcif_ops.team_state'] loop
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname=split_part(t,'.',1) and tablename=split_part(t,'.',2)) then raise exception 'Realtime sem tabela: %',t; end if;
 end loop;
end $pcif_validate$;
`
// O snapshot registra somente definições, ACLs e catálogos centrais, nunca contas/senhas/relatórios.
export const catalogSql=`select jsonb_build_object(
 'functions',(select jsonb_agg(jsonb_build_object('name',n,'body',md5(replace(p.prosrc,E'\\r\\n',E'\\n')),'definer',p.prosecdef,'config',p.proconfig,'volatility',p.provolatile::text) order by n) from unnest(${array(functions)}) n join pg_proc p on p.oid=to_regprocedure(n)),
 'policies',(select jsonb_agg(jsonb_build_object('schema',schemaname,'table',tablename,'name',policyname,'roles',roles,'command',cmd,'qual',qual,'check',with_check,'permissive',permissive) order by schemaname,tablename,policyname) from pg_policies where schemaname='pcif_ops' or schemaname='public' and tablename in ('pcif_comments','pcif_comment_members')),
 'columns',(select jsonb_agg(jsonb_build_object('table',table_schema||'.'||table_name,'column',column_name,'type',data_type,'nullable',is_nullable) order by table_schema,table_name,ordinal_position) from information_schema.columns where table_schema='pcif_ops' or table_schema='public' and table_name in ('pcif_comments','pcif_comment_members')),
 'teams',(select jsonb_agg(to_jsonb(t) order by id) from pcif_ops.teams t),
 'items',(select jsonb_agg(to_jsonb(i) order by id) from pcif_ops.checklist_items i)
) as catalog;`
const presentTables=names=>`(select count(*) from unnest(${array(names)}) n where to_regclass(n) is not null)`
const presentFunctions=names=>`(select count(*) from unnest(${array(names)}) n where to_regprocedure(n) is not null)`
export async function buildSql(expected){
 if(!expected)throw Error('Gere primeiro o catálogo de referência local.')
 const all=await sources()
 const bodies=[
  [presentTables(tables.slice(0,2)),2],
  [presentFunctions([functions[0]]),1],
  [presentTables(tables.slice(2,7)),5],
  [`(${presentTables(tables.slice(7))}+${presentFunctions(functions.slice(2))})`,12],
 ]
 let sql=`-- DESTINO EXCLUSIVO: ${target.project_name} / ${target.project_ref}\n-- Confirme a URL do projeto no SQL Editor antes de Run. SQL isolado NÃO prova a identidade do projeto.\n-- Via instalador Management API, nome/ref/organização/estado são verificados ANTES do SQL.\n-- Sem usuários, contas, relatórios ou alterações no Netlify. Reexecução valida e ignora etapas instaladas.\nbegin;\nset local lock_timeout='5s';\nset local statement_timeout='120s';\nselect pg_advisory_xact_lock(hashtext('pcif_homologacao_bootstrap_v1'));\ndo $prerequisites$ begin\n if to_regclass('auth.users') is null or to_regclass('auth.sessions') is null or to_regprocedure('auth.uid()') is null or to_regprocedure('auth.jwt()') is null then raise exception 'Dependências do Supabase Auth ausentes'; end if;\n if not exists(select 1 from pg_roles where rolname='anon') or not exists(select 1 from pg_roles where rolname='authenticated') or not exists(select 1 from pg_roles where rolname='service_role') then raise exception 'Roles Supabase ausentes'; end if;\nend $prerequisites$;\ncreate schema if not exists pcif_bootstrap;\nrevoke all on schema pcif_bootstrap from public,anon,authenticated;\ncreate table if not exists pcif_bootstrap.target(singleton boolean primary key default true check(singleton),project_ref text not null);\ninsert into pcif_bootstrap.target(project_ref) values(${literal(target.project_ref)}) on conflict(singleton) do nothing;\ndo $target$ begin if (select project_ref from pcif_bootstrap.target)<>${literal(target.project_ref)} then raise exception 'Registro de destino incompatível'; end if;end $target$;\ncreate table if not exists pcif_bootstrap.migrations(version text primary key,sha256 text not null,applied_by_bootstrap boolean not null,recorded_at timestamptz not null default now());\nrevoke all on all tables in schema pcif_bootstrap from public,anon,authenticated;\n`
 for(let i=0;i<all.length;i++){
  const m=all[i],[count,total]=bodies[i]
  sql+=`\n-- ${m.version}_${m.name}; SHA-256 ${m.sha256}\ndo $stage_${i}$\ndeclare present integer;begin\n if exists(select 1 from pcif_bootstrap.migrations where version=${literal(m.version)} and sha256<>${literal(m.sha256)}) then raise exception 'Checksum de migração incompatível: ${m.version}'; end if;\n present:=${count};\n if present not in (0,${total}) then raise exception 'Instalação parcial/incompatível: ${m.version}'; end if;\n if present=0 then\n execute $migration_${i}$${stripTransaction(m.sql)}$migration_${i}$;\n end if;\n insert into pcif_bootstrap.migrations(version,sha256,applied_by_bootstrap) values(${literal(m.version)},${literal(m.sha256)},present=0) on conflict(version) do nothing;\nend $stage_${i}$;\n`
 }
 sql+=`\n-- Completa somente as assinaturas Realtime previstas para o piloto.\ndo $realtime$\ndeclare t text;begin\n if not exists(select 1 from pg_publication where pubname='supabase_realtime') then create publication supabase_realtime;end if;\n foreach t in array array['public.pcif_comments','pcif_ops.reports','pcif_ops.team_state'] loop\n if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname=split_part(t,'.',1) and tablename=split_part(t,'.',2)) then execute format('alter publication supabase_realtime add table %I.%I',split_part(t,'.',1),split_part(t,'.',2));end if;end loop;\nend $realtime$;\n${invariantsSql}\n`
 // JSON é comparado como jsonb: ordem das chaves não interfere; nenhuma definição desconhecida é substituída.
 sql+=`do $exact_catalog$\ndeclare actual jsonb;begin\n select catalog into actual from (${catalogSql.replace(/;\s*$/,'')}) reference;\n if actual<>${literal(JSON.stringify(expected))}::jsonb then raise exception 'Definições/políticas/catálogos diferem da referência revisada. Transação cancelada.'; end if;\nend $exact_catalog$;\ncommit;\nselect 'validated' as status,${literal(target.project_ref)} as project_ref,(select count(*) from pcif_bootstrap.migrations) as migrations,(select count(*) from pcif_ops.teams) as teams,(select count(*) from pcif_ops.checklist_items) as checklist_items;\n`
 return sql
}
export async function writeBundle(expected){
 const sql=await buildSql(expected);const path=resolve(root,'supabase/homologation/install.sql');await mkdir(resolve(root,'supabase/homologation'),{recursive:true});await writeFile(path,sql)
 const manifest=(await sources()).map(({sql,...m})=>m)
 await writeFile(resolve(root,'supabase/homologation/manifest.json'),JSON.stringify({target,migrations:manifest},null,2)+'\n')
 await writeFile(resolve(root,'supabase/homologation/catalog.json'),JSON.stringify(expected,null,2)+'\n')
 return path
}
