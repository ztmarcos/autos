import type { Metadata, Viewport } from "next";
import { AuthProvider } from "@/components/AuthProvider";
import { APP_NAME } from "@/config/app";
import "./globals.css";

export const metadata: Metadata = {
  title: APP_NAME,
  description: "Control vehicular para México",
  appleWebApp: {
    capable: true,
    title: APP_NAME,
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#fafbfc",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="bg-[var(--background)]">
      <body className="bg-[var(--background)] text-[var(--foreground)] antialiased">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
