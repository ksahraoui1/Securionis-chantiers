-- Les anciens clients ne doivent plus envoyer une révision lue à la reconnexion.
-- La nouvelle entrée utilise le même moteur atomique, avec une base locale conservée.
begin;
create or replace function public.synchroniser_reponse_v2(
 p_visite_id uuid,p_point_controle_id uuid,p_revision_attendue uuid,p_operation_id uuid,
 p_valeur text,p_remarque text,p_photos text[])
returns jsonb language sql security definer set search_path='' as $$
 select public.synchroniser_reponse(p_visite_id,p_point_controle_id,p_revision_attendue,p_operation_id,p_valeur,p_remarque,p_photos);
$$;
revoke all on function public.synchroniser_reponse_v2(uuid,uuid,uuid,uuid,text,text,text[]) from public,anon,service_role;
grant execute on function public.synchroniser_reponse_v2(uuid,uuid,uuid,uuid,text,text,text[]) to authenticated;
revoke all on function public.synchroniser_reponse(uuid,uuid,uuid,uuid,text,text,text[]) from authenticated;
notify pgrst,'reload schema';
commit;
