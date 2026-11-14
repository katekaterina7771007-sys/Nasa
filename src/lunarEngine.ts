import * as Astronomy from 'astronomy-engine';
import { ROVER_PROFILES } from './mockData';
import type {
  HorizonPoint,
  ScenarioInput,
  SimulationResult,
  TimeStepData,
} from './types';

const MOON_RADIUS_M = 1737400;
const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

export interface DemDataset {
  width: number;
  height: number;
  resolutionM: number;
  originXM: number;
  originYM: number;
  elevations: Float32Array;
  groundTruth: unknown;
}

let cachedDemPromise: Promise<DemDataset> | null = null;

export function loadLunarDem(): Promise<DemDataset> {
  if (cachedDemPromise) return cachedDemPromise;

  cachedDemPromise = (async () => {
    const [metaRes, binRes, gtRes] = await Promise.all([
      fetch('/data/dem_meta.json'),
      fetch('/data/south_pole_dem.bin'),
      fetch('/data/horizons_ground_truth.json').catch(() => null),
    ]);

    if (!metaRes.ok || !binRes.ok) {
      throw new Error('Failed to load LOLA DEM files from /data/');
    }

    const meta = await metaRes.json();
    const buffer = await binRes.arrayBuffer();
    const elevations = new Float32Array(buffer);
    const groundTruth = gtRes && gtRes.ok ? await gtRes.json() : null;

    const inferredSide = Math.round(Math.sqrt(elevations.length));
    const width: number = Number(meta.width ?? meta.cols ?? inferredSide) || 1024;
    const height: number = Number(meta.height ?? meta.rows ?? inferredSide) || 1024;

    // Читаем точные ключи из dem_meta.json (pixelSizeM и boundsM)
    const resolutionM: number =
      Number(
        meta.pixelSizeM ??
          meta.resolution_m ??
          meta.pixel_size_m ??
          meta.scale_m
      ) || 71.99;

    const originXM: number =
      Number(meta.boundsM?.minX ?? meta.x_min ?? meta.origin_x) ||
      -(width / 2) * resolutionM;

    const originYM: number =
      Number(meta.boundsM?.maxY ?? meta.y_max ?? meta.origin_y) ||
      (height / 2) * resolutionM;

    console.info(
      `[LunarEngine] LOLA DEM loaded: ${width}x${height}, res=${resolutionM.toFixed(2)}m/px, boundsX=[${originXM.toFixed(0)}m..${(originXM + width * resolutionM).toFixed(0)}m]`
    );
    logBestRimPeak({ width, height, resolutionM, originXM, originYM, elevations, groundTruth })
    verifyHorizonsAccuracy();

    return {
      width,
      height,
      resolutionM,
      originXM,
      originYM,
      elevations,
      groundTruth,
    };
  })();

  return cachedDemPromise;
}
// Вставь вызов logBestRimPeak({ width, height, resolutionM, originXM, originYM, elevations, groundTruth }) внутри loadLunarDem()
function logBestRimPeak(dem: DemDataset) {
  let bestElev = -Infinity;
  let bestLat = -89.7;
  let bestLon = 0;

  for (let py = 250; py < 774; py++) {
    for (let px = 250; px < 774; px++) {
      const elev = dem.elevations[py * dem.width + px];
      if (elev > bestElev) {
        bestElev = elev;
        const xM = dem.originXM + px * dem.resolutionM;
        const yM = dem.originYM - py * dem.resolutionM;
        const r = Math.hypot(xM, yM);
        bestLat = -90 + 2 * Math.atan(r / (2 * MOON_RADIUS_M)) * RAD2DEG;
        bestLon = Math.atan2(xM, yM) * RAD2DEG;
      }
    }
  }
  console.info(
    `[Peak Finder] True highest rim peak: elev=${bestElev.toFixed(1)}m -> lat: ${bestLat.toFixed(3)}, lon: ${bestLon.toFixed(2)}`
  );
}
function latLonToPixel(
  lat: number,
  lon: number,
  dem: DemDataset
): { px: number; py: number; isInsideDem: boolean } {
  const clampedLat = Math.max(-90, Math.min(-60, lat));
  const colatRad = (90 + clampedLat) * DEG2RAD;
  const lonRad = lon * DEG2RAD;

  // Полярная стереографическая проекция Южного полюса (0° долготы направлен вверх -Y)
  const r = 2 * MOON_RADIUS_M * Math.tan(colatRad / 2);
  const xM = r * Math.sin(lonRad);
  const yM = r * Math.cos(lonRad);

  const rawPx = Math.round((xM - dem.originXM) / dem.resolutionM);
  const rawPy = Math.round((dem.originYM - yM) / dem.resolutionM);

  const isInsideDem =
    rawPx >= 0 && rawPx < dem.width && rawPy >= 0 && rawPy < dem.height;

  return {
    px: Math.max(0, Math.min(dem.width - 1, rawPx)),
    py: Math.max(0, Math.min(dem.height - 1, rawPy)),
    isInsideDem,
  };
}

