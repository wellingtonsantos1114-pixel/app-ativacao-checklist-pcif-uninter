-- DESTINO EXCLUSIVO: pcif-homologacao / exemploprojetoref000
-- Confirme a URL do projeto no SQL Editor antes de Run. SQL isolado NÃO prova a identidade do projeto.
-- Via instalador Management API, nome/ref/organização/estado são verificados ANTES do SQL.
-- Sem usuários, contas, relatórios ou alterações no Netlify. Reexecução valida e ignora etapas instaladas.
begin;
set local lock_timeout='5s';
set local statement_timeout='120s';
select pg_advisory_xact_lock(hashtext('pcif_homologacao_bootstrap_v1'));
do $prerequisites$ begin
 if to_regclass('auth.users') is null or to_regclass('auth.sessions') is null or to_regprocedure('auth.uid()') is null or to_regprocedure('auth.jwt()') is null then raise exception 'Dependências do Supabase Auth ausentes'; end if;
 if not exists(select 1 from pg_roles where rolname='anon') or not exists(select 1 from pg_roles where rolname='authenticated') or not exists(select 1 from pg_roles where rolname='service_role') then raise exception 'Roles Supabase ausentes'; end if;
end $prerequisites$;
create schema if not exists pcif_bootstrap;
revoke all on schema pcif_bootstrap from public,anon,authenticated;
create table if not exists pcif_bootstrap.target(singleton boolean primary key default true check(singleton),project_ref text not null);
insert into pcif_bootstrap.target(project_ref) values('exemploprojetoref000') on conflict(singleton) do nothing;
do $target$ begin if (select project_ref from pcif_bootstrap.target)<>'exemploprojetoref000' then raise exception 'Registro de destino incompatível'; end if;end $target$;
create table if not exists pcif_bootstrap.migrations(version text primary key,sha256 text not null,applied_by_bootstrap boolean not null,recorded_at timestamptz not null default now());
revoke all on all tables in schema pcif_bootstrap from public,anon,authenticated;

-- 202610140001_pcif_comments; SHA-256 2086f82c4b4f955c7f29e6a49ba16a0a19c44cefdb8822868592a68a4d0ba43b
do $stage_0$
declare present integer;begin
 if exists(select 1 from pcif_bootstrap.migrations where version='202610140001' and sha256<>'2086f82c4b4f955c7f29e6a49ba16a0a19c44cefdb8822868592a68a4d0ba43b') then raise exception 'Checksum de migração incompatível: 202610140001'; end if;
 present:=(select count(*) from unnest(array['public.pcif_comment_members','public.pcif_comments']) n where to_regclass(n) is not null);
 if present not in (0,2) then raise exception 'Instalação parcial/incompatível: 202610140001'; end if;
 if present=0 then
 execute $migration_0$
-- Run as the project owner through the Supabase SQL Editor, never in React.
create table public.pcif_comment_members (
 user_id uuid primary key references auth.users(id) on delete cascade,
 active boolean not null default true
);
alter table public.pcif_comment_members enable row level security;
alter table public.pcif_comment_members force row level security;
revoke all on public.pcif_comment_members from public, anon, authenticated;
grant select on public.pcif_comment_members to authenticated;
create policy members_read_self on public.pcif_comment_members for select to authenticated
 using (user_id = (select auth.uid()) and active);

create table public.pcif_comments (
 id uuid primary key default gen_random_uuid(),
 author_id uuid not null default auth.uid() references auth.users(id),
 analyst_name text not null check (char_length(btrim(analyst_name)) between 1 and 120),
 team_id text check (team_id is null or team_id ~ '^GAR (0[1-9]|1[0-9]|2[0-3])$' or team_id ~ '^GAC 0[1-8]$'),
 body text not null check (char_length(btrim(body)) between 1 and 4000),
 created_at timestamptz not null default now()
);
create index pcif_comments_recent_idx on public.pcif_comments (created_at desc, id desc);
create index pcif_comments_team_recent_idx on public.pcif_comments (team_id, created_at desc, id desc);
alter table public.pcif_comments enable row level security;
alter table public.pcif_comments force row level security;
revoke all on public.pcif_comments from public, anon, authenticated;
grant select on public.pcif_comments to authenticated;
-- Column grants prevent overriding the identity, timestamp and ID via direct REST calls.
grant insert (analyst_name, team_id, body) on public.pcif_comments to authenticated;
create policy comments_read_members on public.pcif_comments for select to authenticated
 using ((select auth.uid()) is not null and exists (
  select 1 from public.pcif_comment_members m where m.user_id = (select auth.uid()) and m.active
 ));
create policy comments_insert_members on public.pcif_comments for insert to authenticated
 with check (author_id = (select auth.uid()) and exists (
  select 1 from public.pcif_comment_members m where m.user_id = (select auth.uid()) and m.active
 ));
-- Append-only: no UPDATE/DELETE grants or policies for authenticated users.
-- Realtime respects SELECT RLS; polling also remains available in the client.
do $$
begin
 if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
 and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pcif_comments') then
  alter publication supabase_realtime add table public.pcif_comments;
 end if;
end $$;
$migration_0$;
 end if;
 insert into pcif_bootstrap.migrations(version,sha256,applied_by_bootstrap) values('202610140001','2086f82c4b4f955c7f29e6a49ba16a0a19c44cefdb8822868592a68a4d0ba43b',present=0) on conflict(version) do nothing;
end $stage_0$;

-- 202610170001_pcif_session_access; SHA-256 b16e0d6bf81964168fa6e8fc1e2b6f197b671a0637d4fb4307d6765cecc4f1f2
do $stage_1$
declare present integer;begin
 if exists(select 1 from pcif_bootstrap.migrations where version='202610170001' and sha256<>'b16e0d6bf81964168fa6e8fc1e2b6f197b671a0637d4fb4307d6765cecc4f1f2') then raise exception 'Checksum de migração incompatível: 202610170001'; end if;
 present:=(select count(*) from unnest(array['public.pcif_has_access()']) n where to_regprocedure(n) is not null);
 if present not in (0,1) then raise exception 'Instalação parcial/incompatível: 202610170001'; end if;
 if present=0 then
 execute $migration_1$
-- Only the owner can inspect auth.sessions. Expose a boolean, never session data.
-- Live Auth sessions are required, so a revoked refresh session cannot keep reading
-- comments using an otherwise unexpired JWT. Verify against the hosted Auth release.
create or replace function public.pcif_has_access()
returns boolean language sql stable security definer
set search_path = ''
as $$
 select exists (
  select 1 from public.pcif_comment_members m
  join auth.sessions s on s.user_id=m.user_id
  where m.user_id=auth.uid() and m.active
  and s.id::text=coalesce(auth.jwt()->>'session_id','')
 );
$$;
revoke all on function public.pcif_has_access() from public,anon;
grant execute on function public.pcif_has_access() to authenticated;
drop policy members_read_self on public.pcif_comment_members;
create policy members_read_self on public.pcif_comment_members for select to authenticated
 using (user_id=(select auth.uid()) and active and (select public.pcif_has_access()));
