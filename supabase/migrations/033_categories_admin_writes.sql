-- Autorise les administrateurs à créer/modifier/supprimer des catégories custom.
-- Les catégories par défaut (is_custom = false) restent protégées en écriture.
-- Suit le même modèle que pc_insert_admin / pc_update_admin sur points_controle (migration 011).

CREATE POLICY categories_insert_admin ON categories
    FOR INSERT TO authenticated
    WITH CHECK (
        public.user_role() = 'administrateur'
        AND is_custom = true
    );

CREATE POLICY categories_update_admin ON categories
    FOR UPDATE TO authenticated
    USING (
        public.user_role() = 'administrateur'
        AND is_custom = true
    )
    WITH CHECK (
        public.user_role() = 'administrateur'
        AND is_custom = true
    );

CREATE POLICY categories_delete_admin ON categories
    FOR DELETE TO authenticated
    USING (
        public.user_role() = 'administrateur'
        AND is_custom = true
    );
