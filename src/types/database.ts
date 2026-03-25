export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          nom: string;
          email: string;
          role: "inspecteur" | "administrateur";
          entreprise_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          nom: string;
          email: string;
          role?: "inspecteur" | "administrateur";
          entreprise_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          nom?: string;
          email?: string;
          role?: "inspecteur" | "administrateur";
          entreprise_id?: string | null;
          updated_at?: string;
        };
      };
      entreprises: {
        Row: {
          id: string;
          nom: string;
          adresse: string | null;
          npa: string | null;
          ville: string | null;
          telephone: string | null;
          email: string | null;
          logo_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          nom: string;
          adresse?: string | null;
          npa?: string | null;
          ville?: string | null;
          telephone?: string | null;
          email?: string | null;
          logo_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          nom?: string;
          adresse?: string | null;
          npa?: string | null;
          ville?: string | null;
          telephone?: string | null;
          email?: string | null;
          logo_url?: string | null;
          updated_at?: string;
        };
      };
      phases: {
        Row: {
          id: string;
          numero: number;
          libelle: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          numero: number;
          libelle: string;
          created_at?: string;
        };
        Update: {
          numero?: number;
          libelle?: string;
        };
      };
      categories: {
        Row: {
          id: string;
          phase_id: string | null;
          libelle: string;
          is_custom: boolean;
          actif: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          phase_id?: string | null;
          libelle: string;
          is_custom?: boolean;
          actif?: boolean;
          created_at?: string;
        };
        Update: {
          phase_id?: string | null;
          libelle?: string;
          is_custom?: boolean;
          actif?: boolean;
        };
      };
      themes: {
        Row: {
          id: string;
          categorie_id: string;
          libelle: string;
          actif: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          categorie_id: string;
          libelle: string;
          actif?: boolean;
          created_at?: string;
        };
        Update: {
          categorie_id?: string;
          libelle?: string;
          actif?: boolean;
        };
      };
      points_controle: {
        Row: {
          id: string;
          phase_id: string | null;
          categorie_id: string | null;
          theme_id: string | null;
          intitule: string;
          critere: string | null;
          base_legale: string | null;
          objet: string | null;
          explications: string | null;
          is_custom: boolean;
          actif: boolean;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          phase_id?: string | null;
          categorie_id?: string | null;
          theme_id?: string | null;
          intitule: string;
          critere?: string | null;
          base_legale?: string | null;
          objet?: string | null;
          explications?: string | null;
          is_custom?: boolean;
          actif?: boolean;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          phase_id?: string | null;
          categorie_id?: string | null;
          theme_id?: string | null;
          intitule?: string;
          critere?: string | null;
          base_legale?: string | null;
          objet?: string | null;
          explications?: string | null;
          is_custom?: boolean;
          actif?: boolean;
          updated_at?: string;
        };
      };
      point_controle_documents: {
        Row: {
          id: string;
          point_controle_id: string;
          nom: string;
          fichier_url: string;
          fichier_nom: string;
          fichier_taille: number | null;
          ordre: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          point_controle_id: string;
          nom: string;
          fichier_url: string;
          fichier_nom: string;
          fichier_taille?: number | null;
          ordre?: number;
          created_at?: string;
        };
        Update: {
          nom?: string;
          fichier_url?: string;
          fichier_nom?: string;
          fichier_taille?: number | null;
          ordre?: number;
        };
      };
      chantiers: {
        Row: {
          id: string;
          nom: string | null;
          adresse: string;
          nature_travaux: string;
          ref_communale: string | null;
          numero_camac: string | null;
          numero_parcelle: string | null;
          numero_eca: string | null;
          contact_nom: string | null;
          archived: boolean;
          archived_at: string | null;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          nom?: string | null;
          adresse: string;
          nature_travaux: string;
          ref_communale?: string | null;
          numero_camac?: string | null;
          numero_parcelle?: string | null;
          numero_eca?: string | null;
          contact_nom?: string | null;
          archived?: boolean;
          archived_at?: string | null;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          nom?: string | null;
          adresse?: string;
          nature_travaux?: string;
          ref_communale?: string | null;
          numero_camac?: string | null;
          numero_parcelle?: string | null;
          numero_eca?: string | null;
          contact_nom?: string | null;
          archived?: boolean;
          archived_at?: string | null;
          updated_at?: string;
        };
      };
      destinataires: {
        Row: {
          id: string;
          chantier_id: string;
          nom: string;
          organisation: string | null;
          email: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          chantier_id: string;
          nom: string;
          organisation?: string | null;
          email: string;
          created_at?: string;
        };
        Update: {
          nom?: string;
          organisation?: string | null;
          email?: string;
        };
      };
      visites: {
        Row: {
          id: string;
          chantier_id: string;
          inspecteur_id: string;
          date_visite: string;
          heure_visite: string | null;
          statut: "brouillon" | "en_cours" | "terminee";
          rapport_url: string | null;
          email_envoye: boolean;
          categorie_ids: string[] | null;
          renseignements_par: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          chantier_id: string;
          inspecteur_id: string;
          date_visite?: string;
          heure_visite?: string | null;
          statut?: "brouillon" | "en_cours" | "terminee";
          rapport_url?: string | null;
          email_envoye?: boolean;
          categorie_ids?: string[] | null;
          renseignements_par?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          date_visite?: string;
          heure_visite?: string | null;
          statut?: "brouillon" | "en_cours" | "terminee";
          rapport_url?: string | null;
          email_envoye?: boolean;
          categorie_ids?: string[] | null;
          renseignements_par?: string | null;
          updated_at?: string;
        };
      };
      reponses: {
        Row: {
          id: string;
          visite_id: string;
          point_controle_id: string;
          valeur: "conforme" | "non_conforme" | "pas_necessaire";
          remarque: string | null;
          photos: string[];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          visite_id: string;
          point_controle_id: string;
          valeur: "conforme" | "non_conforme" | "pas_necessaire";
          remarque?: string | null;
          photos?: string[];
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          valeur?: "conforme" | "non_conforme" | "pas_necessaire";
          remarque?: string | null;
          photos?: string[];
          updated_at?: string;
        };
      };
      ecarts: {
        Row: {
          id: string;
          chantier_id: string;
          reponse_id: string;
          description: string;
          delai: string | null;
          statut: "ouvert" | "en_cours_correction" | "corrige";
          updated_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          chantier_id: string;
          reponse_id: string;
          description: string;
          delai?: string | null;
          statut?: "ouvert" | "en_cours_correction" | "corrige";
          updated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          description?: string;
          delai?: string | null;
          statut?: "ouvert" | "en_cours_correction" | "corrige";
          updated_by?: string | null;
          updated_at?: string;
        };
      };
      chantier_inspecteurs: {
        Row: {
          id: string;
          chantier_id: string;
          inspecteur_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          chantier_id: string;
          inspecteur_id: string;
          created_at?: string;
        };
        Update: {
          chantier_id?: string;
          inspecteur_id?: string;
        };
      };
      documents: {
        Row: {
          id: string;
          chantier_id: string;
          nom: string;
          categorie: string;
          description: string | null;
          fichier_url: string;
          fichier_nom: string;
          fichier_taille: number | null;
          version: number;
          uploaded_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          chantier_id: string;
          nom: string;
          categorie?: string;
          description?: string | null;
          fichier_url: string;
          fichier_nom: string;
          fichier_taille?: number | null;
          version?: number;
          uploaded_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          nom?: string;
          categorie?: string;
          description?: string | null;
          fichier_url?: string;
          fichier_nom?: string;
          fichier_taille?: number | null;
          version?: number;
          updated_at?: string;
        };
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
};

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
export type InsertTables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];
export type UpdateTables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];
