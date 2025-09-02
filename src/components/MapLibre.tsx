import React, { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { toast } from 'sonner';

interface MapLibreProps {
  onLocationUpdate?: (lat: number, lng: number) => void;
  paintedSegments?: Array<{
    id: string;
    geometry: GeoJSON.LineString;
    visitCount: number;
  }>;
  gpsTrace?: Array<[number, number]>;
  isTracking?: boolean;
}

const MapLibre: React.FC<MapLibreProps> = ({ 
  onLocationUpdate, 
  paintedSegments = [], 
  gpsTrace = [],
  isTracking = false 
}) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const userLocationMarker = useRef<maplibregl.Marker | null>(null);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);

  useEffect(() => {
    if (!mapContainer.current) return;

    // Initialize map with OSM tiles
    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: {
        version: 8,
        sources: {
          'osm': {
            type: 'raster',
            tiles: [
              'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
            ],
            tileSize: 256,
            attribution: '© OpenStreetMap contributors'
          }
        },
        layers: [
          {
            id: 'osm',
            type: 'raster',
            source: 'osm'
          }
        ]
      },
      center: [-74.006, 40.7128], // NYC default
      zoom: 12,
      attributionControl: false
    });

    // Add navigation controls
    map.current.addControl(new maplibregl.NavigationControl(), 'top-right');

    // Add attribution
    map.current.addControl(
      new maplibregl.AttributionControl({
        compact: true
      }),
      'bottom-right'
    );

    map.current.on('load', () => {
      // Add painted roads source
      map.current?.addSource('painted-roads', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: []
        }
      });

      // Add painted roads layer
      map.current?.addLayer({
        id: 'painted-roads',
        type: 'line',
        source: 'painted-roads',
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        paint: {
          'line-color': 'hsl(51, 100%, 50%)', // ETS2 yellow
          'line-width': [
            'interpolate',
            ['linear'],
            ['zoom'],
            8, 2,
            12, 4,
            16, 8
          ],
          'line-opacity': 0.8
        }
      });

      // Add glow effect for painted roads
      map.current?.addLayer({
        id: 'painted-roads-glow',
        type: 'line',
        source: 'painted-roads',
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        paint: {
          'line-color': 'hsl(51, 100%, 60%)',
          'line-width': [
            'interpolate',
            ['linear'],
            ['zoom'],
            8, 4,
            12, 8,
            16, 16
          ],
          'line-opacity': 0.3,
          'line-blur': 2
        }
      }, 'painted-roads');

      // Add GPS trace source
      map.current?.addSource('gps-trace', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: []
        }
      });

      // Add GPS trace layer with ETS2-style bright yellow
      map.current?.addLayer({
        id: 'gps-trace',
        type: 'line',
        source: 'gps-trace',
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        paint: {
          'line-color': '#FFD400', // Exact bright yellow requested
          'line-width': [
            'interpolate',
            ['linear'],
            ['zoom'],
            8, 4,
            12, 6,
            16, 12
          ],
          'line-opacity': 0.9
        }
      });

      // Add GPS trace glow effect
      map.current?.addLayer({
        id: 'gps-trace-glow',
        type: 'line',
        source: 'gps-trace',
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        paint: {
          'line-color': 'hsl(51, 100%, 65%)',
          'line-width': [
            'interpolate',
            ['linear'],
            ['zoom'],
            8, 6,
            12, 12,
            16, 24
          ],
          'line-opacity': 0.4,
          'line-blur': 3
        }
      }, 'gps-trace');
    });

    return () => {
      userLocationMarker.current?.remove();
      map.current?.remove();
    };
  }, []);

  // Update painted segments
  useEffect(() => {
    if (!map.current || !map.current.isStyleLoaded()) return;

    const features = paintedSegments.map(segment => ({
      type: 'Feature' as const,
      properties: {
        id: segment.id,
        visitCount: segment.visitCount
      },
      geometry: segment.geometry
    }));

    const source = map.current.getSource('painted-roads') as maplibregl.GeoJSONSource;
    if (source) {
      source.setData({
        type: 'FeatureCollection',
        features
      });
    }
  }, [paintedSegments]);

  // Update GPS trace
  useEffect(() => {
    if (!map.current || !map.current.isStyleLoaded()) return;

    if (gpsTrace.length > 1) {
      const traceFeature = {
        type: 'Feature' as const,
        properties: {},
        geometry: {
          type: 'LineString' as const,
          coordinates: gpsTrace
        }
      };

      const source = map.current.getSource('gps-trace') as maplibregl.GeoJSONSource;
      if (source) {
        source.setData({
          type: 'FeatureCollection',
          features: [traceFeature]
        });
      }
    }
  }, [gpsTrace]);

  // Track user location with enhanced accuracy and debugging
  useEffect(() => {
    if (!isTracking) return;

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        
        // DEBUGGING: Log full position object
        console.log('POS:', {
          lat: latitude,
          lng: longitude, 
          accuracy: accuracy,
          timestamp: new Date().toISOString(),
          coords: position.coords
        });
        
        // ACCURACY FILTER: Skip noisy GPS fixes
        if (accuracy > 50) {
          console.log('GPS: Skipping inaccurate fix, accuracy:', accuracy);
          return;
        }
        
        // COORDINATE ORDER: MapLibre/GeoJSON uses [lng, lat]
        const newLocation: [number, number] = [longitude, latitude];
        
        setUserLocation(newLocation);
        onLocationUpdate?.(latitude, longitude);

        if (map.current) {
          // Update user location marker
          if (userLocationMarker.current) {
            userLocationMarker.current.setLngLat(newLocation);
          } else {
            // Create user location marker with pulsing animation
            const el = document.createElement('div');
            el.className = 'user-location-marker';
            el.style.cssText = `
              width: 20px;
              height: 20px;
              border-radius: 50%;
              background: hsl(195, 100%, 50%);
              border: 3px solid white;
              box-shadow: 0 0 15px hsl(195, 100%, 50% / 0.6);
              animation: pulse-glow 2s ease-in-out infinite;
            `;

            userLocationMarker.current = new maplibregl.Marker(el)
              .setLngLat(newLocation)
              .addTo(map.current);
          }

          // CONTINUOUS MAP FOLLOWING: Always center on user when tracking
          if (isTracking) {
            map.current.easeTo({
              center: newLocation,
              duration: 1000,
              essential: true // Don't interrupt for user interaction
            });
          } else if (!userLocation) {
            // Initial centering only
            map.current.flyTo({
              center: newLocation,
              zoom: 16,
              duration: 2000
            });
          }
        }
      },
      (error) => {
        console.error('GPS Error:', error);
        toast.error(`Location error: ${error.message}`);
      },
      {
        // ENHANCED GPS OPTIONS
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 2000
      }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [isTracking, onLocationUpdate, userLocation]);

  return (
    <div className="relative w-full h-full">
      <div ref={mapContainer} className="absolute inset-0" />
      
      {/* Map overlay effects */}
      <div className="absolute inset-0 pointer-events-none">
        {/* Vignette effect */}
        <div className="absolute inset-0 bg-gradient-radial from-transparent via-transparent to-background/20" />
        
        {/* Corner glow effects */}
        <div className="absolute top-0 left-0 w-32 h-32 bg-gradient-glow opacity-20 blur-xl" />
        <div className="absolute bottom-0 right-0 w-32 h-32 bg-gradient-glow opacity-20 blur-xl" />
      </div>
    </div>
  );
};

export default MapLibre;