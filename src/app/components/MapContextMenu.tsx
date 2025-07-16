'use client';

import React from 'react';
import { fishingDataManager } from '@/lib/fishingDataManager';
import { Fish, BarChart3, Upload, X, TrendingUp, Download, MapPin, Target } from 'lucide-react';
import { useManualPoints } from '../context/ManualPointsContext';

interface MapContextMenuProps {
  isOpen: boolean;
  position: { x: number; y: number };
  onClose: () => void;
  onRegisterFishingData: () => void;
  onOpenValidation?: () => void;
}

const MapContextMenu: React.FC<MapContextMenuProps> = ({
  isOpen,
  position,
  onClose,
  onRegisterFishingData,
  onOpenValidation,
}) => {
  const { 
    isManualPointMode, 
    setManualPointMode, 
    manualPoints,
    exportManualPoints 
  } = useManualPoints();

  React.useEffect(() => {
    const handleClickOutside = () => {
      if (isOpen) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('click', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('click', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  // Hämta statistik för att visa i menyn
  const stats = fishingDataManager.getStatistics();

  const handleAutoBackup = () => {
    try {
      // Skapa automatisk backup med timestamp
      const exportData = fishingDataManager.exportTrainingData();
      const timestamp = new Date().toISOString().split('T')[0];
      const blob = new Blob([exportData], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `fishing_data_backup_${timestamp}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      alert(`Backup sparad: fishing_data_backup_${timestamp}.json`);
    } catch (error) {
      console.error('Backup error:', error);
      alert('Fel vid backup');
    }
    onClose();
  };

  const handleToggleManualPointMode = () => {
    setManualPointMode(!isManualPointMode);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed bg-white border border-gray-200 rounded-lg shadow-lg py-2 z-50 min-w-56"
      style={{
        left: position.x,
        top: position.y,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between px-4 py-1 text-xs text-gray-500 border-b mb-2">
        <span>Fisk-verktyg ({stats.totalReports} rapporter)</span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="p-1 hover:bg-gray-100 rounded"
        >
          <X size={14} />
        </button>
      </div>
      
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRegisterFishingData();
          onClose();
        }}
        className="w-full text-left px-4 py-2 text-sm hover:bg-blue-50 flex items-center gap-2"
      >
        <Fish size={16} />
        Registrera fiskdata
      </button>
      
      {/* Manual Points */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          handleToggleManualPointMode();
        }}
        className={`w-full text-left px-4 py-2 text-sm hover:bg-orange-50 flex items-center gap-2 ${
          isManualPointMode ? 'bg-orange-100 text-orange-800' : ''
        }`}
      >
        <Target size={16} />
        <div className="flex-1">
          <div>{isManualPointMode ? 'Avsluta manuella punkter' : 'Sätt ut manuella punkter'}</div>
          <div className="text-xs text-gray-500">
            {manualPoints.length} punkter sparade
          </div>
        </div>
        {isManualPointMode && (
          <div className="text-xs bg-orange-100 text-orange-800 px-2 py-1 rounded">
            Aktivt
          </div>
        )}
      </button>
      
      {/* Export Manual Points - endast om det finns punkter */}
      {manualPoints.length > 0 && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            exportManualPoints();
            onClose();
          }}
          className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 flex items-center gap-2"
        >
          <MapPin size={16} />
          <div className="flex-1">
            <div>Exportera punkter</div>
            <div className="text-xs text-gray-500">
              {manualPoints.length} punkter för backend
            </div>
          </div>
        </button>
      )}
      
      {/* Validering - endast om det finns rapporter */}
      {stats.totalReports > 0 && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onOpenValidation?.();
            onClose();
          }}
          className="w-full text-left px-4 py-2 text-sm hover:bg-green-50 flex items-center gap-2"
        >
          <TrendingUp size={16} />
          <div className="flex-1">
            <div>Validera modell</div>
            {stats.totalReports < 10 && (
              <div className="text-xs text-gray-500">Behöver fler rapporter</div>
            )}
          </div>
          {stats.totalReports >= 10 && (
            <div className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
              Redo
            </div>
          )}
        </button>
      )}
      
      <button
        onClick={(e) => {
          e.stopPropagation();
          // TODO: Add functionality to view existing reports in this area
          onClose();
        }}
        className="w-full text-left px-4 py-2 text-sm hover:bg-blue-50 flex items-center gap-2"
      >
        <BarChart3 size={16} />
        Visa befintliga rapporter
      </button>
      
      <div className="border-t my-2"></div>
      
      {/* Förbättrad export med backup-option */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          try {
            fishingDataManager.downloadTrainingData();
            alert('Träningsdata exporterad!');
          } catch (error) {
            console.error('Export error:', error);
            alert('Fel vid export av träningsdata');
          }
          onClose();
        }}
        className="w-full text-left px-4 py-2 text-sm hover:bg-blue-50 flex items-center gap-2"
      >
        <Upload size={16} />
        <div className="flex-1">
          <div>Exportera träningsdata</div>
          <div className="text-xs text-gray-500">För modellträning</div>
        </div>
      </button>
      
      <button
        onClick={(e) => {
          e.stopPropagation();
          handleAutoBackup();
        }}
        className="w-full text-left px-4 py-2 text-sm hover:bg-purple-50 flex items-center gap-2"
      >
        <Download size={16} />
        <div className="flex-1">
          <div>Skapa backup</div>
          <div className="text-xs text-gray-500">Säker datalagring</div>
        </div>
      </button>
    </div>
  );
};

export default MapContextMenu; 