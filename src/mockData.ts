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
    name: 'Shackleton Rim (Peak of Eternal Light)',
    region: '89.87° S, 157.26° E · LOLA 3D',
    lat: -89.873,
    lon: 157.26,
    description: 'Highest point on the Shackleton rim (+1647m) with 100% solar illumination in window.',
  },
  {
    id: 'shackleton-floor-psr',
    name: 'Shackleton Crater Floor (PSR)',
    region: '89.67° S, 129.8° E · LOLA 3D',
    lat: -89.67,
    lon: 129.8,
    description: 'Deep Permanently Shadowed Region (PSR) — extreme cold trap with ~2% direct sunlight.',
  },
  {
    id: 'connecting-ridge',
    name: 'Connecting Ridge (Artemis III)',
    region: '89.45° S, 137.5° W · LOLA 3D',
    lat: -89.45,
    lon: -137.5,
    description: 'NASA Artemis III candidate ridge linking Shackleton and de Gerlache craters.',
  },
  {
    id: 'south-pole-center',
    name: 'Geographic South Pole (90° S)',
    region: '90.00° S, 0.0° E · LOLA 3D',
    lat: -90.0,
    lon: 0.0,
    description: 'Exact rotational south pole of the Moon at the center of the LOLA DEM tile.',
  },
  {
    id: 'spudis-ridge',
    name: 'Spudis Ridge (Artemis III)',
    region: '89.20° S, 125.0° W · LOLA 3D',
    lat: -89.20,
    lon: -125.0,
    description: 'Elevated ridge near Shackleton studied for sustained power and rover traverse.',
  },
  {
    id: 'de-gerlache-rim',
    name: 'de Gerlache Crater Rim (Artemis III)',
    region: '88.90° S, 88.0° W · LOLA 3D',
    lat: -88.90,
    lon: -88.0,
    description: 'Official NASA Artemis III candidate landing region with high illumination ridges.',
  },
  {
    id: 'sverdrup-approach',
    name: 'Sverdrup Crater Rim (Artemis III)',
    region: '88.85° S, 152.0° W · LOLA 3D',
    lat: -88.85,
    lon: -152.0,
    description: 'Rim plateau overlooking Sverdrup PSR — prime target for water-ice prospecting.',
  },
  {
    id: 'slater-rim',
    name: 'Slater Crater Rim',
    region: '88.95° S, 110.0° E · LOLA 3D',
    lat: -88.95,
    lon: 110.0,
    description: 'Polar crater rim in the sunlit sector facing Earth during libration peaks.',
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
  {
    id: 'artemis-habitat',
    name: 'Artemis Base Power Station',
    minSunElevationDeg: 1.5,
    maxDarknessHours: 120,
    maxCommsBlackoutHours: 48,
  },
];

export function generateMockSimulation(input: ScenarioInput): SimulationResult {
  const gridSize = 96;
  const heightmap = new Float32Array(gridSize * gridSize);

  const seed = Math.abs(input.lat * 13.7 + input.lon * 7.3);
  const isDeepCrater = input.presetId === 'shackleton-floor-psr';

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
    isInsideDem: true,
    patchSpanKm: 20.7,
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