drop policy comments_read_members on public.pcif_comments;
create policy comments_read_members on public.pcif_comments for select to authenticated
 using ((select public.pcif_has_access()));
drop policy comments_insert_members on public.pcif_comments;
create policy comments_insert_members on public.pcif_comments for insert to authenticated
 with check (author_id=(select auth.uid()) and (select public.pcif_has_access()));
$migration_1$;
 end if;
 insert into pcif_bootstrap.migrations(version,sha256,applied_by_bootstrap) values('202610170001','b16e0d6bf81964168fa6e8fc1e2b6f197b671a0637d4fb4307d6765cecc4f1f2',present=0) on conflict(version) do nothing;
end $stage_1$;

-- 202610180001_operational_foundation; SHA-256 40d01e460e6519b0a5efef540881138f2517dcd588a55e1a02ec1fb30c2b2a53
do $stage_2$
declare present integer;begin
 if exists(select 1 from pcif_bootstrap.migrations where version='202610180001' and sha256<>'40d01e460e6519b0a5efef540881138f2517dcd588a55e1a02ec1fb30c2b2a53') then raise exception 'Checksum de migração incompatível: 202610180001'; end if;
 present:=(select count(*) from unnest(array['pcif_ops.teams','pcif_ops.memberships','pcif_ops.collaborators','pcif_ops.reports','pcif_ops.audit_events']) n where to_regclass(n) is not null);
 if present not in (0,5) then raise exception 'Instalação parcial/incompatível: 202610180001'; end if;
 if present=0 then
 execute $migration_2$-- SOMENTE HOMOLOGAÇÃO, mediante revisão. Não executada pelo frontend/setup.

create schema if not exists pcif_ops;
revoke all on schema pcif_ops from public, anon;
grant usage on schema pcif_ops to authenticated;
create table pcif_ops.teams (
 id text primary key check (id ~ '^(GAR (0[1-9]|1[0-9]|2[0-3])|GAC 0[1-8])$'),
 state text not null, region text not null
);
create table pcif_ops.memberships (
 user_id uuid primary key references auth.users(id),
 team_id text references pcif_ops.teams(id),
 role text not null check(role in ('team','analyst')),
 must_change_password boolean not null default true,
 check(role <> 'team' or team_id is not null)
);
create table pcif_ops.collaborators (
 id uuid primary key default gen_random_uuid(), name text not null, active boolean not null default true
);
create table pcif_ops.reports (
 id uuid primary key default gen_random_uuid(),
 request_id uuid not null unique,
 team_id text not null references pcif_ops.teams(id),
 author_id uuid not null references auth.users(id),
 kind text not null check(kind in ('activation','checklist','maintenance_enter','maintenance_exit','deactivation')),
 created_at timestamptz not null default now(),
 operational_date date not null default ((now() at time zone 'America/Sao_Paulo')::date),
 payload jsonb not null check(jsonb_typeof(payload)='object')
);
-- Relatórios imutáveis: correções devem ser novos eventos, nunca sobrescritas.
create table pcif_ops.audit_events (
 id bigint generated always as identity primary key,
 report_id uuid not null references pcif_ops.reports(id), created_at timestamptz not null default now()
);
create function pcif_ops.stamp_report() returns trigger language plpgsql set search_path='' as $$
begin
 select m.team_id into new.team_id from pcif_ops.memberships m
 where m.user_id=auth.uid() and m.role='team' and not m.must_change_password;
 if new.team_id is null then raise exception 'Operador não autorizado'; end if;
 new.author_id:=auth.uid(); new.created_at:=now();
 new.operational_date:=(now() at time zone 'America/Sao_Paulo')::date;
 return new;
end $$;
create trigger stamp_report before insert on pcif_ops.reports for each row execute function pcif_ops.stamp_report();
alter table pcif_ops.teams enable row level security;
alter table pcif_ops.memberships enable row level security;
alter table pcif_ops.collaborators enable row level security;
alter table pcif_ops.reports enable row level security;
alter table pcif_ops.audit_events enable row level security;
grant select on pcif_ops.teams,pcif_ops.memberships,pcif_ops.collaborators,pcif_ops.reports to authenticated;
grant insert on pcif_ops.reports to authenticated;
create policy own_membership on pcif_ops.memberships for select to authenticated using(user_id=auth.uid());
create policy read_teams on pcif_ops.teams for select to authenticated using(exists(select 1 from pcif_ops.memberships where user_id=auth.uid()));
create policy read_collaborators on pcif_ops.collaborators for select to authenticated using(exists(select 1 from pcif_ops.memberships where user_id=auth.uid() and not must_change_password));
create policy read_reports on pcif_ops.reports for select to authenticated using(exists(select 1 from pcif_ops.memberships m where m.user_id=auth.uid() and not m.must_change_password and (m.role='analyst' or m.team_id=reports.team_id)));
create policy insert_reports on pcif_ops.reports for insert to authenticated with check(author_id=auth.uid() and exists(select 1 from pcif_ops.memberships m where m.user_id=auth.uid() and m.role='team' and not m.must_change_password and m.team_id=reports.team_id));
create index reports_team_date on pcif_ops.reports(team_id,operational_date,created_at);
-- Nenhuma conta ou colaborador criado. Realtime não habilitado nesta etapa.
$migration_2$;
 end if;
 insert into pcif_bootstrap.migrations(version,sha256,applied_by_bootstrap) values('202610180001','40d01e460e6519b0a5efef540881138f2517dcd588a55e1a02ec1fb30c2b2a53',present=0) on conflict(version) do nothing;
end $stage_2$;

-- 202610180002_operational_pilot; SHA-256 3a630fb290d7819fa5e834675490c3bd400b67ab11b7c3c7e0f6905501b6ef70
do $stage_3$
declare present integer;begin
 if exists(select 1 from pcif_bootstrap.migrations where version='202610180002' and sha256<>'3a630fb290d7819fa5e834675490c3bd400b67ab11b7c3c7e0f6905501b6ef70') then raise exception 'Checksum de migração incompatível: 202610180002'; end if;
 present:=((select count(*) from unnest(array['pcif_ops.team_state','pcif_ops.checklist_items','pcif_ops.checklist_answers']) n where to_regclass(n) is not null)+(select count(*) from unnest(array['pcif_ops.live_session()','pcif_ops.password_ready(uuid)','pcif_ops.reader(text,text)','pcif_ops.operator_access()','public.pcif_ops_profile()','public.pcif_ops_snapshot()','public.pcif_ops_panel_snapshot()','public.pcif_ops_submit(uuid,text,jsonb,bigint)','public.pcif_ops_complete_password_change(uuid)']) n where to_regprocedure(n) is not null));
 if present not in (0,12) then raise exception 'Instalação parcial/incompatível: 202610180002'; end if;
 if present=0 then
 execute $migration_3$-- Revisar e executar SOMENTE em homologação. Requer as duas migrações de Auth/comentários
