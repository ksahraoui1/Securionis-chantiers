-- 045 : SEC-01 — restreindre l'écriture sur les chantiers
--
-- La politique `chantiers_inspecteur_update` était définie avec
-- `USING (true)` et `WITH CHECK (true)` pour le rôle `authenticated`.
-- Une politique permissive s'ajoute aux autres en OU : celle-ci ne
-- restreignait donc rien du tout. Tout porteur d'un jeton `authenticated`
-- pouvait écrire sur n'importe quelle ligne de `chantiers` — renommer,
-- réaffecter `created_by`, archiver l'ensemble en une requête.
--
-- `/register` étant une route publique du middleware, n'importe qui pouvait
-- obtenir ce jeton : la clé anonyme est publique par nature, et il suffisait
-- d'un PATCH sur /rest/v1/chantiers. Atteinte à l'intégrité et à la
-- disponibilité des données (la lecture, elle, restait fermée).
--
-- `chantiers_admin_all` continue de couvrir l'administrateur.

-- ---------------------------------------------------------------------------
-- 1. Le périmètre réellement voulu : l'inspecteur assigné, ou le créateur.
-- ---------------------------------------------------------------------------

drop policy if exists chantiers_inspecteur_update on public.chantiers;

create policy chantiers_inspecteur_update on public.chantiers
  for update to authenticated
  using (
    created_by = (select auth.uid())
    or exists (
      select 1 from public.chantier_inspecteurs ci
      where ci.chantier_id = chantiers.id
        and ci.inspecteur_id = (select auth.uid())
    )
  )
  with check (
    created_by = (select auth.uid())
    or exists (
      select 1 from public.chantier_inspecteurs ci
      where ci.chantier_id = chantiers.id
        and ci.inspecteur_id = (select auth.uid())
    )
  );

-- `(select auth.uid())` plutôt que `auth.uid()` : sans le sous-select, la
-- fonction est réévaluée à chaque ligne examinée (avertissement Supabase
-- `auth_rls_initplan`). Ici c'est gratuit, autant l'écrire correctement.

-- ---------------------------------------------------------------------------
-- 2. `created_by` devient immuable.
-- ---------------------------------------------------------------------------
--
-- Sans cela, la politique ci-dessus laisse une brèche : un inspecteur assigné
-- à un chantier satisfait la clause `exists`, donc son WITH CHECK passe quelle
-- que soit la valeur qu'il donne à `created_by`. Il pourrait ainsi désigner un
-- compte arbitraire comme créateur — et lui accorder du même coup le droit
-- d'écriture que la clause `created_by` confère. Une politique RLS ne peut pas
-- comparer NEW et OLD ; il faut un trigger.
--
-- Même forme que `enforce_role_immutability` sur `profiles` : le rôle
-- `service_role` en est exempté, ce qui laisse les routes API serveur libres
-- d'agir. Vérifié avant écriture : ni `chantier-form.tsx` ni
-- `archive-toggle-button.tsx` — les deux seuls écrivains de la table —
-- n'envoient `created_by` dans leur payload.

create or replace function public.enforce_chantier_owner_immutability()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if current_user = 'service_role' then
    return new;
  end if;

  if new.created_by is distinct from old.created_by then
    raise exception 'La modification du créateur du chantier n''est pas autorisée';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_chantier_owner_immutability on public.chantiers;

create trigger enforce_chantier_owner_immutability
  before update on public.chantiers
  for each row
  execute function public.enforce_chantier_owner_immutability();

-- Le privilège EXECUTE d'une fonction de trigger vient du pseudo-rôle PUBLIC ;
-- la révoquer au seul rôle `anon` serait sans effet (cf. migration 040).
-- Elle n'a de toute façon pas de sens hors du trigger : on la retire de l'API.
revoke execute on function public.enforce_chantier_owner_immutability() from public;
grant execute on function public.enforce_chantier_owner_immutability() to service_role;
