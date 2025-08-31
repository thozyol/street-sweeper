import React, { useState, useEffect, useCallback } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import MapLibre from './MapLibre';
import TrackingControls from './TrackingControls';
import StatsPanel from './StatsPanel';
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
  const [showStats, setShowStats] = useState(true);
  
  // Tracking state
  const [currentLocation, setCurrentLocation] = useState<LocationPoint | null>(null);
  const [locationHistory, setLocationHistory] = useState<LocationPoint[]>([]);
  const [paintedSegments, setPaintedSegments] = useState<PaintedSegment[]>([]);
  const [currentTraceId, setCurrentTraceId] = useState<string | null>(null);
  const [gpsTrace, setGpsTrace] = useState<Array<[number, number]>>([]);
  
  // Stats
  const [totalDistance, setTotalDistance] = useState(0);
  const [streetsDiscovered, setStreetsDiscovered] = useState(0);
  const [trackingTime, setTrackingTime] = useState(0);
  const [currentSpeed, setCurrentSpeed] = useState(0);

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

  // Handle location updates
  const handleLocationUpdate = useCallback((lat: number, lng: number) => {
    const now = Date.now();
    const newLocation: LocationPoint = { lat, lng, timestamp: now };
    
    setCurrentLocation(newLocation);
    
    if (isTracking) {
      // Add to GPS trace
      setGpsTrace(prev => {
        const newTrace = [...prev, [lng, lat] as [number, number]];
        
        // Save trace to database periodically (every 10 points)
        if (user && newTrace.length % 10 === 0) {
          saveTraceToDatabase(newTrace);
        }
        
        return newTrace;
      });
      
      setLocationHistory(prev => {
        const updated = [...prev, newLocation];
        
        // Calculate speed if we have previous location
        if (prev.length > 0) {
          const lastLocation = prev[prev.length - 1];
          const timeDiff = (now - lastLocation.timestamp) / 1000; // seconds
          const distance = calculateDistance(lastLocation.lat, lastLocation.lng, lat, lng);
          const speed = distance / timeDiff; // m/s
          setCurrentSpeed(speed);
          
          // Update total distance with actual GPS trace distance
          setTotalDistance(prevTotal => prevTotal + distance);
        }
        
        // Mock street painting logic (in real app, this would use map matching)
        if (updated.length > 1) {
          const lastPoint = updated[updated.length - 2];
          const distance = calculateDistance(lastPoint.lat, lastPoint.lng, lat, lng);
          
          if (distance > 10) { // Minimum 10m movement to paint
            // Create mock segment
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
                    coordinates: [[lastPoint.lng, lastPoint.lat], [lng, lat]]
                  },
                  visitCount: 1
                };
                
                setStreetsDiscovered(prev => prev + 1);
                
                // Save to database if user is authenticated
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
      toast.error('Geolocation is not supported by this browser');
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
    
    toast.info('Tracking stopped');
  };

  const handleCenterLocation = () => {
    if (currentLocation) {
      toast.info('Centering on your location');
      // Map centering would be handled by MapLibre component
    } else {
      toast.error('Location not available');
    }
  };

  const handleExport = () => {
    if (!user) {
      setShowAuthModal(true);
      return;
    }
    
    toast.info('Export feature coming soon!');
  };

  const handleSettings = () => {
    toast.info('Settings panel coming soon!');
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
      {/* Main Map */}
      <MapLibre 
        onLocationUpdate={handleLocationUpdate}
        paintedSegments={paintedSegments}
        gpsTrace={gpsTrace}
        isTracking={isTracking}
      />
      
      {/* Stats Panel */}
      <StatsPanel
        totalDistance={totalDistance}
        streetsDiscovered={streetsDiscovered}
        trackingTime={trackingTime}
        currentSpeed={currentSpeed}
        isVisible={showStats}
        onClose={() => setShowStats(false)}
      />
      
      {/* Tracking Controls */}
      <div className="absolute bottom-6 right-6 z-10">
        <TrackingControls
          isTracking={isTracking}
          onStartTracking={handleStartTracking}
          onPauseTracking={handlePauseTracking}
          onStopTracking={handleStopTracking}
          onCenterLocation={handleCenterLocation}
          onExport={handleExport}
          onSettings={handleSettings}
        />
      </div>

      {/* Top controls */}
      <div className="absolute top-4 right-4 z-10 flex gap-2">
        {!showStats && (
          <Button 
            variant="floating" 
            size="floating"
            onClick={() => setShowStats(true)}
          >
            <BarChart3 className="h-5 w-5" />
          </Button>
        )}
        
        {user ? (
          <Button 
            variant="floating" 
            size="floating"
            onClick={handleSignOut}
          >
            <LogOut className="h-5 w-5" />
          </Button>
        ) : (
          <Button 
            variant="neon" 
            onClick={() => setShowAuthModal(true)}
          >
            Sign In
          </Button>
        )}
      </div>

      {/* Welcome message */}
      {!user && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-10 text-center max-w-md">
          <div className="bg-card/90 backdrop-blur-sm rounded-lg p-6 border border-border/50 shadow-elevated">
            <h1 className="text-3xl font-bold bg-gradient-primary bg-clip-text text-transparent mb-2">
              Street Sweeper
            </h1>
            <p className="text-muted-foreground mb-4">
              Paint every street you travel! Track your journeys and discover the world one road at a time.
            </p>
            <Button 
              variant="neon" 
              size="lg"
              onClick={() => setShowAuthModal(true)}
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