-- já existentes no painel e 202610180001 deste app. Não altera tabelas de comentários.

do $$ begin
 if to_regprocedure('public.pcif_has_access()') is null then
  raise exception 'Instale primeiro as migrações de Auth/comentários do Painel Web em homologação';
 end if;
 if exists(select 1 from pcif_ops.reports) or exists(select 1 from pcif_ops.memberships) then
  raise exception 'Há dados operacionais prévios: revise a classificação piloto/produção antes de migrar. Nada foi alterado.';
 end if;
end $$;
alter table pcif_ops.memberships add column active boolean not null default true;
alter table pcif_ops.memberships add column environment text not null default 'pilot' check(environment in ('pilot','production'));
alter table pcif_ops.reports add column environment text not null default 'pilot' check(environment in ('pilot','production'));
alter table pcif_ops.reports add column team_revision bigint not null default 0;
alter table pcif_ops.reports add column status_before text check(status_before in ('Pendente','Ativa','Em manutenção','OFF'));
alter table pcif_ops.reports add column status_after text check(status_after in ('Pendente','Ativa','Em manutenção','OFF'));
create unique index reports_team_revision on pcif_ops.reports(team_id,environment,team_revision) where team_revision>0;
create table pcif_ops.team_state (
 team_id text not null references pcif_ops.teams(id), environment text not null check(environment in ('pilot','production')),
 status text not null default 'Pendente' check(status in ('Pendente','Ativa','Em manutenção','OFF')),
 before_maintenance text check(before_maintenance in ('Pendente','Ativa','OFF')),
 revision bigint not null default 0, updated_at timestamptz not null default now(),
 primary key(team_id,environment)
);
create table pcif_ops.checklist_items (
 id integer primary key check(id between 1 and 33), section text not null, label text not null,
 expected_quantity integer check(expected_quantity>=0), field_key text not null unique
);
create table pcif_ops.checklist_answers (
 report_id uuid not null references pcif_ops.reports(id), item_id integer not null references pcif_ops.checklist_items(id),
 answer text not null check(answer in ('Conforme','Não conforme','Não se aplica')),
 problem text, quantity integer check(quantity>=0), primary key(report_id,item_id),
 check(answer <> 'Não conforme' or length(btrim(problem))>0 and problem is not null)
);
insert into pcif_ops.checklist_items(id,section,label,expected_quantity,field_key) values
(1,'vehicle','Cartão de abastecimento externo',null,'vehicle.0'),
(2,'vehicle','Lanterna / Farol',null,'vehicle.1'),
(3,'vehicle','Para-choques',null,'vehicle.2'),
(4,'vehicle','Óleo de freio / Óleo de motor',null,'vehicle.3'),
(5,'vehicle','Luz de freio',null,'vehicle.4'),
(6,'vehicle','Luz de seta dianteira e traseira',null,'vehicle.5'),
(7,'vehicle','Limpador de para-brisa',null,'vehicle.6'),
(8,'vehicle','Limpeza interna e externa',null,'vehicle.7'),
(9,'vehicle','Lataria em geral',null,'vehicle.8'),
(10,'vehicle','Documento do veículo',null,'vehicle.9'),
(11,'vehicle','Rádio comunicador fixo',null,'vehicle.10'),
(12,'vehicle','Pasta de documentos',null,'vehicle.11'),
(13,'vehicle','Estepe',null,'vehicle.12'),
(14,'cargo','Kit primeiros socorros — Nº 116',1,'cargo.0'),
(15,'cargo','Chave de porteira',1,'cargo.1'),
(16,'cargo','Chave de torre',1,'cargo.2'),
(17,'cargo','Tablet',1,'cargo.3'),
(18,'cargo','Binóculo',1,'cargo.4'),
(19,'cargo','Abafadores',2,'cargo.5'),
(20,'cargo','Enxadas',3,'cargo.6'),
(21,'cargo','Mochilas costais',3,'cargo.7'),
(22,'cargo','Bicos de mochilas costais',3,'cargo.8'),
(23,'cargo','Garrafões de água',3,'cargo.9'),
(24,'cargo','Foice',1,'cargo.10'),
(25,'cargo','Dosador',1,'cargo.11'),
(26,'cargo','Soprador Stihl',1,'cargo.12'),
(27,'cargo','Machado',1,'cargo.13'),
(28,'cargo','Kit de combate',1,'cargo.14'),
(29,'cargo','Bomba de sucção',null,'cargo.15'),
(30,'cargo','Spray inseticida para abelhas',null,'cargo.16'),
(31,'cargo','Vestimento de apicultor',null,'cargo.17'),
(32,'cargo','Pé de cabra',1,'cargo.18'),
(33,'cargo','Martelo',1,'cargo.19');
-- Cadastro central. Nenhuma conta, pessoa ou relatório é criado por esta migração.
insert into pcif_ops.teams(id,state,region)
select kind||' '||lpad(n::text,2,'0'),
 case when region='Paraná' then 'Paraná' when region='Minas Gerais' then 'Minas Gerais' else 'São Paulo' end,region
from (
 select kind,n,case
 when kind='GAR' and n=21 then 'Paraná'
 when kind='GAR' and n in (22,23) or kind='GAC' and n=7 then 'Minas Gerais'
 when kind='GAR' and n in (1,3,4,6) or kind='GAC' and n=3 then 'Norte'
 when kind='GAR' and n in (2,5,19,20) or kind='GAC' and n in (1,5) then 'Noroeste'
 when kind='GAR' and n in (7,8,9,10,11,12) or kind='GAC' and n in (2,4) then 'Centro'
 else 'Sul' end region from (select 'GAR' kind,generate_series(1,23) n union all select 'GAC',generate_series(1,8)) t
) t on conflict(id) do nothing;

