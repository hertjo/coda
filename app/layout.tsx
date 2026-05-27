import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Coda",
  description:
    "Interactive visualisation of the sperm whale phonetic alphabet from Sharma et al. 2024.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
