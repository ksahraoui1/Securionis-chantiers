export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md">{children}</div>
      <footer className="text-center text-xs text-gray-400 mt-8">
        &copy;2026 - Securionis
      </footer>
    </div>
  );
}