function sampleElevation(dem: DemDataset, x: number, y: number): number {
  const cx = Math.max(0, Math.min(dem.width - 1, Math.round(x)));
  const cy = Math.max(0, Math.min(dem.height - 1, Math.round(y)));
  const val = dem.elevations[cy * dem.width + cx];
  return Number.isFinite(val) ? val : 0;
}

function computeHorizonProfile(
  dem: DemDataset,
  centerPx: number,
  centerPy: number,
  isInsideDem: boolean
): HorizonPoint[] {
  // Если точка за пределами растра LOLA ±37 км — возвращаем сферический горизонт 0°
  if (!isInsideDem) {
    return Array.from({ length: 360 }, (_, az) => ({
      azimuth: az,
      terrainElevDeg: 0,
    }));
  }

  const siteElevM = sampleElevation(dem, centerPx, centerPy);
  const maxSteps = Math.floor(dem.width / 2); // 512 шагов ≈ 36.8 км до границы растра
  const profile: HorizonPoint[] = [];

  for (let az = 0; az < 360; az++) {
    const azRad = az * DEG2RAD;
    const dx = Math.sin(azRad);
    const dy = -Math.cos(azRad);

    let maxAngleDeg = -5.0;

    for (let step = 1; step <= maxSteps; step++) {
      const rx = centerPx + dx * step;
      const ry = centerPy + dy * step;

      if (rx < 0 || rx >= dem.width || ry < 0 || ry >= dem.height) break;

      const targetElevM = sampleElevation(dem, rx, ry);
      const distM = step * dem.resolutionM;

      const curvatureDropDeg = (distM / (2 * MOON_RADIUS_M)) * RAD2DEG;
      const geomAngleDeg = Math.atan2(targetElevM - siteElevM, distM) * RAD2DEG;
      const apparentAngleDeg = geomAngleDeg - curvatureDropDeg;

      if (apparentAngleDeg > maxAngleDeg) {
        maxAngleDeg = apparentAngleDeg;
      }
    }

    profile.push({
      azimuth: az,
      terrainElevDeg: Number(maxAngleDeg.toFixed(2)),
    });
  }

  return profile;
}

