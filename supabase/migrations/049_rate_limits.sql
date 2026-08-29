-- 049 : DET-02 — le limiteur de débit survit aux déploiements
--
-- `src/lib/rate-limit.ts` tenait ses compteurs dans une `Map` en mémoire de
-- processus. Or déployer consiste à reconstruire et remplacer le conteneur :
-- **chaque mise à jour rendait son quota à tout le monde**. Sur les fenêtres
-- d'une heure — et il n'y a que des fenêtres d'une heure — un déploiement
-- annulait la limite en cours.
--
-- L'impact restait faible sur un conteneur unique et un usage interne. Il
-- devient réel dès qu'on met plusieurs répliques derrière le proxy (chacune
-- avec sa propre `Map`, donc N fois le quota) ou qu'un compte abuse d'une route
-- coûteuse comme `photos/analyze`, qui appelle l'API Anthropic et se facture.
--
-- Postgres plutôt que Redis : la base est déjà là, l'opération tient en une
-- instruction atomique, et cela n'ajoute ni service à exploiter ni dépendance.

create table if not exists public.rate_limits (
  cle          text        primary key,
  compteur     integer     not null,
  fenetre_fin  timestamptz not null
);

comment on table public.rate_limits is
  'Compteurs du limiteur de débit. Clé = "<route>:<utilisateur>". Purge opportuniste, voir consommer_quota().';

-- Les clés sont bornées (nombre de routes × nombre de comptes) et la purge
-- ci-dessous suffit ; l'index sert à cette purge.
create index if not exists idx_rate_limits_fenetre on public.rate_limits (fenetre_fin);

-- Aucune politique : RLS activée sans policy ferme la table à `anon` comme à
-- `authenticated`. Seul le `service_role` y accède — et il contourne la RLS —
-- via la fonction ci-dessous, appelée uniquement depuis les routes serveur.
alter table public.rate_limits enable row level security;

-- ---------------------------------------------------------------------------
-- Consommation d'un jeton, en une seule instruction atomique.
-- ---------------------------------------------------------------------------
--
-- `insert … on conflict do update` prend un verrou de ligne : deux appels
-- concurrents sur la même clé se sérialisent, aucun ne peut lire un compteur
-- périmé. C'est ce qui rend inutile toute transaction explicite.
--
-- Dans la clause `do update`, l'alias `r` désigne la ligne **existante** et
-- `RETURNING` renvoie la ligne **après** mise à jour — d'où le compteur à jour.

create or replace function public.consommer_quota(
  p_cle       text,
  p_max       integer,
  p_fenetre_s integer
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_compteur integer;
begin
  insert into public.rate_limits as r (cle, compteur, fenetre_fin)
  values (p_cle, 1, now() + make_interval(secs => p_fenetre_s))
  on conflict (cle) do update
    set compteur = case
          when r.fenetre_fin <= now() then 1
          else r.compteur + 1
        end,
        fenetre_fin = case
          when r.fenetre_fin <= now() then now() + make_interval(secs => p_fenetre_s)
          else r.fenetre_fin
        end
  returning r.compteur into v_compteur;

  -- Purge opportuniste : un appel sur cent nettoie les fenêtres closes depuis
  -- plus d'un jour. Évite une tâche planifiée pour une table qui reste petite.
  if random() < 0.01 then
    delete from public.rate_limits where fenetre_fin < now() - interval '1 day';
  end if;

  return v_compteur <= p_max;
end;
$$;

-- ---------------------------------------------------------------------------
-- Fermeture de l'accès direct à la fonction.
-- ---------------------------------------------------------------------------
--
-- ⚠️ Point trouvé en éprouvant cette migration, et qui vaut pour toutes les
-- précédentes : **`revoke … from public` ne suffit pas**. Supabase accorde
-- `EXECUTE` *directement* aux rôles `anon` et `authenticated` sur toute
-- nouvelle fonction du schéma `public` (via `alter default privileges`).
-- Révoquer sur le pseudo-rôle `PUBLIC` laisse donc les grants directs intacts.
--
-- Ici l'enjeu est réel : `consommer_quota` renvoie un `boolean`, elle est donc
-- exposée par PostgREST sur `/rest/v1/rpc/`. Un compte connecté pourrait
-- appeler `consommer_quota('photo-analyze:<autre-utilisateur>', 1, 3600)` en
-- boucle et **épuiser le quota de quelqu'un d'autre** — un déni de service
-- ciblé, en une requête.

revoke execute on function public.consommer_quota(text, integer, integer) from public, anon, authenticated;
grant  execute on function public.consommer_quota(text, integer, integer) to service_role;

-- Rattrapage des fonctions des migrations 045 à 047, sur lesquelles le même
-- `revoke … from public` seul avait été écrit. Le risque y est faible — ce sont
-- des fonctions de trigger, qui renvoient `trigger` : PostgREST ne les expose
-- pas et PL/pgSQL refuse de les exécuter hors contexte de déclenchement. Mais
-- la surface n'a aucune raison d'exister.
--
-- Révoquer `EXECUTE` ne désarme pas les triggers : le privilège n'est vérifié
-- qu'à la **création** du trigger, jamais à son déclenchement (constat déjà
-- établi lors des migrations 039 et 040).

revoke execute on function public.enforce_chantier_owner_immutability() from public, anon, authenticated;
revoke execute on function public.audit_logs_ajout_seul()              from public, anon, authenticated;
revoke execute on function public.chantier_rattacher_createur()        from public, anon, authenticated;