create function pcif_ops.live_session() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.sessions s where s.user_id=auth.uid() and s.id::text=coalesce(auth.jwt()->>'session_id',''));
$$;
create function pcif_ops.password_ready(member_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from pcif_ops.memberships m where m.user_id=member_id and not m.must_change_password);
$$;
-- Somente o backend confiável pode liberar a senha inicial. Trocar hash diretamente
-- no Auth NÃO libera a flag (bcrypt com novo salt não prova senha diferente).
create function public.pcif_ops_complete_password_change(p_user_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 update pcif_ops.memberships set must_change_password=false
 where user_id=p_user_id and role='team' and active and environment='pilot';
 if not found then raise exception 'Perfil piloto indisponível'; end if;
 return true;
end $$;
revoke all on function public.pcif_ops_complete_password_change(uuid) from public,anon,authenticated;
grant execute on function public.pcif_ops_complete_password_change(uuid) to service_role;
create function pcif_ops.reader(target_team text,target_environment text) returns boolean language sql stable security definer set search_path='' as $$
 select pcif_ops.live_session() and exists(select 1 from pcif_ops.memberships m where m.user_id=auth.uid() and m.active
 and m.environment=target_environment and
 ((m.role='team' and m.team_id=target_team and pcif_ops.password_ready(m.user_id)) or (m.role='analyst' and public.pcif_has_access())));
$$;
create function pcif_ops.operator_access() returns boolean language sql stable security definer set search_path='' as $$
 select pcif_ops.live_session() and exists(select 1 from pcif_ops.memberships m where m.user_id=auth.uid() and m.active and m.role='team' and pcif_ops.password_ready(m.user_id));
$$;
-- A flag de senha não pode ser alterada pelo operador; somente a RPC privada do servidor a libera.
revoke all on pcif_ops.memberships from authenticated;
grant select(user_id,team_id,role,must_change_password,active,environment) on pcif_ops.memberships to authenticated;
revoke insert on pcif_ops.reports from authenticated;
create or replace function pcif_ops.stamp_report() returns trigger language plpgsql set search_path='' as $$
begin
 if not pcif_ops.operator_access() then raise exception 'Operador não autorizado'; end if;
 select m.team_id,m.environment into new.team_id,new.environment from pcif_ops.memberships m where m.user_id=auth.uid();
 new.author_id:=auth.uid();new.created_at:=now();new.operational_date:=(now() at time zone 'America/Sao_Paulo')::date;
 return new;
end $$;
drop policy insert_reports on pcif_ops.reports;
drop policy read_reports on pcif_ops.reports;
create policy read_reports on pcif_ops.reports for select to authenticated using(pcif_ops.reader(team_id,environment));
drop policy read_teams on pcif_ops.teams;
create policy read_teams on pcif_ops.teams for select to authenticated using(exists(select 1 from pcif_ops.memberships m where m.user_id=auth.uid() and m.active and pcif_ops.reader(teams.id,m.environment)));
drop policy read_collaborators on pcif_ops.collaborators;
create policy read_collaborators on pcif_ops.collaborators for select to authenticated using(pcif_ops.operator_access());
drop policy own_membership on pcif_ops.memberships;
create policy own_membership on pcif_ops.memberships for select to authenticated using(user_id=auth.uid() and active and pcif_ops.live_session());
alter table pcif_ops.team_state enable row level security;
alter table pcif_ops.checklist_items enable row level security;
alter table pcif_ops.checklist_answers enable row level security;
grant select on pcif_ops.team_state,pcif_ops.checklist_items,pcif_ops.checklist_answers,pcif_ops.audit_events to authenticated;
create policy read_state on pcif_ops.team_state for select to authenticated using(pcif_ops.reader(team_id,environment));
create policy read_items on pcif_ops.checklist_items for select to authenticated using(pcif_ops.live_session() and exists(select 1 from pcif_ops.memberships m where m.user_id=auth.uid() and m.active and pcif_ops.reader(coalesce(m.team_id,''),m.environment)));
create policy read_answers on pcif_ops.checklist_answers for select to authenticated using(exists(select 1 from pcif_ops.reports r where r.id=report_id));
create policy read_audit on pcif_ops.audit_events for select to authenticated using(exists(select 1 from pcif_ops.reports r where r.id=report_id));

create function public.pcif_ops_profile() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare m pcif_ops.memberships; t pcif_ops.teams;
begin
 select * into m from pcif_ops.memberships where user_id=auth.uid() and active and role='team';
 if m.user_id is null or not pcif_ops.live_session() then raise exception 'Acesso negado' using errcode='42501'; end if;
 select * into t from pcif_ops.teams where id=m.team_id;
 return jsonb_build_object('team',t.id,'state',t.state,'region',t.region,'environment',m.environment,'mustChangePassword',not pcif_ops.password_ready(m.user_id));
end $$;
create function public.pcif_ops_snapshot() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare m pcif_ops.memberships; result jsonb;
begin
 if not pcif_ops.operator_access() then raise exception 'Acesso negado' using errcode='42501'; end if;
 select * into m from pcif_ops.memberships where user_id=auth.uid();
 select jsonb_build_object('profile',public.pcif_ops_profile(),
 'status',coalesce(s.status,'Pendente'),'revision',coalesce(s.revision,0),'beforeMaintenance',s.before_maintenance,
 'reports',coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at desc,r.team_revision desc,r.id desc) from pcif_ops.reports r where r.team_id=m.team_id and r.environment=m.environment),'[]'::jsonb),
 'operationalDate',(now() at time zone 'America/Sao_Paulo')::date) into result
 from (select 1) singleton left join pcif_ops.team_state s on s.team_id=m.team_id and s.environment=m.environment;
 return result;
end $$;
create function public.pcif_ops_panel_snapshot() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare m pcif_ops.memberships;
begin
 select * into m from pcif_ops.memberships where user_id=auth.uid() and active and role='analyst';
 if m.user_id is null or not pcif_ops.live_session() or not public.pcif_has_access() then raise exception 'Analista não autorizado' using errcode='42501'; end if;
 return jsonb_build_object('environment',m.environment,'operationalDate',(now() at time zone 'America/Sao_Paulo')::date,
 'items',(select jsonb_agg(to_jsonb(i) order by i.id) from pcif_ops.checklist_items i),
 'teams',(select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]'::jsonb) from pcif_ops.teams t),
 'states',(select coalesce(jsonb_agg(to_jsonb(s)),'[]'::jsonb) from pcif_ops.team_state s where s.environment=m.environment),
 'reports',(select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc,r.team_revision desc,r.id desc),'[]'::jsonb) from pcif_ops.reports r where r.environment=m.environment));
end $$;

