-- 039 — Durcissement des fonctions SECURITY DEFINER (audit sécurité 2026-08-28)
--
-- Deux avertissements du linter Supabase, sur trois fonctions :
--
-- 1. `search_path` mutable : une fonction SECURITY DEFINER sans search_path fixe
--    peut être détournée si un appelant place un objet homonyme dans un schéma
--    prioritaire (table `profiles` factice, par exemple). La fonction s'exécute
--    avec les droits de son propriétaire — l'impact serait une élévation.
--
-- 2. Fonctions exposées en RPC : `handle_new_user`, `prevent_user_self_role_change`
--    et `user_role` sont appelables via /rest/v1/rpc/... par `anon` et
--    `authenticated`. Les deux premières sont des fonctions trigger et n'ont
--    aucune raison d'être appelables directement. `user_role` est utilisée par
--    les policies RLS : elle doit rester exécutable par les rôles applicatifs.
--
-- Révoquer EXECUTE n'empêche pas le déclenchement des triggers : le privilège
-- n'est vérifié qu'à la création du trigger, pas à son exécution.

-- ---------------------------------------------------------------------------
-- 1. search_path fixe
-- ---------------------------------------------------------------------------

alter function public.handle_new_user() set search_path = public, pg_catalog;
alter function public.prevent_user_self_role_change() set search_path = public, pg_catalog;
alter function public.user_role() set search_path = public, pg_catalog;

-- ---------------------------------------------------------------------------
-- 2. Retrait de l'exposition RPC des fonctions trigger
-- ---------------------------------------------------------------------------

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.prevent_user_self_role_change() from public, anon, authenticated;

-- `user_role()` reste exécutable : les policies RLS l'appellent pour le compte
-- de l'utilisateur courant. On retire seulement l'accès anonyme.
revoke execute on function public.user_role() from anon;
