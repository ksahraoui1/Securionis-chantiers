import type { Metadata, Viewport } from "next";
import { SwRegister } from "@/components/ui/sw-register";
import "./globals.css";

export const metadata: Metadata = {
  title: "Securionis Chantiers",
  description: "Application de controle de chantiers",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Securionis Chantiers",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1e40af",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body className="font-sans antialiased">
        <SwRegister />
        {children}
      </body>
    </html>
  );
}
