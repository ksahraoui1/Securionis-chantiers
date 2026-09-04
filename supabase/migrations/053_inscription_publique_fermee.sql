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
-- fermeture doit être portée par la base, seul endroit que le client ne
-- contourne pas.
--
-- Le discriminant : `auth.admin.createUser()` peut poser des `app_metadata`,
-- `signUp` non. La route `admin/create-user` y écrit `{"cree_par":"admin"}`.
--
-- ⚠️ **`app_metadata` et non `user_metadata`** : le premier n'est modifiable
-- que par le `service_role`, le second l'est par le titulaire du compte
-- lui-même (`auth.updateUser({ data: … })`). Fondé sur `user_metadata`, ce
-- contrôle serait contournable en une requête depuis le navigateur.

-- ---------------------------------------------------------------------------
-- ⚠️ Pourquoi un déclencheur DIFFÉRÉ, et non `AFTER INSERT`
-- ---------------------------------------------------------------------------
--
-- La première version posait la garde dans `handle_new_user`, en `AFTER
-- INSERT`. **Elle bloquait aussi la création par un administrateur**, et c'est
-- le test qui l'a montré, pas le raisonnement.
--
-- Mesuré : GoTrue **insère la ligne d'abord, puis applique `app_metadata` par
-- une mise à jour**. Ce que voit un `AFTER INSERT` :
--
--   vu par le déclencheur : {"provider": "email", "providers": ["email"]}
--   état final de la ligne : {"cree_par":"admin","provider":"email", …}
--
-- Le marqueur n'existe donc pas encore au moment de l'insertion, quel que
-- soit le chemin. Un déclencheur de contrainte `DEFERRABLE INITIALLY DEFERRED`
-- s'exécute en revanche à la **validation de la transaction**, quand la mise à
-- jour de GoTrue est faite — et il relit la ligne plutôt que de se fier à
-- `NEW`, qui porte l'état de l'insertion.
--
-- Corollaire général : **toute règle fondée sur `app_metadata` doit être
-- différée.** En `AFTER INSERT`, elle ne verra jamais que les métadonnées
-- posées par le fournisseur d'identité.

create or replace function public.refuser_inscription_publique()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_catalog'
as $$
declare marqueur text;
begin
  -- Relecture de la ligne, et non `new` : c'est tout l'intérêt du différé.
  select u.raw_app_meta_data->>'cree_par' into marqueur
  from auth.users u where u.id = new.id;

  if coalesce(marqueur, '') <> 'admin' then
    raise exception
      'Inscription publique fermée : les comptes sont créés par un administrateur (migration 053).'
      using errcode = 'insufficient_privilege';
  end if;
  return null;
end;
$$;

-- Le privilège d'exécution vient du pseudo-rôle PUBLIC **et** de grants directs
-- que Supabase pose sur `anon` et `authenticated` (piège n° 10). Les deux sont
-- retirés : cette fonction n'a aucun sens hors de son déclencheur.
revoke execute on function public.refuser_inscription_publique() from public, anon, authenticated;
grant execute on function public.refuser_inscription_publique() to service_role;

drop trigger if exists verifier_creation_compte on auth.users;

create constraint trigger verifier_creation_compte
  after insert on auth.users
  deferrable initially deferred
  for each row execute function public.refuser_inscription_publique();

-- `handle_new_user` reste inchangé dans son rôle : créer le profil au rôle le
-- moins privilégié. `admin/create-user` applique ensuite le rôle demandé avec
-- le `service_role`, et supprime le compte Auth si cette seconde écriture
-- échoue.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_catalog'
as $$
begin
  insert into public.profiles (id, nom, email, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'nom', ''), new.email, 'invité')
  on conflict (id) do nothing;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- ⚠️ ORDRE DE DÉPLOIEMENT : le code d'abord, cette migration ensuite
-- ---------------------------------------------------------------------------
--
-- Appliquée avant que `admin/create-user` ne pose le marqueur, elle
-- empêcherait aussi l'administrateur de créer un compte. Même sens que les
-- migrations 046 et 048, l'inverse de la 045.
--
-- ---------------------------------------------------------------------------
-- Créer un compte quand l'application est indisponible
-- ---------------------------------------------------------------------------
--
-- Depuis le tableau de bord Supabase, « Add user » et « Invite » échouent : la
-- console ne pose pas le marqueur. Deux issues, dans cet ordre :
--
--   1. Par l'API d'administration, en passant explicitement
--      `app_metadata: { cree_par: "admin" }` — c'est ce que fait la route
--      `admin/create-user`, qui reste le chemin normal.
--   2. En dernier recours, lever le déclencheur le temps de l'opération :
--        alter table auth.users disable trigger verifier_creation_compte;
--        -- créer le compte
--        alter table auth.users enable trigger verifier_creation_compte;
--
-- ---------------------------------------------------------------------------
-- Ce que cette migration ne fait pas
-- ---------------------------------------------------------------------------
--
-- Elle n'empêche pas GoTrue d'accepter la requête `signUp` : elle la fait
-- échouer à la validation, ce qui suffit — aucun compte n'existe à l'issue,
-- vérifié. Le réglage « Allow new users to sign up » du tableau de bord reste
-- recommandé **en complément** : il refuse plus tôt, avec un message propre,
-- et il tient même si ce déclencheur venait à être retiré.
--
-- ---------------------------------------------------------------------------
-- Vérification, jouée en production
-- ---------------------------------------------------------------------------
--
-- De bout en bout, par le SDK, avec une adresse réellement distribuable
-- (`@example.com` est rejeté par GoTrue avant d'atteindre la base, et les
-- essais répétés butent sur sa limite d'envoi d'emails — deux faux négatifs
-- rencontrés en chemin) :
--
--   signUp public                  → refusé, **aucun compte laissé en base**
--   création par un administrateur → acceptée, profil créé au rôle « invité »
--   comptes en base après coup     → 3, les trois d'origine
--
-- Puis en SQL, de façon déterministe et sans dépendre d'aucun quota, dans une
-- transaction annulée, `set constraints all immediate` forçant le déclencheur
-- différé à se prononcer :
--
--   insertion sans marqueur → **refusée, SQLSTATE 42501**
--   insertion avec marqueur → acceptée
-- ---------------------------------------------------------------------------
