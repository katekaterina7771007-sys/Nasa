import { useId, useState } from 'react';
import type { HorizonPoint, TimeStepData } from '../types';

interface Props {
  horizon: HorizonPoint[];
  currentStep: TimeStepData;
  isEngineerMode: boolean;
}

export function HorizonPlot({ horizon, currentStep, isEngineerMode }: Props) {
  const gradId = useId();
  const [hoverAz, setHoverAz] = useState<number | null>(null);

  // Переводим угол высоты (-5..+25°) в координату Y (высота SVG = 104)
  const mapY = (deg: number) => 84 - deg * 2.5;

  const mountainPoints = [
    `0,104`,
    ...horizon.map((p) => `${p.azimuth},${mapY(p.terrainElevDeg)}`),
    `360,104`,
  ].join(' ');

  const ridgeLine = horizon.map((p) => `${p.azimuth},${mapY(p.terrainElevDeg)}`).join(' ');

  const sunX = currentStep.sunAzimuth;
  const sunY = Math.min(96, Math.max(8, mapY(currentStep.sunElevation)));

  const earthX = currentStep.earthAzimuth;
  const earthY = Math.min(96, Math.max(8, mapY(currentStep.earthElevation)));

  const hoveredPoint = hoverAz !== null ? horizon[hoverAz] : null;

  return (
    <div className="rounded-xl border border-white/10 bg-[#0C0E13] p-3.5 ring-1 ring-inset ring-white/[0.02]">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-medium text-zinc-200">360° Horizon Obstruction Profile</span>
          {hoveredPoint && (
            <span className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[10px] text-orange-300">
              AZ {hoveredPoint.azimuth}° → RIDGE {hoveredPoint.terrainElevDeg.toFixed(1)}°
            </span>
          )}
        </div>

        <div className="flex items-center gap-3 font-mono text-[10px] text-zinc-400">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-amber-400" /> SUN
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-sky-400" /> EARTH
          </span>
          {isEngineerMode && (
            <span className="text-zinc-500">EL {currentStep.earthElevation.toFixed(1)}°</span>
          )}
        </div>
      </div>

      <svg
        viewBox="0 0 360 104"
        className="h-28 w-full cursor-crosshair overflow-hidden rounded-lg border border-white/[0.06] bg-[#06070A]"
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const relX = Math.max(0, Math.min(0.999, (e.clientX - rect.left) / rect.width));
          setHoverAz(Math.floor(relX * 360));
        }}
        onMouseLeave={() => setHoverAz(null)}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3f3f46" stopOpacity="0.65" />
            <stop offset="100%" stopColor="#18181b" stopOpacity="0.95" />
          </linearGradient>
        </defs>

        {/* Горизонтальные линии сетки (0°, 10°, 20°) */}
        {[0, 10, 20].map((deg) => (
          <g key={deg}>
            <line
              x1="0"
              y1={mapY(deg)}
              x2="360"
              y2={mapY(deg)}
              stroke={deg === 0 ? '#52525b' : '#27272a'}
              strokeWidth={deg === 0 ? '0.7' : '0.4'}
              strokeDasharray={deg === 0 ? '3 3' : '1.5 3'}
            />
            <text x="3" y={mapY(deg) - 2} fill="#52525b" fontSize="5" fontFamily="monospace">
              {deg}°
            </text>
          </g>
        ))}

        {/* Вертикальные линии сторон света */}
        {[90, 180, 270].map((az) => (
          <line
            key={az}
            x1={az}
            y1="0"
            x2={az}
            y2="104"
            stroke="#18181b"
            strokeWidth="0.5"
          />
        ))}

        {/* Зона либрации (покачивания) Земли */}
        <ellipse
          cx={earthX}
          cy={earthY}
          rx="14"
          ry="11"
          fill="#38bdf8"
          fillOpacity="0.04"
          stroke="#38bdf8"
          strokeOpacity="0.3"
          strokeWidth="0.6"
          strokeDasharray="2 2"
        />

        {/* Заливка и контур хребтов */}
        <polygon points={mountainPoints} fill={`url(#${gradId})`} />
        <polyline points={ridgeLine} fill="none" stroke="#a1a1aa" strokeWidth="0.9" />

        {/* Линия прицела при наведении курсора */}
        {hoverAz !== null && hoveredPoint && (
          <g>
            <line
              x1={hoverAz}
              y1="0"
              x2={hoverAz}
              y2="104"
              stroke="#ff5d1f"
              strokeOpacity="0.5"
              strokeWidth="0.6"
            />
            <circle
              cx={hoverAz}
              cy={mapY(hoveredPoint.terrainElevDeg)}
              r="2.2"
              fill="#ff5d1f"
            />
          </g>
        )}

        {/* Свечение и маркер Солнца */}
        {currentStep.isSunVisible && (
          <circle cx={sunX} cy={sunY} r="9" fill="#facc15" fillOpacity="0.18" />
        )}
        <circle
          cx={sunX}
          cy={sunY}
          r="4.2"
          fill={currentStep.isSunVisible ? '#fbbf24' : '#52525b'}
          stroke="#fef08a"
          strokeWidth="0.9"
        />

        {/* Свечение и маркер Земли */}
        {currentStep.isEarthVisible && (
          <circle cx={earthX} cy={earthY} r="8" fill="#38bdf8" fillOpacity="0.18" />
        )}
        <circle
          cx={earthX}
          cy={earthY}
          r="3.5"
          fill={currentStep.isEarthVisible ? '#38bdf8' : '#f43f5e'}
          stroke="#e0f2fe"
          strokeWidth="0.8"
        />
      </svg>

      <div className="mt-1.5 flex justify-between font-mono text-[10px] text-zinc-500">
        <span>000° N</span>
        <span>090° E</span>
        <span>180° S</span>
        <span>270° W</span>
        <span>360°</span>
      </div>
    </div>
  );
}