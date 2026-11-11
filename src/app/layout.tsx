import type { Metadata } from "next";
import { Inter, Lora } from "next/font/google";
import "./globals.css";

const sans = Inter({
  subsets: ["latin", "cyrillic"],
  variable: "--font-sans",
});

const serif = Lora({
  subsets: ["latin", "cyrillic"],
  variable: "--font-serif",
});

export const metadata: Metadata = {
  title: "LumenLib — Школьная медиатека и открытая читальня",
  description: "Образовательная платформа для школьников по стандартам ФГОС. Электронная библиотека, чтение онлайн и трекер прогресса.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" className={`${sans.variable} ${serif.variable}`}>
      <body className="min-h-screen flex flex-col font-sans">
        {children}
      </body>
    </html>
  );
}
