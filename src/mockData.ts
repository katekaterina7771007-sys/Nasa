import type {
  HorizonPoint,
  LandingPreset,
  RoverProfile,
  ScenarioInput,
  SimulationResult,
  TimeStepData,
} from './types';

export const LANDING_PRESETS: LandingPreset[] = [
  {
    id: 'shackleton-rim',
    name: 'Shackleton Crater Rim',
    region: 'South Pole (89.54° S)',
    lat: -89.54,
    lon: 0.0,
    description: 'Peak of eternal light adjacent to a permanently shadowed ice-bearing crater.',
  },
  {
    id: 'malapert-massif',
    name: 'Malapert Massif',
    region: '86.0° S, 2.5° E',
    lat: -86.0,
    lon: 2.5,
    description: 'Elevated ridge offering near-continuous Direct-to-Earth (DTE) line of sight.',
  },
  {
    id: 'shiv-shakti',
    name: 'Shiv Shakti Point (Chandrayaan-3)',
    region: '69.37° S, 32.32° E',
    lat: -69.37,
    lon: 32.32,
    description: 'Historic site of the first soft landing near the lunar south polar region.',
  },
  {
    id: 'cabeus-floor',
    name: 'Cabeus Crater Floor (PSR)',
    region: '84.9° S, 35.5° W',
    lat: -84.9,
    lon: -35.5,
    description: 'Extreme Permanently Shadowed Region — severe thermal and power risk.',
  },
];

export const ROVER_PROFILES: RoverProfile[] = [
  {
    id: 'csa-rover',
    name: 'Polar Rover (CSA Class)',
    minSunElevationDeg: 2.0,
    maxDarknessHours: 72,
    maxCommsBlackoutHours: 24,
  },
  {
    id: 'clps-lander',
    name: 'CLPS Commercial Lander',
    minSunElevationDeg: 3.0,
    maxDarknessHours: 48,
    maxCommsBlackoutHours: 12,
  },
];

export function generateMockSimulation(input: ScenarioInput): SimulationResult {
  const gridSize = 96;
  const heightmap = new Float32Array(gridSize * gridSize);

  const seed = Math.abs(input.lat * 13.7 + input.lon * 7.3);
  const isDeepCrater = input.presetId === 'cabeus-floor';

  for (let z = 0; z < gridSize; z++) {
    for (let x = 0; x < gridSize; x++) {
      const nx = (x / (gridSize - 1)) * 2 - 1;
      const nz = (z / (gridSize - 1)) * 2 - 1;
      const dist = Math.sqrt(nx * nx + nz * nz);

      const crater = isDeepCrater
        ? Math.pow(dist, 2) * 3.8 - 1.5
        : Math.exp(-Math.pow((dist - 0.55) / 0.22, 2)) * 2.2 - Math.exp(-dist * dist * 5) * 1.4;

      const ridges =
        Math.sin(nx * 5 + seed) * Math.cos(nz * 5 - seed) * 0.45 +
        Math.sin((nx + nz) * 11 + seed) * 0.15;

      heightmap[z * gridSize + x] = crater + ridges;
    }
  }

  const horizonProfile: HorizonPoint[] = Array.from({ length: 360 }, (_, az) => {
    const rad = (az * Math.PI) / 180;
    const baseWall = isDeepCrater ? 6.5 : 1.8;
    const mountain =
      baseWall +
      Math.sin(rad * 3 + seed) * 1.6 +
      Math.cos(rad * 7 - seed * 0.5) * 0.9 +
      Math.max(0, Math.sin(rad * 2 + 1.2) * 2.1);
    return {
      azimuth: az,
      terrainElevDeg: Number(Math.max(0.2, mountain).toFixed(2)),
    };
  });

  const totalHours = input.durationDays * 24;
  const dateOffsetHours = new Date(input.startDateIso).getTime() / (1000 * 3600);
  const timeline: TimeStepData[] = [];

  let sunVisibleHours = 0;
  let earthVisibleHours = 0;
  let totalEnergyWh = 0;

  for (let h = 0; h < totalHours; h++) {
    const t = h + dateOffsetHours;
    const lunarPhase = (t / 708.7) * Math.PI * 2;
    const sunAzimuth = ((t / 708.7) * 360) % 360;
    const maxSunAngle = 90 - Math.abs(input.lat) + 1.54;
    const sunElevation = Math.sin(lunarPhase) * maxSunAngle + 1.2;

    const libPhase = (t / 655.7) * Math.PI * 2;
    const earthAzimuth = (180 + input.lon + Math.sin(libPhase) * 7.5 + 360) % 360;
    const earthElevation = (90 - Math.abs(input.lat)) * 0.9 + Math.sin(libPhase * 2) * 6.5;

    const azIdx = Math.floor(sunAzimuth) % 360;
    const earthAzIdx = Math.floor(earthAzimuth) % 360;

    const isSunVisible = sunElevation > horizonProfile[azIdx].terrainElevDeg;
    const isEarthVisible = earthElevation > horizonProfile[earthAzIdx].terrainElevDeg;

    const powerOutputWatts = isSunVisible
      ? Math.round(450 * Math.max(0.15, Math.sin(((sunElevation + 15) * Math.PI) / 180)))
      : 0;

    if (isSunVisible) sunVisibleHours++;
    if (isEarthVisible) earthVisibleHours++;
    totalEnergyWh += powerOutputWatts;

    timeline.push({
      timestampIso: new Date(new Date(input.startDateIso).getTime() + h * 3600 * 1000).toISOString(),
      hoursFromStart: h,
      sunAzimuth,
      sunElevation,
      earthAzimuth,
      earthElevation,
      isSunVisible,
      isEarthVisible,
      powerOutputWatts,
    });
  }

  const firstDarkIdx = timeline.findIndex((step) => !step.isSunVisible);
  const firstNoCommsIdx = timeline.findIndex((step) => !step.isEarthVisible);

  const sunlightPercent = Math.round((sunVisibleHours / totalHours) * 100);
  const earthCommsPercent = Math.round((earthVisibleHours / totalHours) * 100);

  let status: 'optimal' | 'warning' | 'critical' = 'optimal';
  let statusReason = 'Nominal power & Direct-to-Earth comms';

  if (sunlightPercent < 35 || earthCommsPercent < 40) {
    status = 'critical';
    statusReason = 'High risk of thermal freeze & comms blackout';
  } else if (sunlightPercent < 65 || earthCommsPercent < 70) {
    status = 'warning';
    statusReason = 'Low-power hibernation required in shadow';
  }

  return {
    input,
    gridSize,
    heightmap,
    horizonProfile,
    timeline,
    metrics: {
      sunlightPercent,
      earthCommsPercent,
      hoursUntilSunset: firstDarkIdx === -1 ? null : firstDarkIdx,
      hoursUntilEarthset: firstNoCommsIdx === -1 ? null : firstNoCommsIdx,
      totalEnergyKwh: Number((totalEnergyWh / 1000).toFixed(1)),
      status,
      statusReason,
    },
  };
}