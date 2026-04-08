-- Migration 027: Trigger pour empêcher la modification du rôle et de entreprise_id par l'utilisateur
-- Remplace la protection par RLS WITH CHECK (subquery) qui est vulnérable aux race conditions

-- Trigger qui bloque les changements de rôle et entreprise_id sauf via service_role
CREATE OR REPLACE FUNCTION prevent_user_self_role_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Service role (admin API) peut tout modifier
  IF current_setting('role', true) = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Bloquer le changement de rôle
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'La modification du rôle n''est pas autorisée';
  END IF;

  -- Bloquer le changement d'entreprise
  IF NEW.entreprise_id IS DISTINCT FROM OLD.entreprise_id THEN
    RAISE EXCEPTION 'La modification de l''entreprise n''est pas autorisée';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Supprimer le trigger s'il existe déjà
DROP TRIGGER IF EXISTS enforce_role_immutability ON profiles;

-- Créer le trigger BEFORE UPDATE
CREATE TRIGGER enforce_role_immutability
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION prevent_user_self_role_change();
