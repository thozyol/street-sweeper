import React, { useState, useEffect, useCallback } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import MapLibre from './MapLibre';
import MobileHUD from './MobileHUD';
import AuthModal from './AuthModal';
import { Button } from '@/components/ui/button';
import { LogOut, BarChart3 } from 'lucide-react';

interface LocationPoint {
  lat: number;
  lng: number;
  timestamp: number;
  accuracy?: number;
}

interface PaintedSegment {
  id: string;
  geometry: GeoJSON.LineString;
  visitCount: number;
}

const StreetSweeperApp: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [isTracking, setIsTracking] = useState(false);
  
  // Tracking state
  const [currentLocation, setCurrentLocation] = useState<LocationPoint | null>(null);
  const [locationHistory, setLocationHistory] = useState<LocationPoint[]>([]);
  const [paintedSegments, setPaintedSegments] = useState<PaintedSegment[]>([]);
  const [currentTraceId, setCurrentTraceId] = useState<string | null>(null);
  const [gpsTrace, setGpsTrace] = useState<Array<[number, number]>>([]);
  
  // Mobile-optimized stats
  const [totalDistance, setTotalDistance] = useState(0);
  const [streetsDiscovered, setStreetsDiscovered] = useState(0);
  const [trackingTime, setTrackingTime] = useState(0);
  const [currentSpeed, setCurrentSpeed] = useState(0);
  const [gpsAccuracy, setGpsAccuracy] = useState(0);

  // Auth state management
  useEffect(() => {
    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        
        if (event === 'SIGNED_IN') {
          setShowAuthModal(false);
          toast.success('Welcome to Street Sweeper!');
        }
      }
    );

    // Check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Load user data when authenticated
  useEffect(() => {
    if (!user) return;

    const loadUserData = async () => {
      try {
        // Load user segments
        const { data: segments, error } = await supabase
          .from('segments')
          .select('*')
          .eq('user_id', user.id);

        if (error) throw error;

        if (segments) {
          const paintedSegs = segments.map(segment => ({
            id: segment.id,
            geometry: segment.geometry as any as GeoJSON.LineString,
            visitCount: segment.visit_count
          }));
          
          setPaintedSegments(paintedSegs);
          setStreetsDiscovered(segments.length);
          
          // Calculate total distance
          const distance = segments.reduce((sum, seg) => sum + (seg.distance_meters || 0), 0);
          setTotalDistance(distance);
        }

        // Load latest GPS trace
        const { data: traces, error: tracesError } = await supabase
          .from('traces')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1);

        if (tracesError) throw tracesError;

        if (traces && traces.length > 0 && traces[0].points) {
          const points = traces[0].points as any;
          const traceCoords = points.map((p: any) => [p.lng, p.lat] as [number, number]);
          setGpsTrace(traceCoords);
          setCurrentTraceId(traces[0].id);
        }
      } catch (error: any) {
        toast.error('Failed to load your data');
        console.error('Error loading user data:', error);
      }
    };

    loadUserData();
  }, [user]);

  // Tracking timer
  useEffect(() => {
    if (!isTracking) return;

    const interval = setInterval(() => {
      setTrackingTime(prev => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [isTracking]);

  // Handle location updates with real-time path drawing
  const handleLocationUpdate = useCallback((lat: number, lng: number, accuracy: number = 0) => {
    const now = Date.now();
    const newLocation: LocationPoint = { lat, lng, timestamp: now };
    
    setCurrentLocation(newLocation);
    setGpsAccuracy(accuracy); // Update GPS accuracy for HUD
    
    if (isTracking) {
      // REAL-TIME PATH DRAWING: Add every GPS point immediately for continuous tracking
      setGpsTrace(prev => {
        const newTrace = [...prev, [lng, lat] as [number, number]];
        
        // PERFORMANCE: Save trace to database less frequently for battery efficiency
        if (user && newTrace.length % 15 === 0) { // Save every 15 points for better real-time performance
          saveTraceToDatabase(newTrace);
        }
        
        return newTrace;
      });
      
      setLocationHistory(prev => {
        const updated = [...prev, newLocation];
        
        // Calculate speed and distance for every GPS update
        if (prev.length > 0) {
          const lastLocation = prev[prev.length - 1];
          const timeDiff = (now - lastLocation.timestamp) / 1000; // seconds
          const distance = calculateDistance(lastLocation.lat, lastLocation.lng, lat, lng);
          
          // Update speed and distance for every movement (no minimum threshold for real-time tracking)
          if (distance > 0.5) { // Very small threshold to capture all meaningful movement
            const speed = distance / timeDiff; // m/s
            setCurrentSpeed(speed);
            setTotalDistance(prevTotal => prevTotal + distance);
          }
        }
        
        // ACCURATE ROAD PAINTING: Create segments for significant movements only
        if (updated.length > 1) {
          const lastPoint = updated[updated.length - 1];
          const distance = calculateDistance(lastPoint.lat, lastPoint.lng, lat, lng);
          
          // MOBILE-OPTIMIZED: Larger threshold to prevent excessive segments
          if (distance > 20) { // 20m minimum for mobile battery efficiency
            const segmentId = `${Math.round(lat * 1000)}_${Math.round(lng * 1000)}`;
            
            setPaintedSegments(prev => {
              const existing = prev.find(seg => seg.id === segmentId);
              if (existing) {
                return prev.map(seg => 
                  seg.id === segmentId 
                    ? { ...seg, visitCount: seg.visitCount + 1 }
                    : seg
                );
              } else {
                const newSegment: PaintedSegment = {
                  id: segmentId,
                  geometry: {
                    type: 'LineString',
                    // COORDINATE ORDER FIX: GeoJSON uses [lng, lat] not [lat, lng]
                    coordinates: [[lastPoint.lng, lastPoint.lat], [lng, lat]]
                  },
                  visitCount: 1
                };
                
                setStreetsDiscovered(prev => prev + 1);
                
                // PERFORMANCE: Save to database with throttling
                if (user) {
                  saveSegmentToDatabase(newSegment, distance);
                }
                
                return [...prev, newSegment];
              }
            });
          }
        }
        
        return updated;
      });
    }
  }, [isTracking, user]);

  const saveTraceToDatabase = async (traceCoords: Array<[number, number]>) => {
    try {
      const points = traceCoords.map(([lng, lat]) => ({ lat, lng, timestamp: Date.now() }));
      
      if (currentTraceId) {
        // Update existing trace
        await supabase.from('traces').update({
          points: points as any,
          updated_at: new Date().toISOString()
        }).eq('id', currentTraceId);
      } else {
        // Create new trace
        const { data, error } = await supabase.from('traces').insert({
          user_id: user?.id || '',
          points: points as any
        }).select().single();
        
        if (error) throw error;
        if (data) setCurrentTraceId(data.id);
      }
    } catch (error) {
      console.error('Failed to save trace:', error);
    }
  };

  const saveSegmentToDatabase = async (segment: PaintedSegment, distance: number) => {
    try {
      await supabase.from('segments').insert({
        user_id: user?.id || '',
        osm_way_id: segment.id,
        geometry: segment.geometry as any,
        distance_meters: distance,
        visit_count: segment.visitCount
      });
    } catch (error) {
      console.error('Failed to save segment:', error);
    }
  };

  const calculateDistance = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = lat1 * Math.PI/180;
    const φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2-lat1) * Math.PI/180;
    const Δλ = (lng2-lng1) * Math.PI/180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c;
  };

  const handleStartTracking = () => {
    if (!user) {
      setShowAuthModal(true);
      return;
    }
    
    if (!navigator.geolocation) {
      toast.error('GPS not supported on this device');
      return;
    }
    
    setIsTracking(true);
    setTrackingTime(0);
    setGpsTrace([]); // Start fresh GPS trace
    setCurrentTraceId(null); // Reset trace ID for new session
    toast.success('Started tracking your journey!');
  };

  const handlePauseTracking = () => {
    setIsTracking(false);
    toast.info('Tracking paused');
  };

  const handleStopTracking = () => {
    setIsTracking(false);
    setTrackingTime(0);
    setLocationHistory([]);
    setCurrentSpeed(0);
    
    // Save final trace to database
    if (user && gpsTrace.length > 0) {
      saveTraceToDatabase(gpsTrace);
    }
    
    toast.info('Tracking session saved');
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setPaintedSegments([]);
    setStreetsDiscovered(0);
    setTotalDistance(0);
    setTrackingTime(0);
    toast.success('Signed out successfully');
  };

  return (
    <div className="relative h-screen w-full overflow-hidden bg-background">
      {/* Full-screen Map */}
      <MapLibre 
        onLocationUpdate={handleLocationUpdate}
        paintedSegments={paintedSegments}
        gpsTrace={gpsTrace}
        isTracking={isTracking}
      />
      
      {/* Mobile HUD */}
      <MobileHUD
        isTracking={isTracking}
        gpsAccuracy={gpsAccuracy}
        distanceTraveled={totalDistance}
        onStartTracking={handleStartTracking}
        onPauseTracking={handlePauseTracking}
        onStopTracking={handleStopTracking}
      />

      {/* Top-right controls - minimal for mobile */}
      {user && (
        <div className="absolute top-4 right-4 z-10">
          <Button 
            variant="secondary" 
            size="sm"
            onClick={handleSignOut}
            className="bg-black/70 backdrop-blur-sm border border-white/10 text-white hover:bg-black/80"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Welcome screen for unauthenticated users */}
      {!user && (
        <div className="absolute inset-0 z-10 flex items-center justify-center p-4">
          <div className="bg-black/80 backdrop-blur-sm rounded-2xl p-8 border border-white/10 shadow-2xl max-w-sm w-full text-center">
            <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent mb-4">
              Street Sweeper
            </h1>
            <p className="text-gray-300 mb-6 leading-relaxed">
              Track your journeys with GPS precision. Paint every street you travel and build your exploration map.
            </p>
            <Button 
              variant="default"
              size="lg"
              onClick={() => setShowAuthModal(true)}
              className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white px-8 py-3 rounded-full font-semibold shadow-lg w-full"
            >
              Start Your Journey
            </Button>
          </div>
        </div>
      )}

      {/* Auth Modal */}
      <AuthModal 
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
      />
    </div>
  );
};

export default StreetSweeperApp;