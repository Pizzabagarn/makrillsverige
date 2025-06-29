// src/app/layout.tsx
'use client';

import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import SidebarWithToggle from "./components/SidebarLayout";
import { TimeSliderProvider } from "./context/TimeSliderContext";
import { LayerProvider } from "./context/LayerContext";
import { AreaParametersProvider } from "./context/AreaParametersContext";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Metadata moved to separate file since this is now a client component

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="sv">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <AreaParametersProvider>
          <TimeSliderProvider>
            <LayerProvider>
              <SidebarWithToggle>
                {children}
              </SidebarWithToggle>
            </LayerProvider>
          </TimeSliderProvider>
        </AreaParametersProvider>
      </body>
    </html>
  );
}
