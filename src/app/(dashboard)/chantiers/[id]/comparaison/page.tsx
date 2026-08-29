import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ComparaisonPlans } from "@/components/chantier/comparaison-plans";
import { signerUrls } from "@/lib/utils/url-signee";

export default async function ComparaisonPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ pe?: string; exe?: string }>;
}) {
  const { id: chantierId } = await params;
  // « Voir la comparaison » depuis une NC recharge le même couple de plans
  const { pe: planPEInitial, exe: planEXEInitial } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: chantier } = await supabase
    .from("chantiers")
    .select("id, nom, adresse")
    .eq("id", chantierId)
    .single();

  if (!chantier) {
    notFound();
  }

  const { data: plans } = await supabase
    .from("documents")
    .select("id, nom, fichier_url, fichier_nom, plan_type, plan_version, updated_at")
    .eq("chantier_id", chantierId)
    .not("plan_type", "is", null)
    .order("plan_version", { ascending: false });

  // Le bucket est privé (SEC-03) et c'est pdf.js, dans le navigateur, qui va
  // chercher chaque plan : il lui faut des URL signées. Signées ici, au
  // chargement de la page, et non à l'écriture — une URL signée expire.
  const urlsSignees = await signerUrls(supabase, (plans ?? []).map((p) => p.fichier_url));
  const plansSignes = (plans ?? []).map((p, i) => ({
    ...p,
    fichier_url: urlsSignees[i] ?? p.fichier_url,
  }));

  const plansPE = plansSignes.filter((p) => p.plan_type === "PE");
  const plansEXE = plansSignes.filter((p) => p.plan_type === "EXE");

  const manquants = [
    plansPE.length === 0 ? "PE" : null,
    plansEXE.length === 0 ? "EXE" : null,
  ].filter(Boolean) as string[];

  return (
    <div className="max-w-6xl mx-auto px-4 py-4 sm:py-6 space-y-5">
      {/* En-tête */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href={`/chantiers/${chantierId}`}
            className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-[#002855] transition-colors"
          >
            <span translate="no" className="material-symbols-outlined text-base">arrow_back</span>
            Retour au chantier
          </Link>
          <h1 className="text-xl sm:text-2xl font-bold text-[#002855] mt-1 break-words">
            Comparaison des plans — {chantier.nom || chantier.adresse}
          </h1>
        </div>
      </div>

      {manquants.length > 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center">
          <div className="w-14 h-14 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-3">
            <span translate="no" className="material-symbols-outlined text-amber-600 text-2xl">
              warning
            </span>
          </div>
          {manquants.map((type) => (
            <p key={type} className="text-sm font-medium text-amber-900">
              Aucun plan {type} disponible pour ce chantier. Ajoutez un plan dans
              l&apos;onglet Documents.
            </p>
          ))}
          <Link
            href={`/chantiers/${chantierId}`}
            className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2 mt-4 bg-[#002855] text-white font-medium rounded-lg hover:bg-[#002855]/90 transition-colors text-sm"
          >
            <span translate="no" className="material-symbols-outlined text-lg">upload_file</span>
            Ajouter un plan
          </Link>
        </div>
      ) : (
        <ComparaisonPlans
          chantierId={chantierId}
          chantierNom={chantier.nom || chantier.adresse}
          userId={user.id}
          plansPE={plansPE}
          plansEXE={plansEXE}
          planPEInitial={planPEInitial}
          planEXEInitial={planEXEInitial}
        />
      )}
    </div>
  );
}
