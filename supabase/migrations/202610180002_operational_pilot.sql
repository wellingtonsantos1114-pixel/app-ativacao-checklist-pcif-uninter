-- Revisar e executar SOMENTE em homologação. Requer as duas migrações de Auth/comentários
-- já existentes no painel e 202610180001 deste app. Não altera tabelas de comentários.
begin;
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
commit;