function eqjToLunarTopocentric(
  vecEqj: Astronomy.Vector,
  astroTime: Astronomy.AstroTime,
  latDeg: number,
  lonDeg: number
): { azimuth: number; elevation: number } {
  const d = astroTime.tt; // Terrestrial Time (дни от J2000.0) по стандарту IAU
  const T = d / 36525.0;

  const E1 = (125.045 - 0.0529921 * d) * DEG2RAD;
  const E2 = (250.089 - 0.1059842 * d) * DEG2RAD;
  const E3 = (260.008 + 13.0120009 * d) * DEG2RAD;
  const E4 = (176.625 + 13.3407154 * d) * DEG2RAD;
  const E5 = (357.529 + 0.9856003 * d) * DEG2RAD;
  const E6 = (311.589 + 26.4057084 * d) * DEG2RAD;
  const E7 = (134.963 + 13.064993 * d) * DEG2RAD;
  const E10 = (15.134 - 0.1589763 * d) * DEG2RAD;
  const E13 = (25.053 + 12.9590088 * d) * DEG2RAD;

  const alpha0 =
    (269.9949 +
      0.0031 * T -
      3.8787 * Math.sin(E1) -
      0.1204 * Math.sin(E2) +
      0.07 * Math.sin(E3) -
      0.0172 * Math.sin(E4) +
      0.0072 * Math.sin(E6) -
      0.0052 * Math.sin(E10) +
      0.0043 * Math.sin(E13)) *
    DEG2RAD;

  const delta0 =
    (66.5392 +
      0.013 * T +
      1.5419 * Math.cos(E1) +
      0.0239 * Math.cos(E2) -
      0.0278 * Math.cos(E3) +
      0.0068 * Math.cos(E4) -
      0.0029 * Math.cos(E6) +
      0.0009 * Math.cos(E7) +
      0.0008 * Math.cos(E10) -
      0.0009 * Math.cos(E13)) *
    DEG2RAD;

  const W =
    (38.3213 +
      13.17635815 * d -
      1.4e-12 * d * d +
      3.561 * Math.sin(E1) +
      0.1208 * Math.sin(E2) -
      0.0642 * Math.sin(E3) +
      0.0158 * Math.sin(E4) +
      0.0252 * Math.sin(E5) -
      0.0066 * Math.sin(E6) -
      0.0047 * Math.sin(E7) +
      0.0052 * Math.sin(E10) -
      0.0044 * Math.sin(E13)) *
    DEG2RAD;

  const a = alpha0 + Math.PI / 2;
  const b = Math.PI / 2 - delta0;

  const x1 = Math.cos(a) * vecEqj.x + Math.sin(a) * vecEqj.y;
  const y1 = -Math.sin(a) * vecEqj.x + Math.cos(a) * vecEqj.y;
  const z1 = vecEqj.z;

  const x2 = x1;
  const y2 = Math.cos(b) * y1 + Math.sin(b) * z1;
  const z2 = -Math.sin(b) * y1 + Math.cos(b) * z1;

  const xSel = Math.cos(W) * x2 + Math.sin(W) * y2;
  const ySel = -Math.sin(W) * x2 + Math.cos(W) * y2;
  const zSel = z2;

  const phi = latDeg * DEG2RAD;
  const lam = lonDeg * DEG2RAD;

  const up =
    xSel * Math.cos(phi) * Math.cos(lam) +
    ySel * Math.cos(phi) * Math.sin(lam) +
    zSel * Math.sin(phi);
  const east = -xSel * Math.sin(lam) + ySel * Math.cos(lam);
  const north =
    -xSel * Math.sin(phi) * Math.cos(lam) -
    ySel * Math.sin(phi) * Math.sin(lam) +
    zSel * Math.cos(phi);

  const dist = Math.hypot(up, east, north) || 1;
  const elevation = Math.asin(Math.max(-1, Math.min(1, up / dist))) * RAD2DEG;
  const azimuth = (Math.atan2(east, north) * RAD2DEG + 360) % 360;

  return { azimuth, elevation };
}

function verifyHorizonsAccuracy() {
  const t = Astronomy.MakeTime(new Date('2026-11-15T00:00:00Z'));
  const geoSun = Astronomy.GeoVector(Astronomy.Body.Sun, t, true);
  const geoMoon = Astronomy.GeoVector(Astronomy.Body.Moon, t, true);
  const moonToSun = new Astronomy.Vector(
    geoSun.x - geoMoon.x,
    geoSun.y - geoMoon.y,
    geoSun.z - geoMoon.z,
    t
  );
  const moonToEarth = new Astronomy.Vector(-geoMoon.x, -geoMoon.y, -geoMoon.z, t);

  const sun = eqjToLunarTopocentric(moonToSun, t, -89.78, 0.0);
  const earth = eqjToLunarTopocentric(moonToEarth, t, -89.78, 0.0);
  console.info(
    `[Horizons Check @ Shackleton 2026-11-15 00:00] Sun Az=${sun.azimuth.toFixed(2)}° (JPL: 114.44°), El=${sun.elevation.toFixed(2)}° (JPL: 1.47°) | Earth Az=${earth.azimuth.toFixed(2)}° (JPL: 356.00°), El=${earth.elevation.toFixed(2)}° (JPL: -3.33°)`
  );
}

