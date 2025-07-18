// src/app/layout.tsx
'use client';

import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import SidebarWithToggle from "./components/SidebarLayout";
import { TimeSliderProvider } from "./context/TimeSliderContext";
import { LayerProvider } from "./context/LayerContext";
import { AreaParametersProvider } from "./context/AreaParametersContext";
import { ImageLayerProvider, type ImageLayerType } from "./context/ImageLayerContext";
import { ManualPointsProvider } from "./context/ManualPointsContext";
import { useState, createContext, useContext, useEffect } from "react";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Simulation Context
const SimulationContext = createContext<{
  simulationLayer: ImageLayerType | null;
  setSimulationLayer: (layer: ImageLayerType | null) => void;
}>({
  simulationLayer: null,
  setSimulationLayer: () => {},
});

export const useSimulationLayer = () => useContext(SimulationContext);

// Service Worker registrering
const registerServiceWorker = async () => {
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js');
      console.log('✅ Service Worker registrerat:', registration);
      
      // Uppdatera service worker vid behov
      registration.addEventListener('updatefound', () => {
        console.log('🔄 Service Worker uppdatering hittad');
      });
      
    } catch (error) {
      console.error('❌ Service Worker registrering misslyckades:', error);
    }
  }
};

// Metadata moved to separate file since this is now a client component

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [simulationLayer, setSimulationLayer] = useState<ImageLayerType | null>(null);

  // Registrera Service Worker vid start
  useEffect(() => {
    registerServiceWorker();
  }, []);

  return (
    <html lang="sv">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <AreaParametersProvider>
          <TimeSliderProvider>
            <LayerProvider>
              <ImageLayerProvider>
                <ManualPointsProvider>
                  <SimulationContext.Provider value={{ simulationLayer, setSimulationLayer }}>
                    <SidebarWithToggle 
                      simulationLayer={simulationLayer}
                      onSimulationLayerChange={setSimulationLayer}
                    >
                      {children}
                    </SidebarWithToggle>
                  </SimulationContext.Provider>
                </ManualPointsProvider>
              </ImageLayerProvider>
            </LayerProvider>
          </TimeSliderProvider>
        </AreaParametersProvider>
      </body>
    </html>
  );
}
