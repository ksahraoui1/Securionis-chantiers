-- 040 — Compléter le retrait de l'accès anonyme à user_role().
--
-- La migration 039 révoquait EXECUTE sur `anon`, sans effet : le privilège est
-- accordé au pseudo-rôle PUBLIC, dont anon hérite. Il faut révoquer sur PUBLIC
-- puis ré-accorder explicitement aux rôles qui en ont besoin.
--
-- `authenticated` doit le conserver : les policies RLS appellent user_role()
-- dans le contexte de l'utilisateur courant. L'avertissement du linter Supabase
-- sur ce point est donc assumé — le retirer casserait la RLS.
--
-- Appliquée le 2026-08-28.

revoke execute on function public.user_role() from public, anon;

grant execute on function public.user_role() to authenticated, service_role;
