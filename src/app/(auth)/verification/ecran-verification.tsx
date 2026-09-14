"use client";

import { useRouter } from "next/navigation";
import { logoutOfflineSession } from "@/lib/offline/logout";
import { FormulaireCodeMfa } from "@/components/compte/formulaire-code-mfa";

export function EcranVerification({
  factorId,
  email,
}: {
  factorId: string;
  email: string;
}) {
  const router = useRouter();

  async function seDeconnecter() {
    const revoked = await logoutOfflineSession().catch(() => false);
    window.location.replace(revoked ? "/login" : "/login?deconnexion=locale");
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-400 p-5 sm:p-8">
      <div className="text-center mb-6">
        <h1 className="text-xl font-bold text-gray-900">Vérification en deux étapes</h1>
        <p className="text-sm text-gray-500 mt-2 break-words">{email}</p>
      </div>

      <FormulaireCodeMfa
        factorId={factorId}
        onVerifie={() => {
          router.push("/dashboard");
          router.refresh();
        }}
        onAnnuler={seDeconnecter}
      />
    </div>
  );
}
