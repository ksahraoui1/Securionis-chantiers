import { PhotosExportButton } from "@/components/admin/photos-export-button";
import { RapportsExportButton } from "@/components/admin/rapports-export-button";
import Link from "next/link";
import { Users, FileText, Building2, CheckSquare, Images, File } from "lucide-react";

export default function AdminPage() {
  return (
    <div className="space-y-8 p-8">
      <div>
        <h1 className="text-3xl font-bold">Administration</h1>
        <p className="mt-2 text-gray-600">
          Gérez les paramètres, utilisateurs, documents et points de contrôle.
        </p>
      </div>

      {/* Grille des options admin */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Utilisateurs */}
        <Link href="/admin/utilisateurs">
          <div className="group rounded-lg border border-gray-200 p-6 hover:border-blue-500 hover:shadow-lg transition-all">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-blue-100 p-3">
                <Users className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <h2 className="font-semibold text-gray-900">Utilisateurs</h2>
                <p className="text-sm text-gray-600">
                  Gérer les inspecteurs et administrateurs
                </p>
              </div>
            </div>
          </div>
        </Link>

        {/* Entreprise */}
        <Link href="/admin/entreprise">
          <div className="group rounded-lg border border-gray-200 p-6 hover:border-green-500 hover:shadow-lg transition-all">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-green-100 p-3">
                <Building2 className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <h2 className="font-semibold text-gray-900">Entreprise</h2>
                <p className="text-sm text-gray-600">
                  Paramètres et logo de l&apos;entreprise
                </p>
              </div>
            </div>
          </div>
        </Link>

        {/* Points de contrôle */}
        <Link href="/admin/points-controle">
          <div className="group rounded-lg border border-gray-200 p-6 hover:border-purple-500 hover:shadow-lg transition-all">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-purple-100 p-3">
                <CheckSquare className="h-6 w-6 text-purple-600" />
              </div>
              <div>
                <h2 className="font-semibold text-gray-900">Points de contrôle</h2>
                <p className="text-sm text-gray-600">
                  Gérer les catégories, thèmes et points
                </p>
              </div>
            </div>
          </div>
        </Link>

        {/* Documents */}
        <Link href="/admin/documents">
          <div className="group rounded-lg border border-gray-200 p-6 hover:border-orange-500 hover:shadow-lg transition-all">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-orange-100 p-3">
                <FileText className="h-6 w-6 text-orange-600" />
              </div>
              <div>
                <h2 className="font-semibold text-gray-900">Documents</h2>
                <p className="text-sm text-gray-600">
                  Base documentaire et fichiers PDF
                </p>
              </div>
            </div>
          </div>
        </Link>
      </div>

      {/* Grille des exports */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Export des photos */}
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-6">
          <div className="flex items-start gap-4">
            <div className="rounded-lg bg-indigo-100 p-3">
              <Images className="h-6 w-6 text-indigo-600" />
            </div>
            <div className="flex-1">
              <h2 className="font-semibold text-gray-900">Export des photos</h2>
              <p className="mt-1 text-sm text-gray-600">
                Téléchargez toutes les photos de tous les chantiers et visites au
                format ZIP. Les fichiers sont organisés par chantier, visite et
                point de contrôle.
              </p>
              <div className="mt-4">
                <PhotosExportButton />
              </div>
            </div>
          </div>
        </div>

        {/* Export des rapports */}
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-6">
          <div className="flex items-start gap-4">
            <div className="rounded-lg bg-red-100 p-3">
              <File className="h-6 w-6 text-red-600" />
            </div>
            <div className="flex-1">
              <h2 className="font-semibold text-gray-900">Export des rapports</h2>
              <p className="mt-1 text-sm text-gray-600">
                Téléchargez tous les rapports de tous les chantiers et visites au
                format ZIP. Les fichiers sont organisés par chantier et date de
                visite.
              </p>
              <div className="mt-4">
                <RapportsExportButton />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
