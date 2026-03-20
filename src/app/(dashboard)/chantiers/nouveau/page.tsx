import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ChantierForm } from "@/components/chantier/chantier-form";

export default async function NouveauChantierPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Load user profile to check role for FR-028
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">
        Nouveau chantier
      </h1>
      <ChantierForm
        userId={user.id}
        userRole={profile?.role ?? "inspecteur"}
      />
    </div>
  );
}
