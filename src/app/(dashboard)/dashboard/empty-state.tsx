import Link from "next/link";

/**
 * Empty state affiché quand l'utilisateur n'a encore aucun chantier.
 * Fix P7 — dashboard vide sans CTA.
 */
export function DashboardEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-24 px-6 text-center space-y-6">
      {/* Illustration */}
      <div className="w-20 h-20 rounded-3xl bg-surface-container-high flex items-center justify-center">
        <span
          className="material-symbols-outlined text-primary-container text-4xl"
          aria-hidden="true"
        >
          foundation
        </span>
      </div>

      {/* Texte */}
      <div className="space-y-2 max-w-xs">
        <h2 className="text-xl font-bold text-on-surface">
          Aucun chantier pour l&apos;instant
        </h2>
        <p className="text-sm text-on-surface-variant leading-relaxed">
          Créez votre premier chantier pour commencer à planifier et suivre vos
          visites de contrôle.
        </p>
      </div>

      {/* CTA principal */}
      <Link
        href="/chantiers/nouveau"
        className="btn-gradient text-white h-14 pl-6 pr-7 rounded-2xl flex items-center gap-3 shadow-ambient hover:scale-105 active:scale-95 transition-all font-bold"
      >
        <span className="material-symbols-outlined" aria-hidden="true">
          add
        </span>
        Créer mon premier chantier
      </Link>

      {/* Lien secondaire */}
      <Link
        href="/chantiers"
        className="text-sm text-on-surface-variant hover:text-on-surface underline underline-offset-4 transition-colors"
      >
        Voir tous les chantiers
      </Link>
    </div>
  );
}
