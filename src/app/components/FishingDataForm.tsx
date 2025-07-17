'use client';

import React, { useState } from 'react';
import { FishingReport, BBoxTemplate, fishingDataManager } from '@/lib/fishingDataManager';
import { X, Fish, Calendar, Clock, MapPin, Save, Trash2, Bookmark, Plus, Edit } from 'lucide-react';

interface FishingDataFormProps {
  isOpen: boolean;
  onClose: () => void;
  initialLocation?: {
    lat: number;
    lng: number;
  };
  onSave?: (report: FishingReport) => void;
}

const FishingDataForm: React.FC<FishingDataFormProps> = ({ 
  isOpen, 
  onClose, 
  initialLocation,
  onSave 
}) => {
  const [formData, setFormData] = useState({
    dateRange: {
      start: new Date().toISOString().split('T')[0],
      end: new Date().toISOString().split('T')[0]
    },
    timeRange: {
      start: '06:00',
      end: '18:00'
    },
    location: {
      bounds: {
        north: (initialLocation?.lat || 57.0) + 0.01,
        south: (initialLocation?.lat || 57.0) - 0.01,
        east: (initialLocation?.lng || 12.0) + 0.01,
        west: (initialLocation?.lng || 12.0) - 0.01
      },
      centerLat: initialLocation?.lat || 57.0,
      centerLng: initialLocation?.lng || 12.0
    },
    quality: 'good' as FishingReport['quality'],
    customPercentage: 50,
    notes: '',
    timestamp: new Date().toISOString()
  });

  const [existingReports, setExistingReports] = useState<FishingReport[]>([]);
  const [showExistingReports, setShowExistingReports] = useState(false);
  const [bboxTemplates, setBboxTemplates] = useState<BBoxTemplate[]>([]);
  const [showBboxTemplateForm, setShowBboxTemplateForm] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');
  const [editingReportId, setEditingReportId] = useState<string | null>(null);

  React.useEffect(() => {
    if (isOpen) {
      setExistingReports(fishingDataManager.getAllReports());
      setBboxTemplates(fishingDataManager.getAllBBoxTemplates());
      
      // 🔄 AUTOMATISK KONTROLL: Kör backfill om det behövs
      const checkAndBackfillHistoricalData = async () => {
        const reports = fishingDataManager.getAllReports();
        const reportsWithoutHistorical = reports.filter(r => r.historicalModelPrediction === undefined);
        
        if (reportsWithoutHistorical.length > 0) {
    
          
          try {
            const result = await fishingDataManager.backfillHistoricalPredictions();
    
            
            // Uppdatera listan efter backfill
            setExistingReports(fishingDataManager.getAllReports());
          } catch (error) {
            console.error('❌ Automatisk backfill misslyckades:', error);
          }
        }
      };
      
      checkAndBackfillHistoricalData();
    }
  }, [isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      let report;
      
      if (editingReportId) {
        // Uppdatera befintlig rapport
        report = fishingDataManager.updateFishingReport(editingReportId, formData);
        setEditingReportId(null);
      } else {
        // Skapa ny rapport
        report = fishingDataManager.saveFishingReport(formData);
      }
      
      onSave?.(report);
      setExistingReports(fishingDataManager.getAllReports());
      
      // Reset form om det inte är en redigering
      if (!editingReportId) {
        setFormData({
          ...formData,
          quality: 'good',
          customPercentage: 50,
          notes: '',
          timestamp: new Date().toISOString()
        });
      }
      
      // Stäng formuläret
      onClose();
    } catch (error) {
      console.error('Error saving fishing report:', error);
      alert('Fel vid sparande av fiskrapport');
    }
  };

  const handleDeleteReport = (id: string) => {
    if (confirm('Är du säker på att du vill ta bort denna rapport?')) {
      if (fishingDataManager.deleteReport(id)) {
        setExistingReports(fishingDataManager.getAllReports());
        // Om vi redigerar denna rapport, avbryt redigeringen
        if (editingReportId === id) {
          setEditingReportId(null);
        }
      }
    }
  };

  const handleEditReport = (report: FishingReport) => {
    // Fyll formuläret med befintliga data
    setFormData({
      dateRange: report.dateRange,
      timeRange: report.timeRange,
      location: report.location,
      quality: report.quality,
      customPercentage: report.customPercentage || 50,
      notes: report.notes || '',
      timestamp: report.timestamp
    });
    
    setEditingReportId(report.id);
    setShowExistingReports(true); // Håll listan öppen så användaren ser vad som redigeras
  };

  const handleCancelEdit = () => {
    setEditingReportId(null);
    // Återställ formulär till standardvärden
    setFormData({
      dateRange: {
        start: new Date().toISOString().split('T')[0],
        end: new Date().toISOString().split('T')[0]
      },
      timeRange: {
        start: '06:00',
        end: '18:00'
      },
      location: {
        bounds: {
          north: (initialLocation?.lat || 57.0) + 0.01,
          south: (initialLocation?.lat || 57.0) - 0.01,
          east: (initialLocation?.lng || 12.0) + 0.01,
          west: (initialLocation?.lng || 12.0) - 0.01
        },
        centerLat: initialLocation?.lat || 57.0,
        centerLng: initialLocation?.lng || 12.0
      },
      quality: 'good' as FishingReport['quality'],
      customPercentage: 50,
      notes: '',
      timestamp: new Date().toISOString()
    });
  };

  const handleBackfillHistoricalPredictions = async () => {
    if (!confirm('Vill du fylla i historiska sannolikheter för befintliga rapporter? Detta kan ta några sekunder.')) {
      return;
    }
    
    try {
      const result = await fishingDataManager.backfillHistoricalPredictions();
      alert(`Historisk data uppdaterad! ${result.updated} rapporter uppdaterade, ${result.failed} misslyckade.`);
      setExistingReports(fishingDataManager.getAllReports());
    } catch (error) {
      console.error('Backfill error:', error);
      alert('Fel vid uppdatering av historisk data');
    }
  };

  const handleSaveBboxTemplate = () => {
    if (!templateName.trim()) {
      alert('Du måste ange ett namn för templaten');
      return;
    }

    try {
      fishingDataManager.saveBBoxTemplate({
        name: templateName,
        bounds: formData.location.bounds,
        description: templateDescription
      });
      
      setBboxTemplates(fishingDataManager.getAllBBoxTemplates());
      setTemplateName('');
      setTemplateDescription('');
      setShowBboxTemplateForm(false);
      alert('BBox-template sparad!');
    } catch (error) {
      console.error('Error saving bbox template:', error);
      alert('Fel vid sparande av template');
    }
  };

  const handleLoadBboxTemplate = (template: BBoxTemplate) => {
    setFormData({
      ...formData,
      location: {
        bounds: template.bounds,
        centerLat: (template.bounds.north + template.bounds.south) / 2,
        centerLng: (template.bounds.east + template.bounds.west) / 2
      }
    });
  };

  const handleDeleteBboxTemplate = (id: string) => {
    if (confirm('Är du säker på att du vill ta bort denna template?')) {
      fishingDataManager.deleteBBoxTemplate(id);
      setBboxTemplates(fishingDataManager.getAllBBoxTemplates());
    }
  };

  // Helper function to safely parse float values from input
  const parseFloatSafe = (value: string): number => {
    if (!value || value.trim() === '') return 0;
    const parsed = parseFloat(value);
    return isNaN(parsed) ? 0 : parsed;
  };

  // Helper function to clear coordinates
  const clearCoordinates = () => {
    setFormData({
      ...formData,
      location: {
        ...formData.location,
        bounds: {
          north: 0,
          south: 0,
          east: 0,
          west: 0
        }
      }
    });
  };

  const qualityOptions = [
    { value: 'excellent', label: '🐟🐟🐟 Excellent', color: 'text-green-600' },
    { value: 'good', label: '🐟🐟 Good', color: 'text-blue-600' },
    { value: 'fair', label: '🐟 Fair', color: 'text-yellow-600' },
    { value: 'poor', label: '⚪ Poor', color: 'text-orange-600' },
    { value: 'none', label: '❌ None', color: 'text-red-600' },
    { value: 'custom', label: '🔢 Custom (%)', color: 'text-purple-600' }
  ];

  const stats = fishingDataManager.getStatistics();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto m-4">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Fish className="text-blue-600" />
            {editingReportId ? 'Redigera Fiskrapport' : 'Registrera Fiskdata'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6">
          {/* Redigeringsindikator */}
          {editingReportId && (
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-center gap-2 text-blue-800">
                <Edit size={16} />
                <span className="font-medium">Redigerar rapport</span>
              </div>
              <p className="text-sm text-blue-600 mt-1">
                Gör dina ändringar och klicka på "Uppdatera Rapport" för att spara.
              </p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Date Range */}
            <div className="space-y-2">
              <label className="block text-sm font-medium flex items-center gap-2">
                <Calendar size={16} />
                Datumintervall
              </label>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Från</label>
                  <input
                    type="date"
                    value={formData.dateRange.start}
                    onChange={(e) => setFormData({
                      ...formData,
                      dateRange: { ...formData.dateRange, start: e.target.value }
                    })}
                    className="w-full p-2 border rounded-md"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Till</label>
                  <input
                    type="date"
                    value={formData.dateRange.end}
                    onChange={(e) => setFormData({
                      ...formData,
                      dateRange: { ...formData.dateRange, end: e.target.value }
                    })}
                    className="w-full p-2 border rounded-md"
                    required
                  />
                </div>
              </div>
            </div>

            {/* Time Range */}
            <div className="space-y-2">
              <label className="block text-sm font-medium flex items-center gap-2">
                <Clock size={16} />
                Tidsintervall
              </label>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Från</label>
                  <input
                    type="time"
                    value={formData.timeRange.start}
                    onChange={(e) => setFormData({
                      ...formData,
                      timeRange: { ...formData.timeRange, start: e.target.value }
                    })}
                    className="w-full p-2 border rounded-md"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Till</label>
                  <input
                    type="time"
                    value={formData.timeRange.end}
                    onChange={(e) => setFormData({
                      ...formData,
                      timeRange: { ...formData.timeRange, end: e.target.value }
                    })}
                    className="w-full p-2 border rounded-md"
                    required
                  />
                </div>
              </div>
            </div>

            {/* Location */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-sm font-medium flex items-center gap-2">
                  <MapPin size={16} />
                  Plats (Bounding Box)
                </label>
                <button
                  type="button"
                  onClick={clearCoordinates}
                  className="text-xs text-blue-600 hover:text-blue-800 px-2 py-1 rounded border border-blue-300 hover:bg-blue-50"
                >
                  Rensa koordinater
                </button>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Nord</label>
                  <input
                    type="number"
                    step="0.001"
                    value={formData.location.bounds.north}
                    onChange={(e) => setFormData({
                      ...formData,
                      location: {
                        ...formData.location,
                        bounds: { ...formData.location.bounds, north: parseFloatSafe(e.target.value) }
                      }
                    })}
                    className="w-full p-2 border rounded-md"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Syd</label>
                  <input
                    type="number"
                    step="0.001"
                    value={formData.location.bounds.south}
                    onChange={(e) => setFormData({
                      ...formData,
                      location: {
                        ...formData.location,
                        bounds: { ...formData.location.bounds, south: parseFloatSafe(e.target.value) }
                      }
                    })}
                    className="w-full p-2 border rounded-md"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Öst</label>
                  <input
                    type="number"
                    step="0.001"
                    value={formData.location.bounds.east}
                    onChange={(e) => setFormData({
                      ...formData,
                      location: {
                        ...formData.location,
                        bounds: { ...formData.location.bounds, east: parseFloatSafe(e.target.value) }
                      }
                    })}
                    className="w-full p-2 border rounded-md"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Väst</label>
                  <input
                    type="number"
                    step="0.001"
                    value={formData.location.bounds.west}
                    onChange={(e) => setFormData({
                      ...formData,
                      location: {
                        ...formData.location,
                        bounds: { ...formData.location.bounds, west: parseFloatSafe(e.target.value) }
                      }
                    })}
                    className="w-full p-2 border rounded-md"
                    required
                  />
                </div>
              </div>
            </div>

            {/* BBox Template Management */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-sm font-medium flex items-center gap-2">
                  <Bookmark size={16} />
                  BBox Templates
                </label>
                <button
                  type="button"
                  onClick={() => setShowBboxTemplateForm(!showBboxTemplateForm)}
                  className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
                >
                  <Plus size={14} />
                  Spara Template
                </button>
              </div>

              {/* Template Selection */}
              {bboxTemplates.length > 0 && (
                <div className="space-y-2">
                  <label className="block text-xs text-gray-500">Ladda sparad template:</label>
                  <div className="grid grid-cols-1 gap-2 max-h-32 overflow-y-auto">
                    {bboxTemplates.map((template) => (
                      <div key={template.id} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                        <div className="flex-1">
                          <div className="font-medium text-sm">{template.name}</div>
                          {template.description && (
                            <div className="text-xs text-gray-500">{template.description}</div>
                          )}
                        </div>
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={() => handleLoadBboxTemplate(template)}
                            className="px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600"
                          >
                            Ladda
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteBboxTemplate(template.id)}
                            className="px-2 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600"
                          >
                            Ta bort
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Template Creation Form */}
              {showBboxTemplateForm && (
                <div className="p-3 bg-blue-50 rounded-lg space-y-3">
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Template namn</label>
                    <input
                      type="text"
                      value={templateName}
                      onChange={(e) => setTemplateName(e.target.value)}
                      className="w-full p-2 border rounded-md text-sm"
                      placeholder="T.ex. Göteborg hamn"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Beskrivning (valfritt)</label>
                    <input
                      type="text"
                      value={templateDescription}
                      onChange={(e) => setTemplateDescription(e.target.value)}
                      className="w-full p-2 border rounded-md text-sm"
                      placeholder="T.ex. Bra område för makrill på sommaren"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleSaveBboxTemplate}
                      className="flex-1 bg-blue-600 text-white py-2 px-3 rounded-md hover:bg-blue-700 text-sm"
                    >
                      Spara Template
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowBboxTemplateForm(false)}
                      className="px-3 py-2 border rounded-md hover:bg-gray-50 text-sm"
                    >
                      Avbryt
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Quality */}
            <div className="space-y-2">
              <label className="block text-sm font-medium">Fiskekvalitet</label>
              <div className="space-y-2">
                {qualityOptions.map((option) => (
                  <label key={option.value} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="quality"
                      value={option.value}
                      checked={formData.quality === option.value}
                      onChange={(e) => setFormData({
                        ...formData,
                        quality: e.target.value as FishingReport['quality']
                      })}
                      className="w-4 h-4"
                    />
                    <span className={option.color}>{option.label}</span>
                  </label>
                ))}
              </div>
              
              {/* Custom Percentage Input */}
              {formData.quality === 'custom' && (
                <div className="ml-6 mt-3 p-3 bg-purple-50 rounded-lg border border-purple-200">
                  <label className="block text-sm font-medium text-purple-800 mb-2">
                    Ange procenttal (0-100%)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={formData.customPercentage}
                      onChange={(e) => setFormData({
                        ...formData,
                        customPercentage: Math.max(0, Math.min(100, parseInt(e.target.value) || 0))
                      })}
                      className="w-20 p-2 border border-purple-300 rounded-md text-center focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                      placeholder="50"
                    />
                    <span className="text-sm text-purple-600">%</span>
                  </div>
                  <div className="text-xs text-purple-600 mt-1">
                    T.ex: 25% = låg chans, 50% = medel, 75% = hög chans
                  </div>
                </div>
              )}
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <label className="block text-sm font-medium">Anteckningar</label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="w-full p-2 border rounded-md"
                rows={3}
                placeholder="Valfria anteckningar om fisket..."
              />
            </div>

            {/* Submit Button */}
            <div className="flex gap-3">
              <button
                type="submit"
                className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 flex items-center justify-center gap-2"
              >
                <Save size={16} />
                {editingReportId ? 'Uppdatera Rapport' : 'Spara Rapport'}
              </button>
              {editingReportId && (
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="px-4 py-2 border rounded-md hover:bg-gray-50 text-sm"
                >
                  Avbryt
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowExistingReports(!showExistingReports)}
                className="px-4 py-2 border rounded-md hover:bg-gray-50"
              >
                Visa Befintliga ({stats.totalReports})
              </button>
              {showExistingReports && (
                <button
                  type="button"
                  onClick={handleBackfillHistoricalPredictions}
                  className="px-4 py-2 border rounded-md hover:bg-gray-50 text-sm"
                >
                  Fyll i historisk data
                </button>
              )}
            </div>
          </form>

          {/* Existing Reports */}
          {showExistingReports && (
            <div className="mt-6 border-t pt-6">
              <h3 className="text-lg font-semibold mb-4">Befintliga Rapporter</h3>
              
              {/* Statistics */}
              <div className="bg-gray-50 p-4 rounded-lg mb-4">
                <h4 className="font-medium mb-2">Statistik</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-600">Totalt: </span>
                    <span className="font-medium">{stats.totalReports} rapporter</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Kvalitetsfördelning:</span>
                    <ul className="text-xs mt-1">
                      {Object.entries(stats.byQuality || {}).map(([quality, count]) => (
                        <li key={quality}>
                          {quality}: {count}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>

              {/* Reports List */}
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {existingReports.map((report) => (
                  <div 
                    key={report.id} 
                    className={`border rounded-lg p-3 ${
                      editingReportId === report.id 
                        ? 'bg-blue-50 border-blue-300' 
                        : 'bg-white'
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          {editingReportId === report.id && (
                            <Edit size={14} className="text-blue-600" />
                          )}
                          <span className={
                            qualityOptions.find(q => q.value === report.quality)?.color || 'text-gray-600'
                          }>
                            {qualityOptions.find(q => q.value === report.quality)?.label || report.quality}
                            {report.quality === 'custom' && report.customPercentage && (
                              <span className="ml-2 text-purple-700 font-medium">
                                {report.customPercentage}%
                              </span>
                            )}
                          </span>
                          {editingReportId === report.id && (
                            <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                              Redigeras
                            </span>
                          )}
                          {/* Visuell indikator för historisk sannolikhet */}
                          {report.historicalModelPrediction !== undefined && (
                            <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                              ✓ Historisk {report.historicalModelPrediction}%
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-gray-600">
                          <div>{report.dateRange.start} - {report.dateRange.end}</div>
                          <div>{report.timeRange.start} - {report.timeRange.end}</div>
                          <div>Lat: {report.location.centerLat.toFixed(3)}, Lng: {report.location.centerLng.toFixed(3)}</div>
                        </div>
                        {report.notes && (
                          <div className="text-sm text-gray-500 mt-1">{report.notes}</div>
                        )}
                      </div>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => handleEditReport(report)}
                          className="p-1 text-blue-500 hover:bg-blue-50 rounded"
                        >
                          <Edit size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteReport(report.id)}
                          className="p-1 text-red-500 hover:bg-red-50 rounded"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default FishingDataForm; 