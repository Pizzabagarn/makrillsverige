// Attribution-komponent för Yr väderdata
// Visar korrekt tillskrivning enligt MET Norway's villkor

import Link from 'next/link';

interface WeatherAttributionProps {
  className?: string;
  variant?: 'full' | 'compact' | 'inline';
}

export default function WeatherAttribution({ 
  className = '', 
  variant = 'full' 
}: WeatherAttributionProps) {
  
  if (variant === 'inline') {
    return (
      <span className={`text-sm opacity-70 ${className}`}>
        Data från{' '}
        <Link 
          href="https://www.met.no/" 
          target="_blank" 
          rel="noopener noreferrer"
          className="text-blue-400 hover:text-blue-300 underline"
        >
          MET Norway
        </Link>
      </span>
    );
  }
  
  if (variant === 'compact') {
    return (
      <div className={`text-xs text-white/60 ${className}`}>
        <Link 
          href="https://www.met.no/" 
          target="_blank" 
          rel="noopener noreferrer"
          className="hover:text-white/80 underline"
        >
          Väderdata: MET Norway
        </Link>
        {' • '}
        <Link 
          href="https://creativecommons.org/licenses/by/4.0/"
          target="_blank"
          rel="noopener noreferrer" 
          className="hover:text-white/80 underline"
        >
          CC BY 4.0
        </Link>
      </div>
    );
  }
  
  // Full attribution
  return (
    <div className={`bg-black/20 rounded-lg p-4 border border-white/10 ${className}`}>
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-1">
          <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
        </div>
        
        <div className="flex-1 text-sm">
          <h4 className="text-white font-medium mb-2">Väderdata</h4>
          
          <div className="text-white/70 space-y-1">
            <p>
              Data från{' '}
              <Link 
                href="https://www.met.no/" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300 underline font-medium"
              >
                Meteorologisk institutt (MET Norway)
              </Link>
            </p>
            
            <p className="text-xs">
              Licens:{' '}
              <Link 
                href="https://creativecommons.org/licenses/by/4.0/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300 underline"
              >
                Creative Commons BY 4.0
              </Link>
            </p>
            
            <div className="text-xs text-white/50 mt-2 space-y-1">
              <p>• MEPS 2.5km-modell (0-60h)</p>
              <p>• ECMWF 9km-modell (60-240h)</p>
              <p>• Uppdateras 4 gånger/dygn</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 