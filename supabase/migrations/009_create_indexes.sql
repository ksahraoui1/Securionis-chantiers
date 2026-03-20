-- 009: Create indexes for query performance

-- chantier_inspecteurs
CREATE INDEX idx_ci_inspecteur ON chantier_inspecteurs(inspecteur_id);
CREATE INDEX idx_ci_chantier   ON chantier_inspecteurs(chantier_id);

-- visites
CREATE INDEX idx_visites_chantier    ON visites(chantier_id);
CREATE INDEX idx_visites_inspecteur  ON visites(inspecteur_id);

-- Partial unique index: only one non-terminee visite per chantier at a time
CREATE UNIQUE INDEX uq_visites_active ON visites(chantier_id) WHERE statut != 'terminee';

-- reponses
CREATE INDEX idx_reponses_visite ON reponses(visite_id);
CREATE INDEX idx_reponses_point  ON reponses(point_controle_id);

-- ecarts
CREATE INDEX idx_ecarts_chantier ON ecarts(chantier_id);
CREATE INDEX idx_ecarts_statut   ON ecarts(chantier_id, statut);

-- points_controle
CREATE INDEX idx_pc_phase     ON points_controle(phase_id);
CREATE INDEX idx_pc_categorie ON points_controle(categorie_id);
CREATE INDEX idx_pc_actif     ON points_controle(actif) WHERE actif = true;

-- destinataires
CREATE INDEX idx_dest_chantier ON destinataires(chantier_id);
