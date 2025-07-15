'use client';

import React, { useState, useEffect } from 'react';
import { X, Download, CheckCircle, AlertCircle, Clock } from 'lucide-react';
import LayerPreloadingManager from '@/lib/layerPreloadingManager';

interface PreloadingStatusDashboardProps {
  isOpen: boolean;
  onClose: () => void;
}

const PreloadingStatusDashboard: React.FC<PreloadingStatusDashboardProps> = ({ 
  isOpen, 
  onClose 
}) => {
  const [statuses, setStatuses] = useState<any[]>([]);
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    const updateStatuses = () => {
      const manager = LayerPreloadingManager.getInstance();
      const allStatuses = manager.getAllPreloadingStatuses();
      setStatuses(allStatuses);
      setIsComplete(manager.isPreloadingComplete());
    };

    // Uppdatera direkt
    updateStatuses();

    // Uppdatera var 500ms under preloading
    const interval = setInterval(updateStatuses, 500);

    return () => clearInterval(interval);
  }, [isOpen]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'loaded':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'loading':
        return <Download className="w-5 h-5 text-blue-500 animate-spin" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-red-500" />;
      default:
        return <Clock className="w-5 h-5 text-gray-400" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'loaded':
        return 'bg-green-500';
      case 'loading':
        return 'bg-blue-500';
      case 'error':
        return 'bg-red-500';
      default:
        return 'bg-gray-300';
    }
  };

  const getLayerDisplayName = (layer: string) => {
    const names: Record<string, string> = {
      'current-magnitude': 'Strömstyrka',
      'temperature': 'Temperatur',
      'salinity': 'Saltvattensgradient',
      'mackerel-probability': 'Makrillsannolikhet'
    };
    return names[layer] || layer;
  };

  const totalImages = statuses.reduce((sum, status) => sum + status.totalImages, 0);
  const loadedImages = statuses.reduce((sum, status) => sum + status.loadedImages, 0);
  const overallProgress = totalImages > 0 ? (loadedImages / totalImages) * 100 : 0;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-bold text-gray-800">Preloading Status</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Overall Progress */}
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">Total Progress</span>
              <span className="text-sm text-gray-500">
                {loadedImages} / {totalImages} bilder
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${overallProgress}%` }}
              />
            </div>
            <div className="mt-1 text-xs text-gray-500">
              {overallProgress.toFixed(1)}% klart
            </div>
            {isComplete && (
              <div className="mt-2 text-green-600 text-sm font-medium">
                ✅ Alla lager preloadade!
              </div>
            )}
          </div>

          {/* Individual Layer Status */}
          <div className="space-y-3">
            {statuses.map((status) => (
              <div key={status.layer} className="border rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    {getStatusIcon(status.status)}
                    <span className="font-medium text-gray-700">
                      {getLayerDisplayName(status.layer)}
                    </span>
                  </div>
                  <span className="text-sm text-gray-500">
                    {status.loadedImages} / {status.totalImages}
                  </span>
                </div>
                
                <div className="w-full bg-gray-200 rounded-full h-1.5">
                  <div 
                    className={`h-1.5 rounded-full transition-all duration-300 ${getStatusColor(status.status)}`}
                    style={{ width: `${status.progress}%` }}
                  />
                </div>
                
                <div className="mt-1 text-xs text-gray-500">
                  {status.progress.toFixed(1)}% 
                  {status.status === 'loaded' && status.endTime && status.startTime && (
                    <span className="ml-2">
                      • {((status.endTime - status.startTime) / 1000).toFixed(1)}s
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Instructions */}
          <div className="bg-blue-50 rounded-lg p-4">
            <h3 className="font-medium text-blue-800 mb-2">Preloading Info</h3>
            <ul className="text-sm text-blue-700 space-y-1">
              <li>• Bilder preloadar i bakgrunden för snabbare laddning</li>
              <li>• Strömstyrka laddas först (högst prioritet)</li>
              <li>• Du kan stänga denna dialog och laddningen fortsätter</li>
              <li>• Preloaded bilder visas omedelbart när du växlar lager</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PreloadingStatusDashboard; 