export function runLunarSimulation(input: ScenarioInput, dem: DemDataset): SimulationResult {
  const { px, py, isInsideDem } = latLonToPixel(input.lat, input.lon, dem);
  const siteElevM = sampleElevation(dem, px, py);

  // Шаг 3 пикселя на сетке 96x96 = ~20.7 км (весь кратер Шеклтон виден целиком)
  const gridSize = 96;
  const pixelStride = isInsideDem ? 3 : 1;
  const half = Math.floor(gridSize / 2);
  const heightmap = new Float32Array(gridSize * gridSize);
  const verticalScale = 1 / 700;

  for (let gz = 0; gz < gridSize; gz++) {
    for (let gx = 0; gx < gridSize; gx++) {
      if (!isInsideDem) {
        heightmap[gz * gridSize + gx] = 0;
        continue;
      }
      const sampleX = px + (gx - half) * pixelStride;
      const sampleY = py + (gz - half) * pixelStride;
      const elevM = sampleElevation(dem, sampleX, sampleY);
      heightmap[gz * gridSize + gx] = (elevM - siteElevM) * verticalScale;
    }
  }

  const horizonProfile = computeHorizonProfile(dem, px, py, isInsideDem);

  const totalHours = input.durationDays * 24;
  const startMs = new Date(input.startDateIso).getTime();
  const timeline: TimeStepData[] = [];

  const rover = ROVER_PROFILES.find((r) => r.id === input.roverId) ?? ROVER_PROFILES[0];

  let sunVisibleHours = 0;
  let earthVisibleHours = 0;
  let totalEnergyWh = 0;
  let currentDarkStreak = 0;
  let maxDarkStreak = 0;
  let currentBlackoutStreak = 0;
  let maxBlackoutStreak = 0;

  for (let h = 0; h < totalHours; h++) {
    const stepDate = new Date(startMs + h * 3600 * 1000);
    const astroTime = Astronomy.MakeTime(stepDate);

    const geoSun = Astronomy.GeoVector(Astronomy.Body.Sun, astroTime, true);
    const geoMoon = Astronomy.GeoVector(Astronomy.Body.Moon, astroTime, true);

    const moonToSun = new Astronomy.Vector(
      geoSun.x - geoMoon.x,
      geoSun.y - geoMoon.y,
      geoSun.z - geoMoon.z,
      astroTime
    );
    const moonToEarth = new Astronomy.Vector(-geoMoon.x, -geoMoon.y, -geoMoon.z, astroTime);

    const sunTopo = eqjToLunarTopocentric(moonToSun, astroTime, input.lat, input.lon);
    const earthTopo = eqjToLunarTopocentric(moonToEarth, astroTime, input.lat, input.lon);

    const sunAzIdx = Math.floor(sunTopo.azimuth) % 360;
    const earthAzIdx = Math.floor(earthTopo.azimuth) % 360;

    const isSunVisible = sunTopo.elevation > horizonProfile[sunAzIdx].terrainElevDeg;
    const isEarthVisible = earthTopo.elevation > horizonProfile[earthAzIdx].terrainElevDeg;

    const effectiveAngle = Math.max(0, sunTopo.elevation);
    const powerOutputWatts = isSunVisible
      ? Math.round(480 * Math.max(0.18, Math.sin(((effectiveAngle + 12) * Math.PI) / 180)))
      : 0;

    if (isSunVisible) {
      sunVisibleHours++;
      currentDarkStreak = 0;
    } else {
      currentDarkStreak++;
      if (currentDarkStreak > maxDarkStreak) maxDarkStreak = currentDarkStreak;
    }

    if (isEarthVisible) {
      earthVisibleHours++;
      currentBlackoutStreak = 0;
    } else {
      currentBlackoutStreak++;
      if (currentBlackoutStreak > maxBlackoutStreak) maxBlackoutStreak = currentBlackoutStreak;
    }

    totalEnergyWh += powerOutputWatts;

    timeline.push({
      timestampIso: stepDate.toISOString(),
      hoursFromStart: h,
      sunAzimuth: sunTopo.azimuth,
      sunElevation: sunTopo.elevation,
      earthAzimuth: earthTopo.azimuth,
      earthElevation: earthTopo.elevation,
      isSunVisible,
      isEarthVisible,
      powerOutputWatts,
    });
  }

  const firstDarkIdx = timeline.findIndex((s) => !s.isSunVisible);
  const firstNoCommsIdx = timeline.findIndex((s) => !s.isEarthVisible);

  const sunlightPercent = Math.round((sunVisibleHours / totalHours) * 100);
  const earthCommsPercent = Math.round((earthVisibleHours / totalHours) * 100);

  let status: 'optimal' | 'warning' | 'critical' = 'optimal';
  let statusReason = 'Nominal power & Direct-to-Earth comms';

  if (maxDarkStreak > rover.maxDarknessHours || sunlightPercent < 30) {
    status = 'critical';
    statusReason = `Critical shadow: ${maxDarkStreak}h continuous darkness`;
  } else if (maxBlackoutStreak > rover.maxCommsBlackoutHours || earthCommsPercent < 45) {
    status = 'warning';
    statusReason = `Comms gap up to ${maxBlackoutStreak}h (terrain occlusion)`;
  } else if (sunlightPercent < 65) {
    status = 'warning';
    statusReason = 'Battery hibernation needed during shadow';
  }

  return {
    input,
    isInsideDem,
    patchSpanKm: Number(((gridSize * pixelStride * dem.resolutionM) / 1000).toFixed(1)),
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