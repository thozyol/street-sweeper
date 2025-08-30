-- Create users table for additional profile information
CREATE TABLE public.users (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  avatar_url TEXT,
  preferences JSONB DEFAULT '{"color_mode": "yellow", "excluded_zones": []}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Users can view and edit their own profile
CREATE POLICY "Users can view their own profile" 
ON public.users 
FOR SELECT 
USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile" 
ON public.users 
FOR UPDATE 
USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile" 
ON public.users 
FOR INSERT 
WITH CHECK (auth.uid() = id);

-- Create segments table for painted road segments
CREATE TABLE public.segments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  osm_way_id TEXT NOT NULL,
  geometry JSONB NOT NULL, -- GeoJSON LineString
  first_visited_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_visited_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  visit_count INTEGER NOT NULL DEFAULT 1,
  distance_meters REAL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.segments ENABLE ROW LEVEL SECURITY;

-- Users can only access their own segments
CREATE POLICY "Users can view their own segments" 
ON public.segments 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own segments" 
ON public.segments 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own segments" 
ON public.segments 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own segments" 
ON public.segments 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create traces table for raw GPS logs
CREATE TABLE public.traces (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  points JSONB NOT NULL, -- Array of {lat, lng, timestamp, accuracy}
  snapped_geometry JSONB, -- GeoJSON LineString after map matching
  summary JSONB, -- {distance, duration, activity_type, start_time, end_time}
  processed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.traces ENABLE ROW LEVEL SECURITY;

-- Users can only access their own traces
CREATE POLICY "Users can view their own traces" 
ON public.traces 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own traces" 
ON public.traces 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own traces" 
ON public.traces 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own traces" 
ON public.traces 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create indexes for performance
CREATE INDEX idx_segments_user_id ON public.segments(user_id);
CREATE INDEX idx_segments_osm_way_id ON public.segments(osm_way_id);
CREATE INDEX idx_segments_user_way ON public.segments(user_id, osm_way_id);
CREATE INDEX idx_traces_user_id ON public.traces(user_id);
CREATE INDEX idx_traces_processed ON public.traces(processed);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for automatic timestamp updates
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_segments_updated_at
  BEFORE UPDATE ON public.segments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_traces_updated_at
  BEFORE UPDATE ON public.traces
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create function to handle new user signups
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data ->> 'full_name',
    NEW.raw_user_meta_data ->> 'avatar_url'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for new user signups
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();