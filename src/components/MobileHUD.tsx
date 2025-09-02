import React from 'react';
import { Button } from '@/components/ui/button';
import { Play, Pause, Square } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MobileHUDProps {
  isTracking: boolean;
  gpsAccuracy: number;
  distanceTraveled: number;
  onStartTracking: () => void;
  onPauseTracking: () => void;
  onStopTracking: () => void;
  className?: string;
}

const MobileHUD: React.FC<MobileHUDProps> = ({
  isTracking,
  gpsAccuracy,
  distanceTraveled,
  onStartTracking,
  onPauseTracking,
  onStopTracking,
  className
}) => {
  const formatDistance = (meters: number) => {
    if (meters < 1000) return `${Math.round(meters)}m`;
    return `${(meters / 1000).toFixed(1)}km`;
  };

  const getAccuracyColor = (accuracy: number) => {
    if (accuracy <= 10) return 'text-green-400';
    if (accuracy <= 25) return 'text-yellow-400';
    return 'text-red-400';
  };

  return (
    <div className={cn("fixed inset-x-0 bottom-0 z-20", className)}>
      {/* Top accuracy indicator */}
      <div className="absolute top-4 left-4 z-30">
        <div className="bg-black/70 backdrop-blur-sm rounded-lg px-3 py-2 border border-white/10">
          <div className="flex items-center gap-2">
            <div className={cn("w-2 h-2 rounded-full", getAccuracyColor(gpsAccuracy))} />
            <span className={cn("text-sm font-mono", getAccuracyColor(gpsAccuracy))}>
              ±{gpsAccuracy.toFixed(0)}m
            </span>
          </div>
        </div>
      </div>

      {/* Distance indicator (optional, small) */}
      {isTracking && distanceTraveled > 0 && (
        <div className="absolute top-4 right-4 z-30">
          <div className="bg-black/70 backdrop-blur-sm rounded-lg px-3 py-2 border border-white/10">
            <span className="text-sm font-mono text-white">
              {formatDistance(distanceTraveled)}
            </span>
          </div>
        </div>
      )}

      {/* Bottom control bar */}
      <div className="bg-black/80 backdrop-blur-md border-t border-white/10 px-6 py-4 safe-area-pb">
        <div className="flex items-center justify-center">
          {!isTracking ? (
            <Button 
              variant="default"
              size="lg"
              onClick={onStartTracking}
              className="bg-green-600 hover:bg-green-700 text-white px-8 py-3 rounded-full font-semibold text-lg shadow-lg active:scale-95 transition-all duration-150"
            >
              <Play className="h-6 w-6 mr-2" fill="currentColor" />
              Start Tracking
            </Button>
          ) : (
            <div className="flex gap-4">
              <Button 
                variant="secondary"
                size="lg"
                onClick={onPauseTracking}
                className="bg-yellow-600 hover:bg-yellow-700 text-white px-6 py-3 rounded-full font-semibold shadow-lg active:scale-95 transition-all duration-150"
              >
                <Pause className="h-5 w-5 mr-2" fill="currentColor" />
                Pause
              </Button>
              <Button 
                variant="destructive"
                size="lg"
                onClick={onStopTracking}
                className="bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-full font-semibold shadow-lg active:scale-95 transition-all duration-150"
              >
                <Square className="h-5 w-5 mr-2" fill="currentColor" />
                Stop
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MobileHUD;