import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { EcartStatusBadge } from "@/components/ecart/ecart-status-badge";

const NAVY = "#002855";
const BLEU_NC = "#2563EB";

const LIBELLE_PRIORITE: Record<string, { texte: string; classe: string }> = {
  haute: { texte: "Priorité haute", classe: "bg-red-100 text-red-800" },
  moyenne: { texte: "Priorité moyenne", classe: "bg-amber-100 text-amber-800" },
  basse: { texte: "Priorité basse", classe: "bg-green-100 text-green-800" },
};

export default async function NCDetailPage({
  params,
}: {
  params: Promise<{ id: string; ncId: string }>;
}) {
  const { id: chantierId, ncId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: nc } = await supabase
    .from("ecarts")
    .select("*")
    .eq("id", ncId)
    .eq("chantier_id", chantierId)
    .single();

  if (!nc) {
    notFound();
  }

  const { data: chantier } = await supabase
    .from("chantiers")
    .select("nom, adresse")
    .eq("id", chantierId)
    .single();

  // Origine : cette NC vient-elle d'une annotation de comparaison de plans ?
  const { data: lien } = await supabase
    .from("comparaison_nc_links")
    .select(
      "capture_url, comparaison_annotations(commentaire, comparaisons(page_pe, page_exe, document_pe_id, document_exe_id))"
    )
    .eq("nc_id", ncId)
    .maybeSingle();

  const annotation = lien?.comparaison_annotations as unknown as
    | {
        commentaire: string | null;
        comparaisons: {
          page_pe: number;
          page_exe: number;
          document_pe_id: string;
          document_exe_id: string;
        } | null;
      }
    | null;
  const comparaison = annotation?.comparaisons ?? null;

  const { data: plans } = comparaison
    ? await supabase
        .from("documents")
        .select("id, nom, plan_type, plan_version")
        .in("id", [comparaison.document_pe_id, comparaison.document_exe_id])
    : { data: null };

  const planPE = plans?.find((p) => p.id === comparaison?.document_pe_id) ?? null;
  const planEXE = plans?.find((p) => p.id === comparaison?.document_exe_id) ?? null;

  const priorite = nc.priorite ? LIBELLE_PRIORITE[nc.priorite] : null;

  return (
    <div className="max-w-3xl mx-auto px-4 py-4 sm:py-6 space-y-5">
      {/* En-tête */}
      <div>
        <Link
          href={`/chantiers/${chantierId}`}
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-[#002855] transition-colors"
        >
          <span className="material-symbols-outlined text-base">arrow_back</span>
          Retour au chantier
        </Link>
        <div className="flex items-center gap-2 flex-wrap mt-1">
          <h1 className="text-xl sm:text-2xl font-bold" style={{ color: NAVY }}>
            NC #{nc.numero}
          </h1>
          <EcartStatusBadge statut={nc.statut} />
          {priorite && (
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${priorite.classe}`}
            >
              {priorite.texte}
            </span>
          )}
          {nc.type === "ecart_plan" && (
            <span
              className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium text-white"
              style={{ backgroundColor: BLEU_NC }}
            >
              <span className="material-symbols-outlined text-xs">compare_arrows</span>
              Écart de plan
            </span>
          )}
        </div>
        {nc.titre && (
          <p className="text-sm text-gray-700 mt-1 font-medium">{nc.titre}</p>
        )}
        <p className="text-sm text-gray-500">
          {chantier?.nom || chantier?.adresse}
        </p>
      </div>

      <Card title="Non-conformité">
        <dl className="space-y-3 text-sm">
          <div>
            <dt className="text-gray-500 text-xs">Description</dt>
            <dd className="text-gray-900 whitespace-pre-wrap">{nc.description}</dd>
          </div>
          {nc.delai && (
            <div>
              <dt className="text-gray-500 text-xs">Délai</dt>
              <dd className="text-gray-900">{nc.delai}</dd>
            </div>
          )}
          <div>
            <dt className="text-gray-500 text-xs">Créée le</dt>
            <dd className="text-gray-900">
              {new Date(nc.created_at).toLocaleDateString("fr-CH")}
            </dd>
          </div>
        </dl>
      </Card>

      {/* Plan comparé */}
      {comparaison && (
        <Card title="Plan comparé">
          <div className="space-y-3">
            <p className="text-sm text-gray-700">
              Cette NC provient de la comparaison entre le plan PE{" "}
              <span className="font-semibold text-[#2E7D32]">
                V{planPE?.plan_version ?? "?"}
              </span>{" "}
              et le plan EXE{" "}
              <span className="font-semibold text-[#E67E22]">
                V{planEXE?.plan_version ?? "?"}
              </span>
              .
            </p>

            <dl className="text-xs text-gray-500 space-y-1">
              <div className="flex gap-2">
                <dt className="w-20 shrink-0">Plan PE</dt>
                <dd className="text-gray-900">
                  {planPE?.nom ?? "Plan supprimé"} — page {comparaison.page_pe}
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-20 shrink-0">Plan EXE</dt>
                <dd className="text-gray-900">
                  {planEXE?.nom ?? "Plan supprimé"} — page {comparaison.page_exe}
                </dd>
              </div>
            </dl>

            {lien?.capture_url && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={lien.capture_url}
                alt="Capture de la zone annotée sur la comparaison des plans"
                className="w-full rounded-lg border border-gray-300"
              />
            )}

            <Link
              href={`/chantiers/${chantierId}/comparaison?pe=${comparaison.document_pe_id}&exe=${comparaison.document_exe_id}`}
              className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2 text-white font-medium rounded-lg hover:opacity-90 transition-opacity text-sm"
              style={{ backgroundColor: NAVY }}
            >
              <span className="material-symbols-outlined text-lg">compare_arrows</span>
              Voir la comparaison
            </Link>
          </div>
        </Card>
      )}
    </div>
  );
}
