import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./mobile.css";
import "./refined.css";
import { AppRuntime } from "@/components/app-runtime";
export const metadata: Metadata = {
  title: "INCYS | Care, learn, grow",
  applicationName: "INCYS",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "INCYS" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
  description:
    "The connected learning and wellness platform for the Institute for Nature Cure & Yogic Sciences.",
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f7f8fc",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {children}
        <AppRuntime />
      </body>
    </html>
  );
}
