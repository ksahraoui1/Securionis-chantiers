"use client";

import { useState, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

interface ImportExcelPointsProps {
  onImported: () => void;
}

interface ImportRow {
  categorie: string;
  theme: string;
  intitule: string;
  baseLegale: string;
  explications: string;
}

export function ImportExcelPoints({ onImported }: ImportExcelPointsProps) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFileSelect(selectedFile: File) {
    setFile(selectedFile);
    setError(null);
    setResult(null);

    try {
      // Dynamic import xlsx
      const XLSX = await import("xlsx");
      const buffer = await selectedFile.arrayBuffer();
      const wb = XLSX.read(buffer);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 });

      if (raw.length < 2) {
        setError("Le fichier doit contenir au moins un en-tête et une ligne de données.");
        return;
      }

      // Detect columns — flexible: accept various header names
      const headers = raw[0].map((h) => (h ?? "").toString().toLowerCase().trim());
      const catIdx = headers.findIndex((h) => h.includes("catégorie") || h.includes("categorie") || h.includes("category"));
      const themeIdx = headers.findIndex((h) => h.includes("thème") || h.includes("theme"));
      const pointIdx = headers.findIndex((h) => h.includes("point") || h.includes("action") || h.includes("intitulé") || h.includes("intitule") || h.includes("contrôle") || h.includes("controle"));
      const legalIdx = headers.findIndex((h) => h.includes("base") || h.includes("légale") || h.includes("legale") || h.includes("loi") || h.includes("article"));
      const explIdx = headers.findIndex((h) => h.includes("explic") || h.includes("description") || h.includes("détail") || h.includes("detail"));

      if (catIdx === -1 || pointIdx === -1) {
        setError("Colonnes requises introuvables. Le fichier doit contenir au minimum : Catégorie et Point de contrôle (ou Intitulé).");
        return;
      }

      const rows: ImportRow[] = [];
      for (let i = 1; i < raw.length; i++) {
        const r = raw[i];
        const cat = (r[catIdx] ?? "").toString().trim();
        const intitule = (r[pointIdx] ?? "").toString().trim();
        if (!cat || !intitule) continue;

        rows.push({
          categorie: cat,
          theme: themeIdx !== -1 ? (r[themeIdx] ?? "").toString().trim() : "",
          intitule,
          baseLegale: legalIdx !== -1 ? (r[legalIdx] ?? "").toString().trim() : "",
          explications: explIdx !== -1 ? (r[explIdx] ?? "").toString().trim() : "",
        });
      }

      if (rows.length === 0) {
        setError("Aucune ligne valide trouvée dans le fichier.");
        return;
      }

      setPreview(rows);
    } catch {
      setError("Impossible de lire le fichier Excel.");
    }
  }

  async function handleImport() {
    if (preview.length === 0) return;
    setImporting(true);
    setError(null);

    try {
      const supabase = createClient();

      // 1. Collect unique categories
      const uniqueCats = [...new Set(preview.map((r) => r.categorie))];

      // Load existing categories
      const { data: existingCats } = await supabase
        .from("categories")
        .select("id, libelle");

      const catMap = new Map((existingCats ?? []).map((c) => [c.libelle, c.id]));

      // Create missing categories
      const newCats = uniqueCats.filter((c) => !catMap.has(c));
      if (newCats.length > 0) {
        const { data: insertedCats } = await supabase
          .from("categories")
          .insert(newCats.map((c) => ({ libelle: c, phase_id: null, is_custom: true, actif: true })))
          .select("id, libelle");
        for (const c of insertedCats ?? []) {
          catMap.set(c.libelle, c.id);
        }
      }

      // 2. Collect unique themes per category
      const uniqueThemes = new Map<string, Set<string>>();
      for (const r of preview) {
        if (!r.theme) continue;
        const catId = catMap.get(r.categorie);
        if (!catId) continue;
        if (!uniqueThemes.has(catId)) uniqueThemes.set(catId, new Set());
        uniqueThemes.get(catId)!.add(r.theme);
      }

      // Load existing themes
      const { data: existingThemes } = await supabase
        .from("themes")
        .select("id, categorie_id, libelle");

      const themeMap = new Map(
        (existingThemes ?? []).map((t) => [`${t.categorie_id}::${t.libelle}`, t.id])
      );

      // Create missing themes
      const themesToInsert: { categorie_id: string; libelle: string }[] = [];
      for (const [catId, themeSet] of uniqueThemes) {
        for (const theme of themeSet) {
          if (!themeMap.has(`${catId}::${theme}`)) {
            themesToInsert.push({ categorie_id: catId, libelle: theme });
          }
        }
      }
      if (themesToInsert.length > 0) {
        const { data: insertedThemes } = await supabase
          .from("themes")
          .insert(themesToInsert)
          .select("id, categorie_id, libelle");
        for (const t of insertedThemes ?? []) {
          themeMap.set(`${t.categorie_id}::${t.libelle}`, t.id);
        }
      }

      // 3. Insert points
      const pointsToInsert = preview.map((r) => {
        const catId = catMap.get(r.categorie) ?? null;
        const themeId = r.theme && catId ? themeMap.get(`${catId}::${r.theme}`) ?? null : null;
        return {
          phase_id: null,
          categorie_id: catId,
          theme_id: themeId,
          intitule: r.intitule,
          base_legale: r.baseLegale || null,
          explications: r.explications || null,
          is_custom: true,
          actif: true,
        };
      });

      // Insert in batches of 100
      let inserted = 0;
      for (let i = 0; i < pointsToInsert.length; i += 100) {
        const batch = pointsToInsert.slice(i, i + 100);
        const { error: insertError } = await supabase
          .from("points_controle")
          .insert(batch);
        if (insertError) throw new Error(insertError.message);
        inserted += batch.length;
      }

      setResult(`${inserted} points importés (${newCats.length} nouvelles catégories, ${themesToInsert.length} nouveaux thèmes)`);
      setPreview([]);
      setFile(null);
      onImported();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de l'import");
    } finally {
      setImporting(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 px-4 py-3 min-h-touch bg-amber-50 text-amber-700 rounded-lg font-medium hover:bg-amber-100 text-sm"
      >
        <span className="material-symbols-outlined text-lg">upload_file</span>
        Importer Excel
      </button>
    );
  }

  return (
    <div className="bg-white rounded-lg border-2 border-amber-200 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">Importer des points depuis un fichier Excel</h3>
        <button type="button" onClick={() => { setOpen(false); setPreview([]); setFile(null); setError(null); setResult(null); }} className="text-gray-400 hover:text-gray-600">
          <span className="material-symbols-outlined text-sm">close</span>
        </button>
      </div>

      <div className="bg-amber-50 rounded-lg p-3 text-xs text-amber-800 space-y-1">
        <p className="font-medium">Format attendu (colonnes) :</p>
        <p>Catégorie* | Thème | Point de contrôle* | Base légale | Explications</p>
        <p className="text-amber-600">* = obligatoire. Les noms de colonnes sont détectés automatiquement.</p>
      </div>

      <div>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFileSelect(f);
            e.target.value = "";
          }}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="w-full py-4 min-h-touch border-2 border-dashed border-amber-300 rounded-lg text-sm text-amber-600 hover:border-amber-400 transition-colors flex items-center justify-center gap-2"
        >
          <span className="material-symbols-outlined">cloud_upload</span>
          {file ? file.name : "Choisir un fichier Excel (.xlsx)"}
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {result && (
        <div className="bg-green-50 rounded-lg p-3 text-sm text-green-700 flex items-center gap-2">
          <span className="material-symbols-outlined text-lg">check_circle</span>
          {result}
        </div>
      )}

      {/* Aperçu */}
      {preview.length > 0 && (
        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">
            Aperçu : {preview.length} points à importer
          </p>
          <div className="max-h-60 overflow-y-auto border rounded-lg">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="text-left p-2 font-medium text-gray-500">Catégorie</th>
                  <th className="text-left p-2 font-medium text-gray-500">Thème</th>
                  <th className="text-left p-2 font-medium text-gray-500">Point de contrôle</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {preview.slice(0, 50).map((r, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="p-2 text-gray-600">{r.categorie}</td>
                    <td className="p-2 text-gray-500">{r.theme || "—"}</td>
                    <td className="p-2 text-gray-800">{r.intitule}</td>
                  </tr>
                ))}
                {preview.length > 50 && (
                  <tr>
                    <td colSpan={3} className="p-2 text-center text-gray-400">
                      ... et {preview.length - 50} autres lignes
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex gap-2 mt-3">
            <button
              type="button"
              onClick={handleImport}
              disabled={importing}
              className="flex-1 py-3 min-h-touch bg-amber-600 text-white font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50 text-sm"
            >
              {importing ? "Import en cours..." : `Importer ${preview.length} points`}
            </button>
            <button
              type="button"
              onClick={() => { setPreview([]); setFile(null); }}
              className="px-4 py-3 min-h-touch bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 text-sm"
            >
              Annuler
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
