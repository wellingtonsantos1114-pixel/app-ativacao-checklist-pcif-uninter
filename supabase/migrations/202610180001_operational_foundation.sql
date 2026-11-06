-- SOMENTE HOMOLOGAÇÃO, mediante revisão. Não executada pelo frontend/setup.
begin;
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
commit;
