'use client';

import React, { useState } from 'react';
import { Target, MousePointer, MapPin, Save, Check, X } from 'lucide-react';
import { useManualPoints } from '../context/ManualPointsContext';

interface ManualPointsIndicatorProps {
  className?: string;
}

const ManualPointsIndicator: React.FC<ManualPointsIndicatorProps> = ({ className }) => {
  const { manualPoints, isManualPointMode } = useManualPoints();
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [saveMessage, setSaveMessage] = useState<string>('');

  // Spara till kod-filen
  const handleSaveToCode = async () => {
    if (manualPoints.length === 0) return;

    setSaveStatus('saving');
    setSaveMessage('Sparar till points.ts...');

    try {
      const response = await fetch('/api/manual-points/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ points: manualPoints }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();
      
      setSaveStatus('success');
      setSaveMessage(`✅ ${manualPoints.length} punkter sparade`);
      
      setTimeout(() => {
        setSaveStatus('idle');
        setSaveMessage('');
      }, 3000);
      
    } catch (error) {
      console.error('❌ Fel vid sparning:', error);
      setSaveStatus('error');
      setSaveMessage('❌ Fel vid sparning');
      
      setTimeout(() => {
        setSaveStatus('idle');
        setSaveMessage('');
      }, 3000);
    }
  };

  const getSaveButtonStyle = () => {
    switch (saveStatus) {
      case 'saving':
        return 'bg-blue-500 hover:bg-blue-600 text-white';
      case 'success':
        return 'bg-green-500 hover:bg-green-600 text-white';
      case 'error':
        return 'bg-red-500 hover:bg-red-600 text-white';
      default:
        return 'bg-orange-600 hover:bg-orange-700 text-white';
    }
  };

  const getSaveButtonIcon = () => {
    switch (saveStatus) {
      case 'saving':
        return <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />;
      case 'success':
        return <Check size={16} />;
      case 'error':
        return <X size={16} />;
      default:
        return <Save size={16} />;
    }
  };

  if (!isManualPointMode) {
    return null;
  }

  return (
    <div className={`fixed top-4 left-1/2 transform -translate-x-1/2 z-50 ${className}`}>
      <div className="bg-orange-500 text-white px-4 py-3 rounded-lg shadow-lg border-2 border-orange-400 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          {/* Icon and Status */}
          <div className="flex items-center gap-2">
            <Target size={20} className="animate-pulse" />
            <div className="font-semibold text-sm">
              Manuella punkter aktivt
            </div>
          </div>
          
          {/* Instructions */}
          <div className="hidden sm:flex items-center gap-2 text-xs opacity-90">
            <MousePointer size={14} />
            <span>Vänsterklicka på kartan för att sätta ut punkter</span>
          </div>
          
          {/* Point count */}
          <div className="flex items-center gap-1 text-xs bg-orange-600 px-2 py-1 rounded">
            <MapPin size={12} />
            <span>{manualPoints.length} punkter</span>
          </div>
          
          {/* Update points.ts button */}
          <button
            onClick={handleSaveToCode}
            disabled={manualPoints.length === 0 || saveStatus === 'saving'}
            className={`
              px-3 py-1 rounded text-xs font-medium flex items-center gap-2
              transition-all duration-200
              disabled:opacity-50 disabled:cursor-not-allowed
              ${getSaveButtonStyle()}
            `}
          >
            {getSaveButtonIcon()}
            <span className="hidden sm:inline">
              {saveStatus === 'saving' ? 'Sparar...' :
               saveStatus === 'success' ? 'Sparat!' :
               saveStatus === 'error' ? 'Fel!' :
               'Spara till kod'}
            </span>
          </button>
        </div>
        
        {/* Save message */}
        {saveMessage && (
          <div className="mt-2 text-xs opacity-90">
            {saveMessage}
          </div>
        )}
      </div>
    </div>
  );
};

export default ManualPointsIndicator; 