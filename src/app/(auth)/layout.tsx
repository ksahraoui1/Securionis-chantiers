export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex">
      {/* Left panel — branding */}
      <div className="hidden lg:flex lg:w-[45%] relative bg-navy-800 overflow-hidden">
        {/* Background pattern */}
        <div className="absolute inset-0 bg-dots opacity-30" />
        <div className="absolute inset-0 bg-gradient-to-br from-navy-800 via-navy-800/95 to-brand-900/30" />

        {/* Content */}
        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-600 flex items-center justify-center">
              <span className="material-symbols-outlined text-white">shield</span>
            </div>
            <span className="font-heading font-bold text-white/90 text-lg tracking-tight">
              Securionis
            </span>
          </div>

          <div className="max-w-md">
            <h1 className="font-heading text-4xl font-bold text-white leading-tight mb-4">
              Contrôle de chantiers,{" "}
              <span className="text-gradient">simplifié.</span>
            </h1>
            <p className="text-white/50 text-base leading-relaxed">
              Gérez vos inspections SST, identifiez les non-conformités et
              générez vos rapports depuis le terrain.
            </p>
          </div>

          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-brand-400 text-lg">check_circle</span>
              <span className="text-white/40 text-sm">Inspections terrain</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-brand-400 text-lg">check_circle</span>
              <span className="text-white/40 text-sm">Rapports PDF</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-brand-400 text-lg">check_circle</span>
              <span className="text-white/40 text-sm">Mode hors-ligne</span>
            </div>
          </div>
        </div>

        {/* Decorative elements */}
        <div className="absolute -bottom-20 -right-20 w-80 h-80 rounded-full bg-brand-600/5 blur-3xl" />
        <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-brand-500/10 blur-2xl" />
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-8" style={{ backgroundColor: "#F7F5F2" }}>
        <div className="w-full max-w-md animate-page-enter">{children}</div>
      </div>
    </div>
  );
}
