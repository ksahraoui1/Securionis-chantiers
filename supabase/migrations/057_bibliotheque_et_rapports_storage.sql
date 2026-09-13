-- Bibliothèque : même périmètre que base_documentaire, même en présence
-- d'une ancienne politique permissive. Les pièces de checklist restent lisibles.
begin;
drop policy if exists bibliotheque_role_requis on storage.objects;
create policy bibliotheque_role_requis on storage.objects as restrictive
for select to authenticated using (
  bucket_id <> 'rapports' or split_part(name, '/', 1) <> 'base-documentaire'
  or public.user_role() in ('inspecteur', 'administrateur')
);

-- Les PDF de visite sont écrits uniquement par le serveur. Les autres
-- usages connus restent soumis aux règles métier existantes de la 051.
-- Les comparaisons sont créées par le client utilisateur : exception explicite.
create or replace function public.chemin_rapport_client_modifiable(p_name text)
returns boolean language sql immutable set search_path = '' as $$
  select split_part(p_name, '/', 1) in ('base-documentaire','points-controle','logos','chantiers')
    or split_part(p_name, '/', 2) = 'rapports-comparaison';
$$;
revoke all on function public.chemin_rapport_client_modifiable(text) from public, anon;
grant execute on function public.chemin_rapport_client_modifiable(text) to authenticated;
drop policy if exists rapports_serveur_insert on storage.objects;
create policy rapports_serveur_insert on storage.objects as restrictive for insert to authenticated
with check (bucket_id <> 'rapports' or public.chemin_rapport_client_modifiable(name));
drop policy if exists rapports_serveur_update on storage.objects;
create policy rapports_serveur_update on storage.objects as restrictive for update to authenticated
using (bucket_id <> 'rapports' or public.chemin_rapport_client_modifiable(name))
with check (bucket_id <> 'rapports' or public.chemin_rapport_client_modifiable(name));
drop policy if exists rapports_serveur_delete on storage.objects;
create policy rapports_serveur_delete on storage.objects as restrictive for delete to authenticated
using (bucket_id <> 'rapports' or public.chemin_rapport_client_modifiable(name));
commit;
