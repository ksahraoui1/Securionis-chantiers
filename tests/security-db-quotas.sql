\set ON_ERROR_STOP on
\connect securionis_tenant_test
\ir ../supabase/migrations/065_quotas_bornes.sql
begin;
set local role service_role;
do $$ begin
 if not public.consommer_quota('recette:quota',2,60) or not public.consommer_quota('recette:quota',2,60) or public.consommer_quota('recette:quota',2,60) then raise exception 'Quota incorrect';end if;
 begin perform public.consommer_quota('recette:quota',0,60);raise exception 'Borne ignorée';exception when invalid_parameter_value then null;end;
end $$;
reset role;
update public.rate_limits set compteur=2147483647 where cle='recette:quota';
set local role service_role;
do $$ begin if public.consommer_quota('recette:quota',2,60) then raise exception 'Débordement';end if;end $$;
reset role;
set local role authenticated;
do $$ begin begin perform public.consommer_quota('recette:quota',2,60);raise exception 'Accès client autorisé';exception when insufficient_privilege then null;end;end $$;
rollback;
\echo QUOTAS_TESTS_OK
