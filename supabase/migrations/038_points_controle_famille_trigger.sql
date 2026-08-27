-- 038 — Garde-fou en base : renseigner `famille` à partir de la catégorie.
--
-- Jusqu'ici `famille` n'était renseignée que côté application (formulaire admin
-- et import Excel, via familleDeCategorie()). Tout autre chemin d'écriture
-- (insert SQL direct, seed, future route API) produisait un point sans famille,
-- donc invisible dans le filtre par famille de /admin/points-controle.
--
-- SECURITY INVOKER (défaut) : `categories` est lisible par tous les rôles
-- authentifiés (policy categories_select `using true`), aucune élévation requise.

create or replace function public.points_controle_set_famille()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
declare
  cat_libelle text;
begin
  if new.famille is not null then
    return new;
  end if;

  select libelle into cat_libelle from public.categories where id = new.categorie_id;

  new.famille := case cat_libelle
    when 'Échafaudages'              then 'Protections antichute'
    when 'Échafaudages roulants'     then 'Protections antichute'
    when 'Filets & Retenue'          then 'Protections antichute'
    when 'Protections Chutes'        then 'Protections antichute'
    when 'Échelles'                  then 'Protections antichute'
    when 'Électricité'               then 'Électricité & Énergies'
    when 'Installations & Énergie'   then 'Électricité & Énergies'
    when 'Installations Thermiques'  then 'Électricité & Énergies'
    when 'Laser'                     then 'Électricité & Énergies'
    when 'Engins Chantier'           then 'Engins & Levage'
    when 'Grues & Levage'            then 'Engins & Levage'
    when 'Fouilles & Talus'          then 'Fouilles & Terrasse'
    when 'Roches & Gravier'          then 'Fouilles & Terrasse'
    when 'Souterrains'               then 'Fouilles & Terrasse'
    when 'Coffrages'                 then 'Fouilles & Terrasse'
    when 'Démolition & Désamiantage' then 'Démolition & Désamiantage'
    when 'Santé et EPI'              then 'EPI & Santé'
    when 'Milieu de travail'         then 'EPI & Santé'
    when 'Accès & Sols'              then 'Accès & Circulation'
    when 'Postes & Passages'         then 'Accès & Circulation'
    when 'Produits & Inflammables'   then 'Produits & Incendie'
    when 'Toitures'                  then 'Structures & Toitures'
    when 'Éléments Préfabriqués'     then 'Structures & Toitures'
    when 'Arbres'                    then 'Structures & Toitures'
    when 'Machines Electriques'      then 'Machines & Outils'
    when 'Machines portatives'       then 'Machines & Outils'
    when 'Dispositions générales'    then 'Dispositions générales'
    else 'Autres'
  end;

  return new;
end;
$$;

drop trigger if exists points_controle_famille_trg on public.points_controle;

create trigger points_controle_famille_trg
  before insert or update of categorie_id, famille on public.points_controle
  for each row
  execute function public.points_controle_set_famille();
