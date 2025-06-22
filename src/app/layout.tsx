// src/app/layout.tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "leaflet/dist/leaflet.css";
import SidebarWithToggle from "./components/SidebarLayout";
import { TimeSliderProvider } from "./context/TimeSliderContext";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Makrill-Sverige",
  description: "Fiskedata och havsprognoser längs västkusten",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
  <html lang="sv">
    <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
      {/* 🔆 Golden Hour Glow-filter i DOM */}
      <svg width="0" height="0" className="absolute">
        <defs>
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="0" stdDeviation="6" floodColor="rgba(255,180,70,0.9)" />
          </filter>
        </defs>
      </svg>

      <TimeSliderProvider>
        <SidebarWithToggle>
          {children}
        </SidebarWithToggle>
      </TimeSliderProvider>
    </body>
  </html>
);
}
