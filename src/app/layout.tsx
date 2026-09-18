import type { Metadata } from "next";
import { Inter, Fraunces } from "next/font/google";
import { Suspense } from "react";
import "./globals.css";
import { RolesProvider } from "@/lib/store";
import { AuthProvider } from "@/lib/auth";
import AuthGate from "@/components/AuthGate";
import Nav from "@/components/Nav";
import Notice from "@/components/Notice";
import Drawer from "@/components/Drawer";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  axes: ["opsz", "SOFT"],
});

export const metadata: Metadata = {
  title: "Internship Radar",
  description: "Triage scored internship postings and track the ones worth pursuing.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${fraunces.variable}`}>
      <body className="font-sans antialiased">
        <AuthProvider>
          <AuthGate>
            <RolesProvider>
              <div className="flex min-h-dvh flex-col">
                <Suspense>
                  <Nav />
                </Suspense>
                <Notice />
                <Suspense>{children}</Suspense>
                <Suspense>
                  <Drawer />
                </Suspense>
              </div>
            </RolesProvider>
          </AuthGate>
        </AuthProvider>
      </body>
    </html>
  );
}
