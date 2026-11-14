export interface LandingPreset {
  id: string;
  name: string;
  region: string;
  lat: number;
  lon: number;
  description: string;
}

export interface RoverProfile {
  id: string;
  name: string;
  minSunElevationDeg: number;
  maxDarknessHours: number;
  maxCommsBlackoutHours: number;
}

export interface ScenarioInput {
  id: 'A' | 'B';
  presetId: string;
  name: string;
  lat: number;
  lon: number;
  startDateIso: string;
  durationDays: number;
  roverId: string;
}

export interface HorizonPoint {
  azimuth: number;
  terrainElevDeg: number;
}

export interface TimeStepData {
  timestampIso: string;
  hoursFromStart: number;
  sunAzimuth: number;
  sunElevation: number;
  earthAzimuth: number;
  earthElevation: number;
  isSunVisible: boolean;
  isEarthVisible: boolean;
  powerOutputWatts: number;
}

export interface SimulationResult {
  input: ScenarioInput;
  isInsideDem: boolean;
  patchSpanKm: number;
  gridSize: number;
  heightmap: Float32Array;
  horizonProfile: HorizonPoint[];
  timeline: TimeStepData[];
  metrics: {
    sunlightPercent: number;
    earthCommsPercent: number;
    hoursUntilSunset: number | null;
    hoursUntilEarthset: number | null;
    totalEnergyKwh: number;
    status: 'optimal' | 'warning' | 'critical';
    statusReason: string;
  };
}