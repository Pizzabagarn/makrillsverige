'use client';

import React from 'react';
import { Popup } from 'react-map-gl/maplibre';
import { Trash2, X } from 'lucide-react';
import { ManualGridPoint } from '@/lib/points';

interface DeletePointPopupProps {
  point: ManualGridPoint;
  onClose: () => void;
  onConfirm: (id: string) => void;
}

const DeletePointPopup: React.FC<DeletePointPopupProps> = ({
  point,
  onClose,
  onConfirm
}) => {
  const handleConfirm = () => {
    try {
      onConfirm(point.id!);
      onClose();
    } catch (error) {
      console.error('Error in handleConfirm:', error);
      // Always close the popup even if there's an error
      onClose();
    }
  };

  return (
    <Popup
      longitude={point.lon}
      latitude={point.lat}
      onClose={onClose}
      closeButton={false}
      closeOnClick={false}
      anchor="bottom"
      offset={[0, -10]}
      className="delete-point-popup"
    >
      <div 
        className="
          backdrop-blur-md bg-red-900/90
          rounded-xl shadow-2xl 
          p-3
          text-white text-sm
          border border-red-400/30
          min-w-[280px]
        "
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Trash2 size={16} className="text-red-300" />
            <h3 className="font-semibold text-red-100">Ta bort manuell punkt</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-red-800/50 rounded transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        {/* Point Info */}
        <div className="mb-3 bg-red-800/30 rounded-lg p-2">
          <div className="text-xs text-red-200 mb-1">Punkt:</div>
          <div className="font-medium text-red-100 mb-1">{point.name}</div>
          <div className="font-mono text-xs text-red-200">
            {point.lat.toFixed(6)}, {point.lon.toFixed(6)}
          </div>
          {point.createdAt && (
            <div className="text-xs text-red-300 mt-1">
              Skapad: {new Date(point.createdAt).toLocaleString('sv-SE')}
            </div>
          )}
        </div>

        {/* Confirmation */}
        <div className="mb-3 text-center">
          <p className="text-red-100 text-sm">
            Är du säker på att du vill ta bort denna punkt?
          </p>
          <p className="text-red-300 text-xs mt-1">
            Denna åtgärd kan inte ångras.
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={handleConfirm}
            className="flex-1 px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
          >
            <Trash2 size={14} />
            Ta bort punkt
          </button>
          
          <button
            onClick={onClose}
            className="px-3 py-2 bg-red-800/50 hover:bg-red-800/70 text-red-200 rounded-lg text-sm transition-colors"
          >
            Avbryt
          </button>
        </div>
      </div>
    </Popup>
  );
};

export default DeletePointPopup; 