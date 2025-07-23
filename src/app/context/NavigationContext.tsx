'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { usePathname } from 'next/navigation';

interface NavigationContextType {
  isNavigating: boolean;
  setNavigating: (navigating: boolean) => void;
}

const NavigationContext = createContext<NavigationContextType | undefined>(undefined);

interface NavigationProviderProps {
  children: ReactNode;
}

export function NavigationProvider({ children }: NavigationProviderProps) {
  const [isNavigating, setIsNavigating] = useState(false);
  const pathname = usePathname();
  
  // PROPER Next.js navigation handling - lyssna på faktiska path changes
  useEffect(() => {
    // När path ändras, stoppa loading (sidan har faktiskt laddats)
    if (isNavigating) {
      console.log('✅ Sida laddad, stoppar loading:', pathname);
      setIsNavigating(false);
    }
  }, [pathname]); // Lyssna på faktiska path changes
  
  const setNavigating = (navigating: boolean) => {
    if (navigating) {
              // Tyst navigation start
      setIsNavigating(true);
      // INGEN hårdkodad timer - låt path change stoppa loading!
    } else {
      setIsNavigating(false);
    }
  };

  return (
    <NavigationContext.Provider value={{
      isNavigating,
      setNavigating
    }}>
      {children}
    </NavigationContext.Provider>
  );
}

export function useNavigation() {
  const context = useContext(NavigationContext);
  if (context === undefined) {
    throw new Error('useNavigation must be used within a NavigationProvider');
  }
  return context;
} 