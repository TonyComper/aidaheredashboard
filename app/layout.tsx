// app/layout.tsx
import "./globals.css";
import type { Metadata } from "next";
import dynamic from "next/dynamic";

export const metadata: Metadata = {
  title: "AidaHereDashboard",
  description: "Customer dashboard for your Vapi assistant",
};

// ⬇️ Load AuthProvider only on the client
const ClientAuthProvider = dynamic(() => import("@/components/AuthProvider"), {
  ssr: false,
});

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ClientAuthProvider>{children}</ClientAuthProvider>
      </body>
    </html>
  );
}
