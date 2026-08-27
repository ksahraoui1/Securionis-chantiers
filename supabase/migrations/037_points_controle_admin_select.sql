-- 037 — Les administrateurs doivent voir les points de contrôle désactivés.
--
-- Appliquée le 2026-08-27 depuis le SQL Editor Supabase.
--
-- Problème : la policy `pc_select_active` limite la lecture à `actif = true`
-- pour tous les rôles, administrateurs compris, et aucune autre policy SELECT
-- ne couvre les points inactifs. Conséquence sur /admin/points-controle :
--   - le bouton « Désactiver » fonctionne (pc_update_admin autorise l'UPDATE)
--   - mais le point disparaît aussitôt de la liste
--   - et le filtre « Désactivés uniquement » ne renvoie jamais rien
--   → le bouton « Réactiver » est inatteignable, le point est irrécupérable
--     depuis l'interface.
--
-- Les policies permissives s'additionnent (OR) : les non-administrateurs
-- restent limités aux points actifs, les administrateurs voient l'ensemble.

drop policy if exists pc_select_admin on public.points_controle;

create policy pc_select_admin on public.points_controle
  for select
  to authenticated
  using (public.user_role() = 'administrateur');
