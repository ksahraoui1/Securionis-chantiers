-- MFA pour les comptes ayant un facteur vérifié. À appliquer avant le code.
-- Les comptes non enrôlés conservent le parcours existant d'enrôlement.
begin;

create or replace function public.session_mfa_valide()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select auth.uid() is not null and (
    coalesce(auth.jwt()->>'aal', 'aal1') = 'aal2'
    or not exists (
      select 1 from auth.mfa_factors
      where user_id = auth.uid() and status = 'verified'
    )
  );
$$;
revoke all on function public.session_mfa_valide() from public, anon;
grant execute on function public.session_mfa_valide() to authenticated, service_role;

-- Une règle restrictive s'ajoute en ET à toutes les règles permissives.
-- Elle n'accorde aucun droit métier supplémentaire. Les nouvelles tables
-- devront recevoir la même règle dans leur propre migration.
do $$
declare t record;
begin
  for t in
    select n.nspname, c.relname from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where (n.nspname = 'public' or (n.nspname = 'storage' and c.relname = 'objects'))
      and c.relkind in ('r', 'p') and c.relrowsecurity
  loop
    execute format('drop policy if exists session_mfa_requise on %I.%I', t.nspname, t.relname);
    execute format(
      'create policy session_mfa_requise on %I.%I as restrictive for all to authenticated using ((select public.session_mfa_valide())) with check ((select public.session_mfa_valide()))',
      t.nspname, t.relname
    );
  end loop;
end;
$$;
commit;
