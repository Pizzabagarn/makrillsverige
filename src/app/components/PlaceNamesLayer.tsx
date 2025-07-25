import { Layer, Source } from 'react-map-gl/maplibre';

interface PlaceNamesLayerProps {
  visible?: boolean;
  opacity?: number;
}

export default function PlaceNamesLayer({ 
  visible = true, 
  opacity = 0.9 
}: PlaceNamesLayerProps) {
  if (!visible) return null;

  return (
    <Source
      id="place-names"
      type="raster"
      tiles={[
        // Use CartoDB light labels for better visibility on all zoom levels
        'https://a.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}@2x.png',
        'https://b.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}@2x.png',
        'https://c.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}@2x.png',
        'https://d.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}@2x.png'
      ]}
      tileSize={256}
      attribution="&copy; OpenStreetMap contributors, &copy; CARTO"
    >
      <Layer
        id="place-names-layer"
        type="raster"
        paint={{
          'raster-opacity': opacity
        }}
        layout={{
          visibility: visible ? 'visible' : 'none'
        }}
      />
    </Source>
  );
} 