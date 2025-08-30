import React from 'react';
import { Button } from '@/components/ui/button';
import { Play, Pause, Square, MapPin, Download, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TrackingControlsProps {
  isTracking: boolean;
  onStartTracking: () => void;
  onPauseTracking: () => void;
  onStopTracking: () => void;
  onCenterLocation: () => void;
  onExport: () => void;
  onSettings: () => void;
  className?: string;
}

const TrackingControls: React.FC<TrackingControlsProps> = ({
  isTracking,
  onStartTracking,
  onPauseTracking,
  onStopTracking,
  onCenterLocation,
  onExport,
  onSettings,
  className
}) => {
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {/* Primary tracking control */}
      <div className="flex gap-2">
        {!isTracking ? (
          <Button 
            variant="tracking" 
            size="floating"
            onClick={onStartTracking}
            className="animate-float"
          >
            <Play className="h-5 w-5" />
          </Button>
        ) : (
          <>
            <Button 
              variant="floating" 
              size="floating"
              onClick={onPauseTracking}
            >
              <Pause className="h-5 w-5" />
            </Button>
            <Button 
              variant="danger" 
              size="floating"
              onClick={onStopTracking}
            >
              <Square className="h-5 w-5" />
            </Button>
          </>
        )}
      </div>

      {/* Secondary controls */}
      <div className="flex flex-col gap-2">
        <Button 
          variant="floating" 
          size="floating"
          onClick={onCenterLocation}
        >
          <MapPin className="h-5 w-5" />
        </Button>
        
        <Button 
          variant="floating" 
          size="floating"
          onClick={onExport}
        >
          <Download className="h-5 w-5" />
        </Button>
        
        <Button 
          variant="floating" 
          size="floating"
          onClick={onSettings}
        >
          <Settings className="h-5 w-5" />
        </Button>
      </div>
    </div>
  );
};

export default TrackingControls;