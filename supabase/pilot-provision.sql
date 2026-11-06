-- TEMPLATE ADMINISTRATIVO. Não foi executado em Supabase hospedado.
-- Usar exclusivamente no projeto de homologação, após criar os dois usuários
-- fictícios via Authentication > Users. Não cria contas nem contém senhas.
begin;
do $$
declare operator_id uuid; analyst_id uuid;
begin
 select id into operator_id from auth.users
 where email='gar23@pcif-operators.invalid' and encrypted_password is not null and length(encrypted_password)>0;
 select id into analyst_id from auth.users where email='analyst-pilot@pcif-operators.invalid';
 if operator_id is null or analyst_id is null then raise exception 'Crie primeiro os dois usuários fictícios no Auth de homologação'; end if;
 if exists(select 1 from pcif_ops.memberships where user_id in(operator_id,analyst_id)) then
  raise exception 'Perfil já existe: inspecione antes de alterar. Nada foi substituído.';
 end if;
 insert into pcif_ops.memberships(user_id,team_id,role,environment,must_change_password)
 values(operator_id,'GAR 23','team','pilot',true),(analyst_id,null,'analyst','pilot',false);
 -- Autoriza o analista piloto pelo mecanismo EXISTENTE do painel, sem tocar nos comentários.
 insert into public.pcif_comment_members(user_id) values(analyst_id) on conflict(user_id) do nothing;
end $$;
commit;
