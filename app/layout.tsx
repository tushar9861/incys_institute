import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "INCYS | Learning, care & wellbeing",
  description:
    "The connected learning and wellness platform for the Institute of Nature Cure and Yogic Science, Balasore.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
