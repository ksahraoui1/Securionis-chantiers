-- 046 : SEC-02 — le journal d'audit n'est plus falsifiable
--
-- `audit_logs_insert` était définie `WITH CHECK (true)` pour le rôle
-- `authenticated`. N'importe quel compte connecté pouvait donc y insérer une
-- ligne arbitraire : s'attribuer un envoi, en imputer un à quelqu'un d'autre,
-- ou noyer une action dans du bruit.
--
-- Impact concret et vérifiable : la page rapport d'une visite affiche son
-- historique d'envoi en lisant `audit_logs` filtré sur
-- (action, resource_id). Un tiers pouvait donc y faire apparaître des envois
-- qui n'ont jamais eu lieu, sur une visite qui ne lui appartient pas.
--
-- Sur une application de sécurité au travail, dont les rapports peuvent être
-- produits après un accident, la traçabilité est précisément ce qu'on demande
-- au journal.
--
-- Le journal devient **en ajout seul, et écrit par le serveur uniquement**.
-- Les huit sites d'écriture de l'application passent désormais par
-- `journaliser()` (`src/lib/audit.ts`), qui utilise le `service_role` — lequel
-- contourne la RLS et n'existe que côté serveur. Vérifié avant écriture : les
-- huit renseignaient déjà `user_id` avec l'utilisateur authentifié, et aucun
-- composant client n'écrit dans cette table.

-- ---------------------------------------------------------------------------
-- 1. Plus aucune écriture depuis un jeton de navigateur.
-- ---------------------------------------------------------------------------

drop policy if exists audit_logs_insert on public.audit_logs;

-- Les privilèges de table sont accordés directement à `anon` et
-- `authenticated` par Supabase (et non hérités de PUBLIC comme pour les
-- fonctions, cf. migration 040) : les révoquer sur ces rôles suffit.
-- `anon` les portait aussi, sans politique pour s'en servir — autant retirer
-- la surface.
revoke insert, update, delete, truncate on public.audit_logs from anon, authenticated;

-- `audit_logs_select` est conservée telle quelle : lecture réservée à
-- l'administrateur. La page rapport lit l'historique via le `serviceClient`,
-- après avoir vérifié l'autorisation elle-même.

-- ---------------------------------------------------------------------------
-- 2. Le journal est en ajout seul, y compris pour le service_role.
-- ---------------------------------------------------------------------------
--
-- Rien ne doit réécrire l'histoire — pas même l'application. La révocation
-- ci-dessus ne couvre que les jetons de navigateur ; ce trigger ajoute le
-- `service_role`, ce qui protège le journal d'une route serveur compromise ou
-- d'une erreur de code.
--
-- Les rôles d'administration de la base en sont exemptés : une purge de
-- conservation (cf. DAT-02) doit rester possible depuis une migration, sans
-- avoir à désactiver puis réactiver le trigger — manœuvre qu'on oublie de
-- défaire.
--
-- ⚠️ Trigger `for each statement` : la valeur de retour est ignorée, seul un
-- `raise` interrompt la commande. `return null` laisse donc passer.

create or replace function public.audit_logs_ajout_seul()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if current_user in ('postgres', 'supabase_admin') then
    return null;
  end if;
  raise exception 'Le journal d''audit est en ajout seul : % refusé', tg_op;
end;
$$;

drop trigger if exists audit_logs_ajout_seul on public.audit_logs;

create trigger audit_logs_ajout_seul
  before update or delete on public.audit_logs
  for each statement
  execute function public.audit_logs_ajout_seul();

revoke execute on function public.audit_logs_ajout_seul() from public;
grant execute on function public.audit_logs_ajout_seul() to service_role;
