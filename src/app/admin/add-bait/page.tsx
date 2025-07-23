'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Link as LinkIcon, Loader2, CheckCircle, XCircle, Package, ExternalLink, Edit, Fish, Trash2 } from 'lucide-react';

interface ScrapedProductInfo {
  id?: string;
  title: string;
  price?: number;
  originalPrice?: number;
  currency: string;
  image?: string;
  description?: string;
  inStock?: boolean;
  retailer: string;
  url: string;
  category?: string;
  brand?: string;
  lastUpdated: string;
  // New fields for fish association
  fishSpecies?: string[];
  effectiveness?: number; // 1-5 stjärnor
  techniques?: string[];
  seasons?: string[];
  categoryDescription?: string; // Added for category description
}

export default function AddBaitPage() {
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [productInfo, setProductInfo] = useState<ScrapedProductInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedProducts, setSavedProducts] = useState<ScrapedProductInfo[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ScrapedProductInfo | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);

  // Editing state
  const [editedInfo, setEditedInfo] = useState<ScrapedProductInfo | null>(null);

  // Load existing saved products on component mount
  useEffect(() => {
    const loadSavedProducts = async () => {
      try {
        const response = await fetch('/api/saved-baits');
        if (response.ok) {
          const products = await response.json();
          setSavedProducts(products);
          console.log(`📦 Laddade ${products.length} sparade produkter`);
        }
      } catch (err) {
        console.warn('Kunde inte ladda sparade produkter:', err);
      }
    };

    loadSavedProducts();
  }, []);

  const handleScrapeProduct = async () => {
    if (!url.trim()) {
      setError('Vänligen ange en produktlänk');
      return;
    }

    setIsLoading(true);
    setError(null);
    setProductInfo(null);

    try {
      const response = await fetch('/api/scrape-product-url', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: url.trim() }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Kunde inte hämta produktinformation');
      }

      const data = await response.json();
      console.log('📦 Received product data:', data); // Debug logging
      setProductInfo(data);
      setEditedInfo({...data, effectiveness: 5}); // Initialize editing state with 5 stars default
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ett fel uppstod');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveProduct = async () => {
    const productToSave = isEditing ? editedInfo : productInfo;
    if (productToSave) {
      try {
        // Spara till API
        const response = await fetch('/api/saved-baits', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(productToSave),
        });

        if (response.ok) {
          setSavedProducts(prev => [...prev, productToSave]);
          
          // Clear form for next product
          setUrl('');
          setProductInfo(null);
          setEditedInfo(null);
          setError(null);
          setIsEditing(false);
          
          console.log('✅ Produkt sparad till API');
        } else {
          throw new Error('Kunde inte spara produkt');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Kunde inte spara produkt');
      }
    }
  };

  const handleDeleteProduct = async (productId: string) => {
    if (!confirm('Är du säker på att du vill ta bort detta bete?')) {
      return;
    }

    try {
      const response = await fetch(`/api/saved-baits?id=${productId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setSavedProducts(prev => prev.filter(p => p.id !== productId));
        console.log('✅ Produkt borttagen');
      } else {
        throw new Error('Kunde inte ta bort produkt');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunde inte ta bort produkt');
    }
  };

  const handleEditProduct = (product: ScrapedProductInfo) => {
    setEditingProduct(product);
    setEditedInfo({...product});
    setShowEditModal(true);
  };

  const handleSaveEditedProduct = async () => {
    if (!editedInfo || !editingProduct) return;

    try {
      const response = await fetch('/api/saved-baits', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(editedInfo),
      });

      if (response.ok) {
        // Update the product in the savedProducts array
        setSavedProducts(prev => 
          prev.map(p => 
            p.id === editingProduct.id ? editedInfo : p
          )
        );
        
        // Close modal and reset states
        setShowEditModal(false);
        setEditingProduct(null);
        setEditedInfo(null);
        setError(null);
        
        console.log('✅ Produkt uppdaterad');
      } else {
        throw new Error('Kunde inte uppdatera produkt');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunde inte uppdatera produkt');
    }
  };

  const getSupportedRetailers = () => [
    'Sportfiskeprylar.se',
    'Utklasad.se', 
    'Fishline.se / Fishsports',
    'Eagle.fishing',
    'Sportfiskedrag.se'
  ];

  const getFishSpeciesList = () => [
    'Abborre', 'Gädda', 'Lax', 'Torsk', 'Öring', 'Gös', 'Havsöring', 'Regnbåge', 'Röding'
  ];

  const getCategoriesList = () => [
    'Jiggar', 'Spinnare', 'Wobblers', 'Jerkbaits', 'Swimbaits', 'Pilkar', 'Flugor', 'Trollingbeten'
  ];

  const getCurrentInfo = () => isEditing ? editedInfo : productInfo;

  return (
    <div className="text-white p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link 
            href="/admin" 
            className="flex items-center gap-2 text-blue-400 hover:text-blue-300 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            Tillbaka till Admin
          </Link>
        </div>

        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
            Lägg till Beten från Länk
          </h1>
          <p className="text-xl text-white/70">
            Klistra in en produktlänk så hämtar vi automatiskt all information
          </p>
        </div>

        {/* Supported retailers info */}
        <div className="bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 p-6 mb-8">
          <h3 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
            <Package className="w-5 h-5 text-green-400" />
            Butiker vi stödjer:
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {getSupportedRetailers().map((retailer) => (
              <div key={retailer} className="flex items-center gap-2 text-white/80">
                <CheckCircle className="w-4 h-4 text-green-400" />
                <span className="text-sm">{retailer}</span>
              </div>
            ))}
          </div>
        </div>

        {/* URL Input Form */}
        <div className="bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 p-8 mb-8">
          <div className="flex items-center gap-4 mb-6">
            <LinkIcon className="w-6 h-6 text-blue-400" />
            <h2 className="text-2xl font-semibold">Hämta produktinfo</h2>
          </div>

          <div className="space-y-4">
            <div>
              <label htmlFor="product-url" className="block text-sm font-medium text-white/80 mb-2">
                Produktlänk
              </label>
              <input
                id="product-url"
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://www.sportfiskeprylar.se/westin-bloodteez-worm"
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                disabled={isLoading}
              />
            </div>

            <button
              onClick={handleScrapeProduct}
              disabled={isLoading || !url.trim()}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg font-medium transition-all duration-200"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Hämtar produktinfo...
                </>
              ) : (
                <>
                  <Package className="w-5 h-5" />
                  Hämta produktinfo
                </>
              )}
            </button>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-red-500/20 border border-red-500/30 rounded-2xl p-6 mb-8">
            <div className="flex items-center gap-3">
              <XCircle className="w-6 h-6 text-red-400" />
              <div>
                <h3 className="font-medium text-red-300">Fel vid hämtning</h3>
                <p className="text-red-200 mt-1">{error}</p>
              </div>
            </div>
          </div>
        )}

        {/* Product Info Display */}
        {getCurrentInfo() && (
          <div className="bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 p-8 mb-8">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-4">
                <CheckCircle className="w-6 h-6 text-green-400" />
                <h2 className="text-2xl font-semibold">
                  {isEditing ? 'Redigera produktinformation' : 'Produktinformation hämtad'}
                </h2>
              </div>
              <button
                onClick={() => setIsEditing(!isEditing)}
                className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
              >
                <Edit className="w-4 h-4" />
                {isEditing ? 'Avbryt redigering' : 'Redigera'}
              </button>
            </div>

            <div className="grid md:grid-cols-2 gap-8">
              {/* Product Image */}
              {getCurrentInfo()?.image && (
                <div className="space-y-4">
                  <img 
                    src={getCurrentInfo()?.image} 
                    alt={getCurrentInfo()?.title}
                    className="w-full h-64 object-cover rounded-lg bg-white/10"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                </div>
              )}

              {/* Product Details */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-white/60 mb-1">Produktnamn</label>
                  {isEditing ? (
                    <input
                      type="text"
                      value={editedInfo?.title || ''}
                      onChange={(e) => setEditedInfo(prev => prev ? {...prev, title: e.target.value} : null)}
                      className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white"
                    />
                  ) : (
                    <div className="px-3 py-2 bg-white/10 rounded-lg">
                      <p className="text-white font-medium">{getCurrentInfo()?.title}</p>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-white/60 mb-1">Pris (SEK)</label>
                    {isEditing ? (
                      <input
                        type="number"
                        value={editedInfo?.price || ''}
                        onChange={(e) => setEditedInfo(prev => prev ? {...prev, price: e.target.value ? parseFloat(e.target.value) : undefined} : null)}
                        className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white"
                        placeholder="89"
                      />
                    ) : (
                      <div className="px-3 py-2 bg-white/10 rounded-lg">
                        <p className="text-green-400 font-bold">
                          {getCurrentInfo()?.price ? `${getCurrentInfo()?.price} ${getCurrentInfo()?.currency}` : 'Ej angivet'}
                        </p>
                                                 {getCurrentInfo()?.originalPrice && getCurrentInfo()?.price && (getCurrentInfo()?.originalPrice ?? 0) > (getCurrentInfo()?.price ?? 0) && (
                          <p className="text-white/60 line-through text-sm">
                            {getCurrentInfo()?.originalPrice} {getCurrentInfo()?.currency}
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-white/60 mb-1">Butik</label>
                    <div className="px-3 py-2 bg-white/10 rounded-lg">
                      <p className="text-white">{getCurrentInfo()?.retailer}</p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-white/60 mb-1">Kategori</label>
                    {isEditing ? (
                      <select
                        value={editedInfo?.category || ''}
                        onChange={(e) => setEditedInfo(prev => prev ? {...prev, category: e.target.value} : null)}
                        className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white"
                      >
                        <option value="">Välj kategori</option>
                        {getCategoriesList().map(cat => (
                          <option key={cat} value={cat} className="bg-slate-800">{cat}</option>
                        ))}
                      </select>
                    ) : (
                      <div className="px-3 py-2 bg-white/10 rounded-lg">
                        <p className="text-white">{getCurrentInfo()?.category || 'Okänd'}</p>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-white/60 mb-1">I lager</label>
                    {isEditing ? (
                      <select
                        value={editedInfo?.inStock ? 'true' : 'false'}
                        onChange={(e) => setEditedInfo(prev => prev ? {...prev, inStock: e.target.value === 'true'} : null)}
                        className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white"
                      >
                        <option value="true" className="bg-slate-800">I lager</option>
                        <option value="false" className="bg-slate-800">Ej i lager</option>
                      </select>
                    ) : (
                      <div className="px-3 py-2 bg-white/10 rounded-lg">
                        <p className={`font-medium ${getCurrentInfo()?.inStock ? 'text-green-400' : 'text-red-400'}`}>
                          {getCurrentInfo()?.inStock ? 'Ja' : 'Okänt'}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Produktbeskrivning */}
                <div>
                  <label className="block text-sm font-medium text-white/60 mb-1">Produktbeskrivning (valfritt)</label>
                  {isEditing ? (
                    <textarea
                      value={editedInfo?.description || ''}
                      onChange={(e) => setEditedInfo(prev => prev ? {...prev, description: e.target.value} : null)}
                      className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white resize-none"
                      rows={3}
                      placeholder="En kort beskrivning av betet och dess egenskaper..."
                    />
                  ) : (
                    <div className="px-3 py-2 bg-white/10 rounded-lg">
                      <p className="text-white/80 text-sm leading-relaxed">
                        {getCurrentInfo()?.description || 'Ingen beskrivning angiven'}
                      </p>
                    </div>
                  )}
                </div>

                {/* Kategoribeskrivning */}
                <div>
                  <label className="block text-sm font-medium text-white/60 mb-1">Kategoribeskrivning (valfritt)</label>
                  {isEditing ? (
                    <div>
                      <textarea
                        value={editedInfo?.categoryDescription || ''}
                        onChange={(e) => setEditedInfo(prev => prev ? {...prev, categoryDescription: e.target.value} : null)}
                        className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white resize-none"
                        rows={3}
                        placeholder="Förklara vad denna kategori av beten används till och när de är mest effektiva..."
                      />
                      <p className="text-xs text-white/50 mt-1">
                        Denna beskrivning visas för alla beten i kategorien &quot;{editedInfo?.category || 'vald kategori'}&quot;
                      </p>
                    </div>
                  ) : (
                    <div className="px-3 py-2 bg-white/10 rounded-lg">
                      <p className="text-white/80 text-sm leading-relaxed">
                        {getCurrentInfo()?.categoryDescription || 'Ingen kategoribeskrivning angiven'}
                      </p>
                    </div>
                  )}
                </div>

                {/* Effectiveness rating */}
                <div>
                  <label className="block text-sm font-medium text-white/60 mb-1">
                    ⭐ Effektivitet (1-5 stjärnor)
                  </label>
                  {isEditing ? (
                    <div className="flex gap-2 p-3 bg-white/10 rounded-lg">
                      {[1, 2, 3, 4, 5].map(rating => (
                        <button
                          key={rating}
                          type="button"
                          onClick={() => setEditedInfo(prev => prev ? {...prev, effectiveness: rating} : null)}
                          className={`text-2xl transition-colors ${
                            (editedInfo?.effectiveness || 0) >= rating 
                              ? 'text-yellow-400 hover:text-yellow-300' 
                              : 'text-white/30 hover:text-white/50'
                          }`}
                        >
                          ⭐
                        </button>
                      ))}
                      <span className="text-white ml-2 self-center">
                        {editedInfo?.effectiveness ? `${editedInfo.effectiveness}/5` : 'Ej betygsatt'}
                      </span>
                    </div>
                  ) : (
                    <div className="px-3 py-2 bg-white/10 rounded-lg">
                      <div className="flex items-center gap-2">
                        {getCurrentInfo()?.effectiveness ? (
                          <>
                            {Array.from({length: 5}, (_, i) => (
                              <span key={i} className={`text-xl ${
                                i < (getCurrentInfo()?.effectiveness || 0) ? 'text-yellow-400' : 'text-white/30'
                              }`}>
                                ⭐
                              </span>
                            ))}
                            <span className="text-white ml-2">
                              {getCurrentInfo()?.effectiveness}/5
                            </span>
                          </>
                        ) : (
                          <span className="text-white/60">Ej betygsatt</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Fish species selection */}
                <div>
                  <label className="block text-sm font-medium text-white/60 mb-1">
                    <Fish className="w-4 h-4 inline mr-1" />
                    Lämplig för fiskarter
                  </label>
                  {isEditing ? (
                    <div className="grid grid-cols-3 gap-2 p-3 bg-white/10 rounded-lg">
                      {getFishSpeciesList().map(fish => (
                        <label key={fish} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={editedInfo?.fishSpecies?.includes(fish) || false}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setEditedInfo(prev => prev ? {
                                  ...prev, 
                                  fishSpecies: [...(prev.fishSpecies || []), fish]
                                } : null);
                              } else {
                                setEditedInfo(prev => prev ? {
                                  ...prev,
                                  fishSpecies: prev.fishSpecies?.filter(f => f !== fish) || []
                                } : null);
                              }
                            }}
                            className="rounded"
                          />
                          <span className="text-sm text-white">{fish}</span>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <div className="px-3 py-2 bg-white/10 rounded-lg">
                      <p className="text-white">
                        {getCurrentInfo()?.fishSpecies?.length ? 
                          getCurrentInfo()?.fishSpecies?.join(', ') : 
                          'Inga fiskarter valda'
                        }
                      </p>
                    </div>
                  )}
                </div>

                {getCurrentInfo()?.description && (
                  <div>
                    <label className="block text-sm font-medium text-white/60 mb-1">Beskrivning</label>
                    {isEditing ? (
                      <textarea
                        value={editedInfo?.description || ''}
                        onChange={(e) => setEditedInfo(prev => prev ? {...prev, description: e.target.value} : null)}
                        className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white"
                        rows={3}
                      />
                    ) : (
                      <div className="px-3 py-2 bg-white/10 rounded-lg">
                        <p className="text-white/80 text-sm">{getCurrentInfo()?.description}</p>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex gap-3 pt-4">
                  <button
                    onClick={handleSaveProduct}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 rounded-lg font-medium transition-all duration-200"
                  >
                    <CheckCircle className="w-5 h-5" />
                    Spara produkt
                  </button>
                  <a
                    href={getCurrentInfo()?.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg font-medium transition-all duration-200"
                  >
                    <ExternalLink className="w-5 h-5" />
                    Visa i butik
                  </a>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Saved Products */}
        {savedProducts.length > 0 && (
          <div className="bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 p-8">
            <h2 className="text-2xl font-semibold mb-6 flex items-center gap-3">
              <Package className="w-6 h-6 text-green-400" />
              Sparade produkter ({savedProducts.length})
            </h2>

            <div className="space-y-4">
              {savedProducts.map((product, index) => (
                <div key={product.id || index} className="bg-white/5 rounded-lg p-4 border border-white/10">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      {product.image && (
                        <img 
                          src={product.image} 
                          alt={product.title}
                          className="w-16 h-16 object-cover rounded-lg bg-white/10"
                        />
                      )}
                      <div>
                        <h3 className="font-medium text-white">{product.title}</h3>
                        <p className="text-white/60 text-sm">{product.retailer}</p>
                        <p className="text-green-400 font-bold">
                          {product.price ? `${product.price} ${product.currency}` : 'Pris ej angivet'}
                        </p>
                        
                        {/* Effectiveness rating display */}
                        {product.effectiveness && (
                          <div className="flex items-center gap-1 mt-1">
                            {Array.from({length: 5}, (_, i) => (
                              <span key={i} className={`text-sm ${
                                i < product.effectiveness! ? 'text-yellow-400' : 'text-white/30'
                              }`}>
                                ⭐
                              </span>
                            ))}
                            <span className="text-white/60 text-xs ml-1">
                              {product.effectiveness}/5
                            </span>
                          </div>
                        )}
                        
                        {product.fishSpecies && product.fishSpecies.length > 0 && (
                          <div className="flex gap-1 mt-1">
                            {product.fishSpecies.map(fish => (
                              <span key={fish} className="px-2 py-1 bg-blue-500/20 text-blue-300 text-xs rounded">
                                {fish}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <a
                        href={product.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 px-3 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm transition-all duration-200"
                      >
                        <ExternalLink className="w-4 h-4" />
                        Visa
                      </a>
                      
                      <button
                        onClick={() => handleEditProduct(product)}
                        className="flex items-center gap-2 px-3 py-2 bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 hover:text-blue-200 rounded-lg text-sm transition-all duration-200"
                      >
                        <Edit className="w-4 h-4" />
                        Redigera
                      </button>
                      
                      {product.id && (
                        <button
                          onClick={() => handleDeleteProduct(product.id!)}
                          className="flex items-center gap-2 px-3 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-300 hover:text-red-200 rounded-lg text-sm transition-all duration-200"
                        >
                          <Trash2 className="w-4 h-4" />
                          Ta bort
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 p-4 bg-blue-500/20 border border-blue-500/30 rounded-lg">
              <p className="text-blue-200 text-sm">
                ✅ <strong>Produkterna är permanent sparade!</strong> De visas nu automatiskt på websidan (localhost:3001) under respektive fiskarts &quot;Fiske&quot;-flik.
                <strong>INGEN mock data används</strong> - bara produkter du lagt till här. Du kan sätta egna stjärnbetyg och ta bort produkter.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {showEditModal && editingProduct && editedInfo && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl border border-white/20 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-2xl font-semibold text-white">Redigera bete</h3>
                <button
                  onClick={() => {
                    setShowEditModal(false);
                    setEditingProduct(null);
                    setEditedInfo(null);
                  }}
                  className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                >
                  <XCircle className="w-6 h-6 text-white/60" />
                </button>
              </div>

              {/* Produktbild */}
              {editedInfo.image && (
                <div className="mb-6">
                  <img 
                    src={editedInfo.image} 
                    alt={editedInfo.title}
                    className="w-full h-48 object-contain rounded-lg bg-white/10"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                </div>
              )}

              <div className="space-y-4">
                {/* Produktnamn */}
                <div>
                  <label className="block text-sm font-medium text-white/60 mb-1">Produktnamn</label>
                  <input
                    type="text"
                    value={editedInfo.title || ''}
                    onChange={(e) => setEditedInfo(prev => prev ? {...prev, title: e.target.value} : null)}
                    className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white"
                  />
                </div>

                {/* Pris */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-white/60 mb-1">Pris (SEK)</label>
                    <input
                      type="number"
                      value={editedInfo.price || ''}
                      onChange={(e) => setEditedInfo(prev => prev ? {...prev, price: e.target.value ? parseFloat(e.target.value) : undefined} : null)}
                      className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white"
                      placeholder="89"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-white/60 mb-1">Ordinarie pris (SEK)</label>
                    <input
                      type="number"
                      value={editedInfo.originalPrice || ''}
                      onChange={(e) => setEditedInfo(prev => prev ? {...prev, originalPrice: e.target.value ? parseFloat(e.target.value) : undefined} : null)}
                      className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white"
                      placeholder="119"
                    />
                  </div>
                </div>

                {/* Beskrivning av produkten */}
                <div>
                  <label className="block text-sm font-medium text-white/60 mb-1">Produktbeskrivning (valfritt)</label>
                  <textarea
                    value={editedInfo.description || ''}
                    onChange={(e) => setEditedInfo(prev => prev ? {...prev, description: e.target.value} : null)}
                    className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white resize-none"
                    rows={3}
                    placeholder="En kort beskrivning av betet och dess egenskaper..."
                  />
                </div>

                {/* Kategori */}
                <div>
                  <label className="block text-sm font-medium text-white/60 mb-1">Kategori</label>
                  <select
                    value={editedInfo.category || ''}
                    onChange={(e) => setEditedInfo(prev => prev ? {...prev, category: e.target.value} : null)}
                    className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white"
                  >
                    <option value="">Välj kategori</option>
                    {getCategoriesList().map(cat => (
                      <option key={cat} value={cat} className="bg-slate-800">{cat}</option>
                    ))}
                  </select>
                </div>

                {/* Kategoribeskrivning */}
                <div>
                  <label className="block text-sm font-medium text-white/60 mb-1">Kategoribeskrivning (valfritt)</label>
                  <textarea
                    value={editedInfo.categoryDescription || ''}
                    onChange={(e) => setEditedInfo(prev => prev ? {...prev, categoryDescription: e.target.value} : null)}
                    className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white resize-none"
                    rows={3}
                    placeholder="Förklara vad denna kategori av beten används till och när de är mest effektiva..."
                  />
                  <p className="text-xs text-white/50 mt-1">
                    Denna beskrivning visas för alla beten i kategorien &quot;{editedInfo.category || 'vald kategori'}&quot;
                  </p>
                </div>

                {/* Märke */}
                <div>
                  <label className="block text-sm font-medium text-white/60 mb-1">Märke</label>
                  <input
                    type="text"
                    value={editedInfo.brand || ''}
                    onChange={(e) => setEditedInfo(prev => prev ? {...prev, brand: e.target.value} : null)}
                    className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white"
                    placeholder="Abu Garcia"
                  />
                </div>

                {/* Fiskarter */}
                <div>
                  <label className="block text-sm font-medium text-white/60 mb-2">Rekommenderad för fiskarter</label>
                  <div className="grid grid-cols-3 gap-2">
                    {getFishSpeciesList().map(fish => (
                      <label key={fish} className="flex items-center gap-2 text-white/80">
                        <input
                          type="checkbox"
                          checked={editedInfo.fishSpecies?.includes(fish) || false}
                          onChange={(e) => {
                            setEditedInfo(prev => {
                              if (!prev) return null;
                              const currentSpecies = prev.fishSpecies || [];
                              if (e.target.checked) {
                                return {...prev, fishSpecies: [...currentSpecies, fish]};
                              } else {
                                return {...prev, fishSpecies: currentSpecies.filter(s => s !== fish)};
                              }
                            });
                          }}
                          className="rounded"
                        />
                        <span className="text-sm">{fish}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Stjärnbetyg */}
                <div>
                  <label className="block text-sm font-medium text-white/60 mb-2">
                    Effektivitet (stjärnbetyg)
                  </label>
                  <div className="flex items-center gap-2">
                    {[1, 2, 3, 4, 5].map((rating) => (
                      <button
                        key={rating}
                        type="button"
                        onClick={() => setEditedInfo(prev => prev ? {...prev, effectiveness: rating} : null)}
                        className={`w-8 h-8 ${
                          rating <= (editedInfo.effectiveness || 5) 
                            ? 'text-yellow-400' 
                            : 'text-white/30'
                        }`}
                      >
                        <svg className="w-full h-full fill-current" viewBox="0 0 20 20">
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                      </button>
                    ))}
                    <span className="text-white/60 ml-2">
                      {editedInfo.effectiveness || 5}/5 stjärnor
                    </span>
                  </div>
                </div>

                {/* Tekniker */}
                <div>
                  <label className="block text-sm font-medium text-white/60 mb-1">Tekniker (kommaseparerat)</label>
                  <input
                    type="text"
                    value={editedInfo.techniques?.join(', ') || ''}
                    onChange={(e) => setEditedInfo(prev => prev ? {...prev, techniques: e.target.value.split(',').map(t => t.trim()).filter(t => t)} : null)}
                    className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white"
                    placeholder="Spinnfiske, Jiggfiske, Trolling"
                  />
                </div>

                {/* Säsonger */}
                <div>
                  <label className="block text-sm font-medium text-white/60 mb-1">Säsonger (kommaseparerat)</label>
                  <input
                    type="text"
                    value={editedInfo.seasons?.join(', ') || ''}
                    onChange={(e) => setEditedInfo(prev => prev ? {...prev, seasons: e.target.value.split(',').map(s => s.trim()).filter(s => s)} : null)}
                    className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white"
                    placeholder="Vinter, Vår, Sommar, Höst"
                  />
                </div>

                {/* Lagerstatus */}
                <div>
                  <label className="flex items-center gap-2 text-white/80">
                    <input
                      type="checkbox"
                      checked={editedInfo.inStock !== false}
                      onChange={(e) => setEditedInfo(prev => prev ? {...prev, inStock: e.target.checked} : null)}
                      className="rounded"
                    />
                    <span className="text-sm">I lager</span>
                  </label>
                </div>
              </div>

              {/* Modal buttons */}
              <div className="flex gap-3 pt-6 mt-6 border-t border-white/10">
                <button
                  onClick={() => {
                    setShowEditModal(false);
                    setEditingProduct(null);
                    setEditedInfo(null);
                  }}
                  className="flex-1 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg font-medium transition-all duration-200"
                >
                  Avbryt
                </button>
                <button
                  onClick={handleSaveEditedProduct}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 rounded-lg font-medium transition-all duration-200"
                >
                  <CheckCircle className="w-5 h-5" />
                  Spara ändringar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 