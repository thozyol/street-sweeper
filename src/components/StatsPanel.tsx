import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { MapPin, Route, Clock, Zap } from 'lucide-react';

interface StatsPanelProps {
  totalDistance: number;
  streetsDiscovered: number;
  trackingTime: number;
  currentSpeed: number;
  isVisible: boolean;
  onClose: () => void;
}

const StatsPanel: React.FC<StatsPanelProps> = ({
  totalDistance,
  streetsDiscovered,
  trackingTime,
  currentSpeed,
  isVisible,
  onClose
}) => {
  const formatDistance = (meters: number) => {
    if (meters < 1000) return `${Math.round(meters)}m`;
    return `${(meters / 1000).toFixed(1)}km`;
  };

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  const formatSpeed = (metersPerSecond: number) => {
    const kmh = metersPerSecond * 3.6;
    return `${kmh.toFixed(1)} km/h`;
  };

  if (!isVisible) return null;

  return (
    <div className="absolute top-4 left-4 z-10 max-w-sm">
      <Card className="bg-card/90 backdrop-blur-sm border-border/50 shadow-elevated">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-bold bg-gradient-primary bg-clip-text text-transparent">
              Street Sweeper
            </CardTitle>
            <button 
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              ×
            </button>
          </div>
        </CardHeader>
        
        <CardContent className="space-y-4">
          {/* Distance Progress */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Route className="h-4 w-4 text-road-painted" />
              <span className="text-sm font-medium">Distance Traveled</span>
            </div>
            <div className="text-2xl font-bold text-road-painted">
              {formatDistance(totalDistance)}
            </div>
            <Progress value={Math.min((totalDistance / 10000) * 100, 100)} className="h-2" />
          </div>

          {/* Streets Discovered */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Streets Discovered</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold text-primary">{streetsDiscovered}</span>
              <Badge variant="secondary" className="text-xs">
                +{Math.floor(totalDistance / 100)} pts
              </Badge>
            </div>
          </div>

          {/* Session Stats */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-1">
                <Clock className="h-3 w-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Time</span>
              </div>
              <div className="text-lg font-semibold">{formatTime(trackingTime)}</div>
            </div>
            
            <div className="space-y-1">
              <div className="flex items-center gap-1">
                <Zap className="h-3 w-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Speed</span>
              </div>
              <div className="text-lg font-semibold">{formatSpeed(currentSpeed)}</div>
            </div>
          </div>

          {/* Achievement Progress */}
          <div className="pt-2 border-t border-border">
            <div className="text-xs text-muted-foreground mb-2">Next Achievement</div>
            <div className="flex items-center gap-2">
              <span className="text-sm">Explorer</span>
              <Progress value={Math.min((streetsDiscovered / 50) * 100, 100)} className="flex-1 h-1" />
              <span className="text-xs text-muted-foreground">{streetsDiscovered}/50</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default StatsPanel;