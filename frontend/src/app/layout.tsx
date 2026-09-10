import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Inter } from "next/font/google";
import { publicEnv } from "@/config/env";
import { Providers } from "./providers";
import { ThemeScript } from "@/components/ThemeScript";
import { RouteProgress } from "@/components/shell/RouteProgress";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], display: "swap", variable: "--font-inter" });

export const metadata: Metadata = {
  title: {
    default: `${publicEnv.NEXT_PUBLIC_APP_NAME} PPC · Production Planning & Control`,
    template: `%s · ${publicEnv.NEXT_PUBLIC_APP_NAME}`,
  },
  description: "TITAN Production Management System — enterprise manufacturing execution.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <ThemeScript />
        <RouteProgress />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
