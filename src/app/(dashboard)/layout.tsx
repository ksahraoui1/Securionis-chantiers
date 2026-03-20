import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DashboardNav } from "./nav";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("nom, role")
    .eq("id", user.id)
    .single();

  return (
    <div className="min-h-screen bg-gray-50">
      <DashboardNav
        userName={profile?.nom ?? user.email ?? ""}
        userRole={profile?.role ?? "inspecteur"}
      />
      <main className="max-w-6xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
