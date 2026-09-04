-- 053 : APP-02 (audit du 4 septembre 2026) — l'inscription publique est fermée
--
-- Chaque défaut de la forme « tout compte connecté peut… » devenait
-- exploitable à distance, sans hameçonnage ni mot de passe volé : il suffisait
-- de trente secondes sur `/register` pour obtenir un jeton `authenticated`.
-- C'est ce qui rendait SEC-01 (écriture dans le stockage, migration 051)
-- atteignable depuis Internet, et APP-01 (envoi d'email depuis le domaine
-- vérifié) exploitable par n'importe qui.
--
-- ⚠️ **Retirer la page ne ferme rien.** `supabase.auth.signUp` est appelable
-- directement avec la clé publique, qui est publique par construction — c'est
-- le piège n° 51 du projet, déjà consigné pour la règle de mot de passe. La
-- fermeture doit donc être portée par la base, seul endroit que le client ne
-- contourne pas.
--
-- Le discriminant : `auth.admin.createUser()` peut poser des `app_metadata`,
-- `signUp` non. La route `admin/create-user` y écrit `{"cree_par":"admin"}`,
-- et ce déclencheur refuse tout compte qui ne le porte pas.
--
-- ⚠️ **`app_metadata` et non `user_metadata`** : le premier n'est modifiable
-- que par le `service_role`, le second l'est par le titulaire du compte lui-même
-- (`auth.updateUser({ data: … })`). Fondé sur `user_metadata`, ce contrôle
-- serait contournable en une requête depuis le navigateur.
--
-- ⚠️ **ORDRE DE DÉPLOIEMENT : le code d'abord, cette migration ensuite.**
-- Appliquée avant que `admin/create-user` ne pose le marqueur, elle
-- empêcherait aussi l'administrateur de créer un compte. Même sens que les
-- migrations 046 et 048, l'inverse de la 045.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_catalog'
as $$
begin
  -- Inscription publique : refusée. L'exception annule l'insertion dans
  -- `auth.users`, donc aucun compte n'est créé — le déclencheur est `AFTER
  -- INSERT`, mais il s'exécute dans la transaction de l'insertion.
  if coalesce(new.raw_app_meta_data->>'cree_par', '') <> 'admin' then
    raise exception
      'Inscription publique fermée : les comptes sont créés par un administrateur (voir migration 053).'
      using errcode = 'insufficient_privilege';
  end if;

  insert into public.profiles (id, nom, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nom', ''),
    new.email,
    -- Le rôle réellement demandé est appliqué juste après par
    -- `admin/create-user`, qui écrit avec le `service_role`. Le défaut reste
    -- le rôle le moins privilégié : un échec de cette seconde écriture laisse
    -- un compte inoffensif, et la route supprime alors le compte Auth.
    'invité'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

-- Le privilège d'exécution vient du pseudo-rôle PUBLIC **et** de grants directs
-- que Supabase pose sur `anon` et `authenticated` (piège n° 10). Les deux sont
-- retirés : cette fonction n'a aucun sens hors de son déclencheur.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.handle_new_user() to service_role;

-- ---------------------------------------------------------------------------
-- Créer un compte quand l'application est indisponible
-- ---------------------------------------------------------------------------
--
-- Depuis le tableau de bord Supabase, « Add user » échouera : la console ne
-- pose pas le marqueur. Deux issues, dans cet ordre de préférence :
--
--   1. Créer le compte par l'API d'administration en passant explicitement
--      `app_metadata: { cree_par: "admin" }` — c'est ce que fait la route
--      `admin/create-user`, qui reste le chemin normal.
--   2. En dernier recours, lever le déclencheur le temps de l'opération :
--        alter table auth.users disable trigger on_auth_user_created;
--        -- créer le compte, puis renseigner public.profiles à la main
--        alter table auth.users enable trigger on_auth_user_created;
--
-- ---------------------------------------------------------------------------
-- Ce que cette migration ne fait pas
-- ---------------------------------------------------------------------------
--
-- Elle n'empêche pas GoTrue d'accepter la requête `signUp` : elle la fait
-- échouer à l'écriture, ce qui suffit — aucun compte n'existe à l'issue. Le
-- réglage « Allow new users to sign up » du tableau de bord reste recommandé
-- en complément : il refuse la requête plus tôt, avec un message propre, et il
-- tient même si ce déclencheur venait à être retiré.
--
-- ---------------------------------------------------------------------------
-- Vérification (jouée en production après application)
-- ---------------------------------------------------------------------------
--
--   insertion sans marqueur          → refusée, SQLSTATE 42501
--   insertion avec {"cree_par":"admin"} → acceptée, profil créé au rôle invité
--   comptes existants                 → intacts, le déclencheur ne vise que
--                                       les insertions
-- ---------------------------------------------------------------------------