create function public.pcif_ops_submit(p_request_id uuid,p_kind text,p_payload jsonb,p_expected_revision bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare m pcif_ops.memberships; st pcif_ops.team_state; existing pcif_ops.reports;
 f jsonb; item pcif_ops.checklist_items; answer text; problem text; qty text; report_id uuid; new_status text;
begin
 if not pcif_ops.operator_access() then raise exception 'Acesso negado' using errcode='42501'; end if;
 select * into m from pcif_ops.memberships where user_id=auth.uid();
 if p_request_id is null or p_kind is null or p_kind not in ('activation','checklist','maintenance_enter','maintenance_exit','deactivation')
 or p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>65536 then raise exception 'Dados inválidos'; end if;
 f:=p_payload->'fields';
 if f is null or jsonb_typeof(f)<>'object' or exists(select 1 from jsonb_each(f) e where jsonb_typeof(e.value)<>'string' or length(e.value #>> '{}')>2000)
 or p_payload->>'notes' is null or jsonb_typeof(p_payload->'notes')<>'string' or length(p_payload->>'notes')>2000 then raise exception 'Campos inválidos'; end if;
 -- Serializa todas as operações de uma equipe e isola o piloto da produção.
 insert into pcif_ops.team_state(team_id,environment) values(m.team_id,m.environment) on conflict do nothing;
 select * into st from pcif_ops.team_state where team_id=m.team_id and environment=m.environment for update;
 select * into existing from pcif_ops.reports where request_id=p_request_id;
 if existing.id is not null then
  if existing.author_id<>auth.uid() or existing.team_id<>m.team_id or existing.environment<>m.environment or existing.kind<>p_kind or existing.payload<>p_payload then raise exception 'Identificador já utilizado'; end if;
  return jsonb_build_object('reportId',existing.id,'snapshot',public.pcif_ops_snapshot());
 end if;
 if p_expected_revision is null or st.revision<>p_expected_revision then raise exception 'Estado alterado. Atualize os dados antes de confirmar.' using errcode='40001'; end if;
 new_status:=st.status;
 if p_kind='activation' then
  if st.status='Em manutenção' then raise exception 'Finalize a manutenção antes de ativar'; end if;
  if coalesce(f->>'shift','') not in ('Diurno','Noturno') or coalesce(f->>'vehicleType','') not in ('Oficial','Reserva')
  or coalesce(f->>'model','') not in ('L200','S10','Ranger','Strada','T-Cross','Creta','Toro','Argo','HB20','Outro')
  or length(btrim(coalesce(f->>'person.0','')))=0 or length(btrim(coalesce(f->>'person.1','')))=0
  or lower(btrim(f->>'person.0'))=lower(btrim(f->>'person.1'))
  or (length(btrim(coalesce(f->>'person.2','')))>0 and lower(btrim(f->>'person.2')) in (lower(btrim(f->>'person.0')),lower(btrim(f->>'person.1'))))
  or length(btrim(coalesce(f->>'plate','')))=0 or length(f->>'plate')>20
  or length(btrim(coalesce(f->>'project','')))=0 or length(btrim(coalesce(f->>'city','')))=0
  or (f->>'model'='Outro' and length(btrim(coalesce(f->>'otherModel','')))=0)
  or coalesce(f->>'condition.0','') not in ('Operante','Inoperante') or coalesce(f->>'condition.1','') not in ('Operante','Inoperante')
  or coalesce(f->>'condition.2','') not in ('Operante','Inoperante') then raise exception 'Ativação incompleta ou inválida'; end if;
  if coalesce(f->>'maps','')<>'' and (f->>'maps') !~ '^https://(maps[.]app[.]goo[.]gl/|maps[.]google[.]com/|www[.]google[.]com/maps[/ ?]|goo[.]gl/maps/)' then raise exception 'Link de localização inválido'; end if;
  new_status:='Ativa';
 elsif p_kind='checklist' then
  if exists(select 1 from jsonb_object_keys(f) k where k<>'notes' and not exists(select 1 from pcif_ops.checklist_items i where k=i.field_key||'.answer' or k=i.field_key||'.problem' or i.section='cargo' and k=i.field_key||'.quantity')) then raise exception 'Checklist contém item desconhecido'; end if;
  for item in select * from pcif_ops.checklist_items order by id loop
   answer:=f->>(item.field_key||'.answer');problem:=f->>(item.field_key||'.problem');qty:=f->>(item.field_key||'.quantity');
   if coalesce(answer,'') not in ('Conforme','Não conforme','Não se aplica') or (answer='Não conforme' and length(btrim(coalesce(problem,'')))=0)
   or (item.section='cargo' and (qty is null or qty !~ '^[0-9]{1,6}$')) then raise exception 'Checklist incompleto ou inválido: item %',item.id; end if;
  end loop;
  if (select count(*) from pcif_ops.checklist_items)<>33 then raise exception 'Catálogo incompleto'; end if;
 elsif p_kind='maintenance_enter' then
  if st.status='Em manutenção' then raise exception 'Equipe já está em manutenção'; end if;
  new_status:='Em manutenção';
 elsif p_kind='maintenance_exit' then
  if st.status<>'Em manutenção' or st.before_maintenance is null then raise exception 'Equipe não está em manutenção'; end if;
  new_status:=st.before_maintenance;
 elsif p_kind='deactivation' then
  if st.status='OFF' then raise exception 'Equipe já está OFF'; end if;
  if coalesce(f->>'detail','') not in ('Fim da operação','Necessidade de manutenção') then raise exception 'Motivo obrigatório'; end if;
  new_status:='OFF';
 end if;
 insert into pcif_ops.reports(request_id,team_id,author_id,kind,payload,environment,team_revision,status_before,status_after)
 values(p_request_id,m.team_id,auth.uid(),p_kind,p_payload,m.environment,st.revision+1,st.status,new_status) returning id into report_id;
 if p_kind='checklist' then
  insert into pcif_ops.checklist_answers(report_id,item_id,answer,problem,quantity)
  select report_id,i.id,f->>(i.field_key||'.answer'),nullif(f->>(i.field_key||'.problem'),''),
  case when i.section='cargo' then (f->>(i.field_key||'.quantity'))::integer else null end from pcif_ops.checklist_items i;
 end if;
 insert into pcif_ops.audit_events(report_id) values(report_id);
 update pcif_ops.team_state set status=new_status,
 before_maintenance=case when p_kind='maintenance_enter' then st.status when p_kind in ('maintenance_exit','deactivation') then null else st.before_maintenance end,
 revision=st.revision+1,updated_at=now() where team_id=m.team_id and environment=m.environment;
 return jsonb_build_object('reportId',report_id,'snapshot',public.pcif_ops_snapshot());
end $$;
-- As funções internas não são RPCs públicas; permissões mínimas para RLS.
revoke all on all functions in schema pcif_ops from public,anon,authenticated;
grant execute on function pcif_ops.live_session(),pcif_ops.reader(text,text),pcif_ops.operator_access() to authenticated;
revoke all on function public.pcif_ops_profile(),public.pcif_ops_snapshot(),public.pcif_ops_panel_snapshot(),public.pcif_ops_submit(uuid,text,jsonb,bigint) from public,anon;
grant execute on function public.pcif_ops_profile(),public.pcif_ops_snapshot(),public.pcif_ops_panel_snapshot(),public.pcif_ops_submit(uuid,text,jsonb,bigint) to authenticated;
create index reports_environment_recent on pcif_ops.reports(environment,created_at desc,id desc);
do $$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
  alter publication supabase_realtime add table pcif_ops.reports,pcif_ops.team_state;
 end if;
end $$;
$migration_3$;
 end if;
 insert into pcif_bootstrap.migrations(version,sha256,applied_by_bootstrap) values('202610180002','3a630fb290d7819fa5e834675490c3bd400b67ab11b7c3c7e0f6905501b6ef70',present=0) on conflict(version) do nothing;
end $stage_3$;

-- Completa somente as assinaturas Realtime previstas para o piloto.
do $realtime$
declare t text;begin
 if not exists(select 1 from pg_publication where pubname='supabase_realtime') then create publication supabase_realtime;end if;
 foreach t in array array['public.pcif_comments','pcif_ops.reports','pcif_ops.team_state'] loop
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname=split_part(t,'.',1) and tablename=split_part(t,'.',2)) then execute format('alter publication supabase_realtime add table %I.%I',split_part(t,'.',1),split_part(t,'.',2));end if;end loop;
end $realtime$;

do $pcif_validate$
declare t text; f text; role_name text; policy_count integer;
begin
 foreach t in array array['public.pcif_comment_members','public.pcif_comments','pcif_ops.teams','pcif_ops.memberships','pcif_ops.collaborators','pcif_ops.reports','pcif_ops.audit_events','pcif_ops.team_state','pcif_ops.checklist_items','pcif_ops.checklist_answers'] loop
  if to_regclass(t) is null then raise exception 'Tabela ausente: %',t; end if;
  if not (select relrowsecurity from pg_class where oid=to_regclass(t)) then raise exception 'RLS desabilitada: %',t; end if;
  if has_table_privilege('anon',t,'SELECT,INSERT,UPDATE,DELETE') then raise exception 'Permissão pública indevida: %',t; end if;
  if has_table_privilege('authenticated',t,'UPDATE,DELETE') then raise exception 'Mutação direta indevida: %',t; end if;
  if t<>'public.pcif_comments' and has_table_privilege('authenticated',t,'INSERT') then raise exception 'INSERT direto indevido: %',t; end if;
 end loop;
 foreach f in array array['public.pcif_has_access()','pcif_ops.stamp_report()','pcif_ops.live_session()','pcif_ops.password_ready(uuid)','pcif_ops.reader(text,text)','pcif_ops.operator_access()','public.pcif_ops_profile()','public.pcif_ops_snapshot()','public.pcif_ops_panel_snapshot()','public.pcif_ops_submit(uuid,text,jsonb,bigint)','public.pcif_ops_complete_password_change(uuid)'] loop
  if to_regprocedure(f) is null then raise exception 'Função ausente: %',f; end if;
  if has_function_privilege('anon',f,'EXECUTE') then raise exception 'EXECUTE anônimo: %',f; end if;
 end loop;
 if has_function_privilege('authenticated','public.pcif_ops_complete_password_change(uuid)','EXECUTE') or not has_function_privilege('service_role','public.pcif_ops_complete_password_change(uuid)','EXECUTE') then raise exception 'Liberação de senha com permissão indevida'; end if;
 foreach f in array array['public.pcif_has_access()','public.pcif_ops_profile()','public.pcif_ops_snapshot()','public.pcif_ops_panel_snapshot()','public.pcif_ops_submit(uuid,text,jsonb,bigint)'] loop
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

do $exact_catalog$
declare actual jsonb;begin
 select catalog into actual from (select jsonb_build_object(
 'functions',(select jsonb_agg(jsonb_build_object('name',n,'body',md5(replace(p.prosrc,E'\r\n',E'\n')),'definer',p.prosecdef,'config',p.proconfig,'volatility',p.provolatile::text) order by n) from unnest(array['public.pcif_has_access()','pcif_ops.stamp_report()','pcif_ops.live_session()','pcif_ops.password_ready(uuid)','pcif_ops.reader(text,text)','pcif_ops.operator_access()','public.pcif_ops_profile()','public.pcif_ops_snapshot()','public.pcif_ops_panel_snapshot()','public.pcif_ops_submit(uuid,text,jsonb,bigint)','public.pcif_ops_complete_password_change(uuid)']) n join pg_proc p on p.oid=to_regprocedure(n)),
 'policies',(select jsonb_agg(jsonb_build_object('schema',schemaname,'table',tablename,'name',policyname,'roles',roles,'command',cmd,'qual',qual,'check',with_check,'permissive',permissive) order by schemaname,tablename,policyname) from pg_policies where schemaname='pcif_ops' or schemaname='public' and tablename in ('pcif_comments','pcif_comment_members')),
 'columns',(select jsonb_agg(jsonb_build_object('table',table_schema||'.'||table_name,'column',column_name,'type',data_type,'nullable',is_nullable) order by table_schema,table_name,ordinal_position) from information_schema.columns where table_schema='pcif_ops' or table_schema='public' and table_name in ('pcif_comments','pcif_comment_members')),
 'teams',(select jsonb_agg(to_jsonb(t) order by id) from pcif_ops.teams t),
 'items',(select jsonb_agg(to_jsonb(i) order by id) from pcif_ops.checklist_items i)
) as catalog) reference;
 if actual<>'{"items":[{"id":1,"label":"Cartão de abastecimento externo","section":"vehicle","field_key":"vehicle.0","expected_quantity":null},{"id":2,"label":"Lanterna / Farol","section":"vehicle","field_key":"vehicle.1","expected_quantity":null},{"id":3,"label":"Para-choques","section":"vehicle","field_key":"vehicle.2","expected_quantity":null},{"id":4,"label":"Óleo de freio / Óleo de motor","section":"vehicle","field_key":"vehicle.3","expected_quantity":null},{"id":5,"label":"Luz de freio","section":"vehicle","field_key":"vehicle.4","expected_quantity":null},{"id":6,"label":"Luz de seta dianteira e traseira","section":"vehicle","field_key":"vehicle.5","expected_quantity":null},{"id":7,"label":"Limpador de para-brisa","section":"vehicle","field_key":"vehicle.6","expected_quantity":null},{"id":8,"label":"Limpeza interna e externa","section":"vehicle","field_key":"vehicle.7","expected_quantity":null},{"id":9,"label":"Lataria em geral","section":"vehicle","field_key":"vehicle.8","expected_quantity":null},{"id":10,"label":"Documento do veículo","section":"vehicle","field_key":"vehicle.9","expected_quantity":null},{"id":11,"label":"Rádio comunicador fixo","section":"vehicle","field_key":"vehicle.10","expected_quantity":null},{"id":12,"label":"Pasta de documentos","section":"vehicle","field_key":"vehicle.11","expected_quantity":null},{"id":13,"label":"Estepe","section":"vehicle","field_key":"vehicle.12","expected_quantity":null},{"id":14,"label":"Kit primeiros socorros — Nº 116","section":"cargo","field_key":"cargo.0","expected_quantity":1},{"id":15,"label":"Chave de porteira","section":"cargo","field_key":"cargo.1","expected_quantity":1},{"id":16,"label":"Chave de torre","section":"cargo","field_key":"cargo.2","expected_quantity":1},{"id":17,"label":"Tablet","section":"cargo","field_key":"cargo.3","expected_quantity":1},{"id":18,"label":"Binóculo","section":"cargo","field_key":"cargo.4","expected_quantity":1},{"id":19,"label":"Abafadores","section":"cargo","field_key":"cargo.5","expected_quantity":2},{"id":20,"label":"Enxadas","section":"cargo","field_key":"cargo.6","expected_quantity":3},{"id":21,"label":"Mochilas costais","section":"cargo","field_key":"cargo.7","expected_quantity":3},{"id":22,"label":"Bicos de mochilas costais","section":"cargo","field_key":"cargo.8","expected_quantity":3},{"id":23,"label":"Garrafões de água","section":"cargo","field_key":"cargo.9","expected_quantity":3},{"id":24,"label":"Foice","section":"cargo","field_key":"cargo.10","expected_quantity":1},{"id":25,"label":"Dosador","section":"cargo","field_key":"cargo.11","expected_quantity":1},{"id":26,"label":"Soprador Stihl","section":"cargo","field_key":"cargo.12","expected_quantity":1},{"id":27,"label":"Machado","section":"cargo","field_key":"cargo.13","expected_quantity":1},{"id":28,"label":"Kit de combate","section":"cargo","field_key":"cargo.14","expected_quantity":1},{"id":29,"label":"Bomba de sucção","section":"cargo","field_key":"cargo.15","expected_quantity":null},{"id":30,"label":"Spray inseticida para abelhas","section":"cargo","field_key":"cargo.16","expected_quantity":null},{"id":31,"label":"Vestimento de apicultor","section":"cargo","field_key":"cargo.17","expected_quantity":null},{"id":32,"label":"Pé de cabra","section":"cargo","field_key":"cargo.18","expected_quantity":1},{"id":33,"label":"Martelo","section":"cargo","field_key":"cargo.19","expected_quantity":1}],"teams":[{"id":"GAC 01","state":"São Paulo","region":"Noroeste"},{"id":"GAC 02","state":"São Paulo","region":"Centro"},{"id":"GAC 03","state":"São Paulo","region":"Norte"},{"id":"GAC 04","state":"São Paulo","region":"Centro"},{"id":"GAC 05","state":"São Paulo","region":"Noroeste"},{"id":"GAC 06","state":"São Paulo","region":"Sul"},{"id":"GAC 07","state":"Minas Gerais","region":"Minas Gerais"},{"id":"GAC 08","state":"São Paulo","region":"Sul"},{"id":"GAR 01","state":"São Paulo","region":"Norte"},{"id":"GAR 02","state":"São Paulo","region":"Noroeste"},{"id":"GAR 03","state":"São Paulo","region":"Norte"},{"id":"GAR 04","state":"São Paulo","region":"Norte"},{"id":"GAR 05","state":"São Paulo","region":"Noroeste"},{"id":"GAR 06","state":"São Paulo","region":"Norte"},{"id":"GAR 07","state":"São Paulo","region":"Centro"},{"id":"GAR 08","state":"São Paulo","region":"Centro"},{"id":"GAR 09","state":"São Paulo","region":"Centro"},{"id":"GAR 10","state":"São Paulo","region":"Centro"},{"id":"GAR 11","state":"São Paulo","region":"Centro"},{"id":"GAR 12","state":"São Paulo","region":"Centro"},{"id":"GAR 13","state":"São Paulo","region":"Sul"},{"id":"GAR 14","state":"São Paulo","region":"Sul"},{"id":"GAR 15","state":"São Paulo","region":"Sul"},{"id":"GAR 16","state":"São Paulo","region":"Sul"},{"id":"GAR 17","state":"São Paulo","region":"Sul"},{"id":"GAR 18","state":"São Paulo","region":"Sul"},{"id":"GAR 19","state":"São Paulo","region":"Noroeste"},{"id":"GAR 20","state":"São Paulo","region":"Noroeste"},{"id":"GAR 21","state":"Paraná","region":"Paraná"},{"id":"GAR 22","state":"Minas Gerais","region":"Minas Gerais"},{"id":"GAR 23","state":"Minas Gerais","region":"Minas Gerais"}],"columns":[{"type":"bigint","table":"pcif_ops.audit_events","column":"id","nullable":"NO"},{"type":"uuid","table":"pcif_ops.audit_events","column":"report_id","nullable":"NO"},{"type":"timestamp with time zone","table":"pcif_ops.audit_events","column":"created_at","nullable":"NO"},{"type":"uuid","table":"pcif_ops.checklist_answers","column":"report_id","nullable":"NO"},{"type":"integer","table":"pcif_ops.checklist_answers","column":"item_id","nullable":"NO"},{"type":"text","table":"pcif_ops.checklist_answers","column":"answer","nullable":"NO"},{"type":"text","table":"pcif_ops.checklist_answers","column":"problem","nullable":"YES"},{"type":"integer","table":"pcif_ops.checklist_answers","column":"quantity","nullable":"YES"},{"type":"integer","table":"pcif_ops.checklist_items","column":"id","nullable":"NO"},{"type":"text","table":"pcif_ops.checklist_items","column":"section","nullable":"NO"},{"type":"text","table":"pcif_ops.checklist_items","column":"label","nullable":"NO"},{"type":"integer","table":"pcif_ops.checklist_items","column":"expected_quantity","nullable":"YES"},{"type":"text","table":"pcif_ops.checklist_items","column":"field_key","nullable":"NO"},{"type":"uuid","table":"pcif_ops.collaborators","column":"id","nullable":"NO"},{"type":"text","table":"pcif_ops.collaborators","column":"name","nullable":"NO"},{"type":"boolean","table":"pcif_ops.collaborators","column":"active","nullable":"NO"},{"type":"uuid","table":"pcif_ops.memberships","column":"user_id","nullable":"NO"},{"type":"text","table":"pcif_ops.memberships","column":"team_id","nullable":"YES"},{"type":"text","table":"pcif_ops.memberships","column":"role","nullable":"NO"},{"type":"boolean","table":"pcif_ops.memberships","column":"must_change_password","nullable":"NO"},{"type":"boolean","table":"pcif_ops.memberships","column":"active","nullable":"NO"},{"type":"text","table":"pcif_ops.memberships","column":"environment","nullable":"NO"},{"type":"uuid","table":"pcif_ops.reports","column":"id","nullable":"NO"},{"type":"uuid","table":"pcif_ops.reports","column":"request_id","nullable":"NO"},{"type":"text","table":"pcif_ops.reports","column":"team_id","nullable":"NO"},{"type":"uuid","table":"pcif_ops.reports","column":"author_id","nullable":"NO"},{"type":"text","table":"pcif_ops.reports","column":"kind","nullable":"NO"},{"type":"timestamp with time zone","table":"pcif_ops.reports","column":"created_at","nullable":"NO"},{"type":"date","table":"pcif_ops.reports","column":"operational_date","nullable":"NO"},{"type":"jsonb","table":"pcif_ops.reports","column":"payload","nullable":"NO"},{"type":"text","table":"pcif_ops.reports","column":"environment","nullable":"NO"},{"type":"bigint","table":"pcif_ops.reports","column":"team_revision","nullable":"NO"},{"type":"text","table":"pcif_ops.reports","column":"status_before","nullable":"YES"},{"type":"text","table":"pcif_ops.reports","column":"status_after","nullable":"YES"},{"type":"text","table":"pcif_ops.team_state","column":"team_id","nullable":"NO"},{"type":"text","table":"pcif_ops.team_state","column":"environment","nullable":"NO"},{"type":"text","table":"pcif_ops.team_state","column":"status","nullable":"NO"},{"type":"text","table":"pcif_ops.team_state","column":"before_maintenance","nullable":"YES"},{"type":"bigint","table":"pcif_ops.team_state","column":"revision","nullable":"NO"},{"type":"timestamp with time zone","table":"pcif_ops.team_state","column":"updated_at","nullable":"NO"},{"type":"text","table":"pcif_ops.teams","column":"id","nullable":"NO"},{"type":"text","table":"pcif_ops.teams","column":"state","nullable":"NO"},{"type":"text","table":"pcif_ops.teams","column":"region","nullable":"NO"},{"type":"uuid","table":"public.pcif_comment_members","column":"user_id","nullable":"NO"},{"type":"boolean","table":"public.pcif_comment_members","column":"active","nullable":"NO"},{"type":"uuid","table":"public.pcif_comments","column":"id","nullable":"NO"},{"type":"uuid","table":"public.pcif_comments","column":"author_id","nullable":"NO"},{"type":"text","table":"public.pcif_comments","column":"analyst_name","nullable":"NO"},{"type":"text","table":"public.pcif_comments","column":"team_id","nullable":"YES"},{"type":"text","table":"public.pcif_comments","column":"body","nullable":"NO"},{"type":"timestamp with time zone","table":"public.pcif_comments","column":"created_at","nullable":"NO"}],"policies":[{"name":"read_audit","qual":"(EXISTS ( SELECT 1\n   FROM pcif_ops.reports r\n  WHERE (r.id = audit_events.report_id)))","check":null,"roles":["authenticated"],"table":"audit_events","schema":"pcif_ops","command":"SELECT","permissive":"PERMISSIVE"},{"name":"read_answers","qual":"(EXISTS ( SELECT 1\n   FROM pcif_ops.reports r\n  WHERE (r.id = checklist_answers.report_id)))","check":null,"roles":["authenticated"],"table":"checklist_answers","schema":"pcif_ops","command":"SELECT","permissive":"PERMISSIVE"},{"name":"read_items","qual":"(pcif_ops.live_session() AND (EXISTS ( SELECT 1\n   FROM pcif_ops.memberships m\n  WHERE ((m.user_id = auth.uid()) AND m.active AND pcif_ops.reader(COALESCE(m.team_id, ''''::text), m.environment)))))","check":null,"roles":["authenticated"],"table":"checklist_items","schema":"pcif_ops","command":"SELECT","permissive":"PERMISSIVE"},{"name":"read_collaborators","qual":"pcif_ops.operator_access()","check":null,"roles":["authenticated"],"table":"collaborators","schema":"pcif_ops","command":"SELECT","permissive":"PERMISSIVE"},{"name":"own_membership","qual":"((user_id = auth.uid()) AND active AND pcif_ops.live_session())","check":null,"roles":["authenticated"],"table":"memberships","schema":"pcif_ops","command":"SELECT","permissive":"PERMISSIVE"},{"name":"read_reports","qual":"pcif_ops.reader(team_id, environment)","check":null,"roles":["authenticated"],"table":"reports","schema":"pcif_ops","command":"SELECT","permissive":"PERMISSIVE"},{"name":"read_state","qual":"pcif_ops.reader(team_id, environment)","check":null,"roles":["authenticated"],"table":"team_state","schema":"pcif_ops","command":"SELECT","permissive":"PERMISSIVE"},{"name":"read_teams","qual":"(EXISTS ( SELECT 1\n   FROM pcif_ops.memberships m\n  WHERE ((m.user_id = auth.uid()) AND m.active AND pcif_ops.reader(teams.id, m.environment))))","check":null,"roles":["authenticated"],"table":"teams","schema":"pcif_ops","command":"SELECT","permissive":"PERMISSIVE"},{"name":"members_read_self","qual":"((user_id = ( SELECT auth.uid() AS uid)) AND active AND ( SELECT pcif_has_access() AS pcif_has_access))","check":null,"roles":["authenticated"],"table":"pcif_comment_members","schema":"public","command":"SELECT","permissive":"PERMISSIVE"},{"name":"comments_insert_members","qual":null,"check":"((author_id = ( SELECT auth.uid() AS uid)) AND ( SELECT pcif_has_access() AS pcif_has_access))","roles":["authenticated"],"table":"pcif_comments","schema":"public","command":"INSERT","permissive":"PERMISSIVE"},{"name":"comments_read_members","qual":"( SELECT pcif_has_access() AS pcif_has_access)","check":null,"roles":["authenticated"],"table":"pcif_comments","schema":"public","command":"SELECT","permissive":"PERMISSIVE"}],"functions":[{"body":"0dc7fbfcad03870398d7fd026be510d4","name":"pcif_ops.live_session()","config":["search_path=\"\""],"definer":true,"volatility":"s"},{"body":"ad6da98b0c57352c5d273991697369fd","name":"pcif_ops.operator_access()","config":["search_path=\"\""],"definer":true,"volatility":"s"},{"body":"b7b1a91ea55151c3db73460c7974f6b8","name":"pcif_ops.password_ready(uuid)","config":["search_path=\"\""],"definer":true,"volatility":"s"},{"body":"fd0d30f30e56386e097db7d55e20f0f7","name":"pcif_ops.reader(text,text)","config":["search_path=\"\""],"definer":true,"volatility":"s"},{"body":"91ad5c241f61a4e08761ffb0028aa2c9","name":"pcif_ops.stamp_report()","config":["search_path=\"\""],"definer":false,"volatility":"v"},{"body":"72782c7877d262b952386d985aea4d40","name":"public.pcif_has_access()","config":["search_path=\"\""],"definer":true,"volatility":"s"},{"body":"3fa72f77e8caff1806e9ea857f844431","name":"public.pcif_ops_complete_password_change(uuid)","config":["search_path=\"\""],"definer":true,"volatility":"v"},{"body":"eb752a51473120ae361622a635164cdc","name":"public.pcif_ops_panel_snapshot()","config":["search_path=\"\""],"definer":true,"volatility":"s"},{"body":"f8674c2b39b436fb7fad2c2a2fc9a6d1","name":"public.pcif_ops_profile()","config":["search_path=\"\""],"definer":true,"volatility":"s"},{"body":"461c0463b21e0e95463d23e3c3786b35","name":"public.pcif_ops_snapshot()","config":["search_path=\"\""],"definer":true,"volatility":"s"},{"body":"f3144323093e390177f616a6fee570d0","name":"public.pcif_ops_submit(uuid,text,jsonb,bigint)","config":["search_path=\"\""],"definer":true,"volatility":"v"}]}'::jsonb then raise exception 'Definições/políticas/catálogos diferem da referência revisada. Transação cancelada.'; end if;
end $exact_catalog$;
commit;
select 'validated' as status,'exemploprojetoref000' as project_ref,(select count(*) from pcif_bootstrap.migrations) as migrations,(select count(*) from pcif_ops.teams) as teams,(select count(*) from pcif_ops.checklist_items) as checklist_items;
