import { useEffect, useMemo, useState } from 'react';
import {
  BatteryCharging,
  Columns2,
  Download,
  FastForward,
  Pause,
  Play,
  Radio,
  Sparkles,
  Square,
  Sun,
  Wrench,
} from 'lucide-react';
import { HorizonPlot } from './components/HorizonPlot';
import { LunarScene } from './components/LunarScene';
import { generateMockSimulation, LANDING_PRESETS, ROVER_PROFILES } from './mockData';
import type { ScenarioInput } from './types';
import { loadLunarDem, runLunarSimulation, type DemDataset } from './lunarEngine';

export function App() {
  const [isSplitMode, setIsSplitMode] = useState(true);
  const [isEngineerMode, setIsEngineerMode] = useState(true);
  const [hourIndex, setHourIndex] = useState(18);
  const [isPlaying, setIsPlaying] = useState(false);
  const [demData, setDemData] = useState<DemDataset | null>(null);
  useEffect(() => {
    loadLunarDem()
      .then((data) => setDemData(data))
      .catch((err) => console.error('DEM load fallback to mock:', err));
  }, []);

  const [scenarioA, setScenarioA] = useState<ScenarioInput>({
    id: 'A',
    presetId: 'shackleton-rim',
    name: 'Scenario A: Shackleton Rim',
    lat: -89.873,
    lon: 157.26,
    startDateIso: '2026-11-15T00:00:00Z',
    durationDays: 14,
    roverId: 'artemis-habitat',
  });

  const [scenarioB, setScenarioB] = useState<ScenarioInput>({
    id: 'B',
    presetId: 'shackleton-floor-psr',
    name: 'Scenario B: Shackleton Crater Floor (PSR)',
    lat: -89.67,
    lon: 129.8,
    startDateIso: '2026-11-15T00:00:00Z',
    durationDays: 14,
    roverId: 'csa-rover',
  });

const resultA = useMemo(
  () => (demData ? runLunarSimulation(scenarioA, demData) : generateMockSimulation(scenarioA)),
  [scenarioA, demData]
);
const resultB = useMemo(
  () => (demData ? runLunarSimulation(scenarioB, demData) : generateMockSimulation(scenarioB)),
  [scenarioB, demData]
);

  const maxHours = resultA.timeline.length - 1;
  const safeHour = Math.min(hourIndex, maxHours);

  useEffect(() => {
    if (!isPlaying) return;
    const timer = setInterval(() => {
      setHourIndex((prev) => (prev >= maxHours ? 0 : prev + 1));
    }, 110);
    return () => clearInterval(timer);
  }, [isPlaying, maxHours]);

  const handlePresetChange = (side: 'A' | 'B', presetId: string) => {
    const preset = LANDING_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    const updater = (prev: ScenarioInput): ScenarioInput => ({
      ...prev,
      presetId: preset.id,
      name: `Scenario ${side}: ${preset.name}`,
      lat: preset.lat,
      lon: preset.lon,
    });
    if (side === 'A') setScenarioA(updater);
    else setScenarioB(updater);
  };

  const handleExportReport = () => {
    const payload = {
      generatedAt: new Date().toISOString(),
      missionElapsedHours: safeHour,
      scenarioA: { input: scenarioA, metrics: resultA.metrics },
      ...(isSplitMode ? { scenarioB: { input: scenarioB, metrics: resultB.metrics } } : {}),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lunar-site-tradeoff-${scenarioA.startDateIso.slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const renderScenarioCard = (
    input: ScenarioInput,
    setInput: React.Dispatch<React.SetStateAction<ScenarioInput>>,
    result: typeof resultA
  ) => {
    const step = result.timeline[safeHour];
    const presetInfo = LANDING_PRESETS.find((p) => p.id === input.presetId);

    const statusConfig =
      result.metrics.status === 'optimal'
        ? {
            pill: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
            dot: 'bg-emerald-400',
            tag: 'GO',
          }
        : result.metrics.status === 'warning'
        ? {
            pill: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
            dot: 'bg-amber-400',
            tag: 'CAUTION',
          }
        : {
            pill: 'border-rose-500/30 bg-rose-500/10 text-rose-300',
            dot: 'bg-rose-400',
            tag: 'NO-GO',
          };

    return (
      <section className="flex flex-col gap-2.5 rounded-2xl border border-white/10 bg-[#111318] p-3 shadow-2xl shadow-black/50 ring-1 ring-inset ring-white/[0.03]">
        {/* Верхняя панель карточки: выбор точки и даты */}
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5">
            <span
              className={`flex h-7 w-7 items-center justify-center rounded-lg font-mono text-xs font-bold ${
                input.id === 'A'
                  ? 'border border-orange-500/40 bg-orange-500/15 text-orange-400'
                  : 'border border-sky-500/40 bg-sky-500/15 text-sky-400'
              }`}
            >
              {input.id}
            </span>

            <select
              value={input.presetId}
              onChange={(e) => handlePresetChange(input.id, e.target.value)}
              className="rounded-lg border border-white/10 bg-[#181B22] px-3 py-1.5 text-xs font-semibold text-zinc-100 outline-none transition hover:border-white/20 focus:border-orange-500"
            >
              {LANDING_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="hidden font-mono text-[10px] uppercase tracking-wider text-zinc-500 sm:inline">
              Touchdown
            </span>
            <input
              type="date"
              value={input.startDateIso.slice(0, 10)}
              onChange={(e) =>
                setInput((prev) => ({ ...prev, startDateIso: `${e.target.value}T00:00:00Z` }))
              }
              className="rounded-lg border border-white/10 bg-[#181B22] px-2.5 py-1 font-mono text-xs text-zinc-200 outline-none transition hover:border-white/20 focus:border-orange-500"
            />
          </div>
        </div>

        {/* Координаты и вердикт пригодности */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-y border-white/[0.06] py-2 text-xs">
          <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] text-zinc-400">
            <label className="flex items-center gap-1">
              <span className="text-zinc-500">LAT</span>
              <input
                type="number"
                step="0.1"
                value={input.lat}
                onChange={(e) => {
                  const parsed = Number(e.target.value.replace(',', '.'));
                  if (!Number.isNaN(parsed)) setInput((prev) => ({ ...prev, lat: parsed }));
                }}
                className="w-16 rounded border border-white/10 bg-black/50 px-1.5 py-0.5 text-zinc-200 outline-none focus:border-orange-500"
              />
            </label>
            <label className="flex items-center gap-1">
              <span className="text-zinc-500">LON</span>
              <input
                type="number"
                step="0.1"
                value={input.lon}
                onChange={(e) => {
                  const parsed = Number(e.target.value.replace(',', '.'));
                  if (!Number.isNaN(parsed)) setInput((prev) => ({ ...prev, lon: parsed }));
                }}
                className="w-16 rounded border border-white/10 bg-black/50 px-1.5 py-0.5 text-zinc-200 outline-none focus:border-orange-500"
              />
            </label>

            {/* ВОТ СЮДА: индикатор выхода за пределы карты LOLA */}
            {!result.isInsideDem && (
              <span className="rounded border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 font-mono text-[10px] text-amber-300">
                OUTSIDE ±37KM DEM TILE
              </span>
            )}
          </div>

          <div
            className={`flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${statusConfig.pill}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${statusConfig.dot}`} />
            <span className="font-mono font-bold">{statusConfig.tag}:</span>
            <span>{result.metrics.statusReason}</span>
          </div>
        </div>

        {/* Пояснение точки в режиме Исследователя */}
        {!isEngineerMode && presetInfo && (
          <p className="rounded-lg bg-white/[0.03] px-3 py-1.5 text-xs text-zinc-400">
            {presetInfo.description}
          </p>
        )}

        {/* 3D-ландшафт */}
        <LunarScene result={result} currentStep={step} />

        {/* Панорама горизонта на 360° */}
        <HorizonPlot
          horizon={result.horizonProfile}
          currentStep={step}
          isEngineerMode={isEngineerMode}
        />

        {/* 4 карточки телеметрии */}
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <div className="rounded-xl border border-white/[0.07] bg-[#0B0D11] p-3">
            <div className="flex items-center justify-between text-[11px] text-zinc-400">
              <span>Solar Window</span>
              <Sun className="h-3.5 w-3.5 text-amber-400" />
            </div>
            <div className="mt-1 font-mono text-xl font-bold text-white">
              {result.metrics.sunlightPercent}%
            </div>
            <div className="mt-0.5 font-mono text-[10px] text-amber-300/90">
              {result.metrics.hoursUntilSunset !== null
                ? `SUNSET IN ${result.metrics.hoursUntilSunset}H`
                : 'NO SUNSET IN WINDOW'}
            </div>
          </div>

          <div className="rounded-xl border border-white/[0.07] bg-[#0B0D11] p-3">
            <div className="flex items-center justify-between text-[11px] text-zinc-400">
              <span>DTE Comms</span>
              <Radio className="h-3.5 w-3.5 text-sky-400" />
            </div>
            <div className="mt-1 font-mono text-xl font-bold text-white">
              {result.metrics.earthCommsPercent}%
            </div>
            <div className="mt-0.5 font-mono text-[10px] text-sky-300/90">
              {result.metrics.hoursUntilEarthset !== null
                ? `EARTHSET IN ${result.metrics.hoursUntilEarthset}H`
                : 'CONTINUOUS LINK'}
            </div>
          </div>

          <div className="rounded-xl border border-white/[0.07] bg-[#0B0D11] p-3">
            <div className="flex items-center justify-between text-[11px] text-zinc-400">
              <span>Array Output</span>
              <BatteryCharging className="h-3.5 w-3.5 text-emerald-400" />
            </div>
            <div className="mt-1 font-mono text-xl font-bold text-emerald-400">
              {step.powerOutputWatts} <span className="text-xs font-normal text-zinc-400">W</span>
            </div>
            <div className="mt-0.5 font-mono text-[10px] text-zinc-500">
              TOTAL {result.metrics.totalEnergyKwh} KWH
            </div>
          </div>

          <div className="flex flex-col justify-between rounded-xl border border-white/[0.07] bg-[#0B0D11] p-3">
            <div className="text-[11px] text-zinc-400">Hardware Class</div>
            <select
              value={input.roverId}
              onChange={(e) => setInput((prev) => ({ ...prev, roverId: e.target.value }))}
              className="mt-1 w-full rounded-md border border-white/10 bg-[#161920] px-2 py-1.5 text-xs font-medium text-zinc-200 outline-none focus:border-orange-500"
            >
              {ROVER_PROFILES.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>
    );
  };

  const lightDelta = resultB.metrics.sunlightPercent - resultA.metrics.sunlightPercent;
  const commsDelta = resultB.metrics.earthCommsPercent - resultA.metrics.earthCommsPercent;
  const progressPercent = maxHours > 0 ? (safeHour / maxHours) * 100 : 0;

  return (
    <div className="flex min-h-screen flex-col bg-[#08090C] text-zinc-100">
      {/* Верхний пульт навигации */}
      <header className="sticky top-0 z-20 border-b border-white/10 bg-[#0B0C10]/90 px-5 py-3 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-orange-500/40 bg-gradient-to-br from-orange-500 to-amber-600 font-mono text-xs font-bold text-black shadow-lg shadow-orange-500/20">
              L//N
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-bold tracking-wider text-white">
                  LUNAR LANDING SITE NAVIGATOR
                </h1>
                <span className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
                  SOUTH POLE
                </span>
              </div>
              <p className="text-[11px] text-zinc-500">
                Rapid Illumination & Direct-to-Earth Trade-Off Workbench · NASA LOLA & Horizons
              </p>
            </div>
          </div>

          {/* Сводка дельты при сравнении A vs B */}
          {isSplitMode && (
            <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-[#111318] px-3.5 py-1.5 font-mono text-xs">
              <span className="text-zinc-500">DELTA (B − A)</span>
              <span className={lightDelta >= 0 ? 'font-semibold text-emerald-400' : 'font-semibold text-rose-400'}>
                {lightDelta >= 0 ? `+${lightDelta}%` : `${lightDelta}%`} SUN
              </span>
              <span className="text-zinc-700">/</span>
              <span className={commsDelta >= 0 ? 'font-semibold text-sky-400' : 'font-semibold text-rose-400'}>
                {commsDelta >= 0 ? `+${commsDelta}%` : `${commsDelta}%`} DTE
              </span>
            </div>
          )}

          {/* Переключатели режимов и экспорт */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsSplitMode(!isSplitMode)}
              className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-[#14171F] px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-white/20 hover:bg-[#1B1F2A]"
            >
              {isSplitMode ? <Square className="h-3.5 w-3.5 text-zinc-400" /> : <Columns2 className="h-3.5 w-3.5 text-orange-400" />}
              {isSplitMode ? 'Single View' : 'Compare A vs B'}
            </button>

            <button
              onClick={() => setIsEngineerMode(!isEngineerMode)}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                isEngineerMode
                  ? 'border-orange-500/40 bg-orange-500/15 text-orange-300 hover:bg-orange-500/25'
                  : 'border-sky-500/40 bg-sky-500/15 text-sky-300 hover:bg-sky-500/25'
              }`}
            >
              {isEngineerMode ? <Wrench className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
              {isEngineerMode ? 'Engineer' : 'Explorer'}
            </button>

            <button
              onClick={handleExportReport}
              title="Export mission trade-off JSON"
              className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-[#14171F] px-2.5 py-1.5 text-xs font-medium text-zinc-300 transition hover:border-white/20 hover:text-white"
            >
              <Download className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Export</span>
            </button>
          </div>
        </div>
      </header>

      {/* Подсказка-квест для режима Исследователя */}
      {!isEngineerMode && (
        <div className="mx-auto mt-4 w-full max-w-[1440px] px-5">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-sky-500/25 bg-sky-950/25 px-4 py-2.5 text-xs text-sky-200">
            <div>
              <strong className="font-mono uppercase tracking-wider text-sky-400">
                Guided Mission Brief:{' '}
              </strong>
              Near the lunar south pole, the Sun skims the horizon at 1.5°–5°. Shift the landing
              date in Scenario B by 14 days to see how crater rim shadows cut off power and Earth
              line-of-sight.
            </div>
          </div>
        </div>
      )}

      {/* Основная сетка сценариев */}
      <main className="mx-auto w-full max-w-[1440px] flex-1 p-5">
        <div className={isSplitMode ? 'grid grid-cols-1 gap-5 lg:grid-cols-2' : 'grid grid-cols-1'}>
          {renderScenarioCard(scenarioA, setScenarioA, resultA)}
          {isSplitMode && renderScenarioCard(scenarioB, setScenarioB, resultB)}
        </div>
      </main>

      {/* Дизайнерский нижний таймлайн-плеер */}
      <footer className="sticky bottom-0 z-20 border-t border-white/10 bg-[#0B0C10]/95 px-5 py-3 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1440px] items-center gap-4">
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-500 text-black shadow-lg shadow-orange-500/25 transition hover:bg-orange-400 active:scale-95"
          >
            {isPlaying ? <Pause className="h-4 w-4 fill-current" /> : <Play className="h-4 w-4 fill-current" />}
          </button>

          <div className="flex-1">
            <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-3 font-mono">
                <span className="text-zinc-400">
                  MET <strong className="text-white">+{String(safeHour).padStart(3, '0')}H</strong>
                </span>
                <span className="rounded bg-white/5 px-1.5 py-0.5 text-[11px] text-zinc-300">
                  SOL DAY {Math.floor(safeHour / 24) + 1} / 14
                </span>
                <span className="hidden text-[11px] text-zinc-500 md:inline">
                  {resultA.timeline[safeHour]?.timestampIso.replace('T', ' ').slice(0, 16)} UTC
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setHourIndex((prev) => Math.min(maxHours, prev + 24))}
                  className="flex items-center gap-1 rounded border border-white/10 bg-white/5 px-2 py-0.5 font-mono text-[10px] text-zinc-300 transition hover:bg-white/10"
                >
                  <FastForward className="h-2.5 w-2.5" /> +24H
                </button>
                <button
                  onClick={() => setHourIndex((prev) => Math.min(maxHours, prev + 168))}
                  className="rounded border border-white/10 bg-white/5 px-2 py-0.5 font-mono text-[10px] text-zinc-300 transition hover:bg-white/10"
                >
                  +7D
                </button>
              </div>
            </div>

            {/* Кастомная шкала с подсветкой окон света и связи для Сценария A */}
            <div className="relative flex h-4 items-center">
              <div className="flex h-2 w-full overflow-hidden rounded-full bg-zinc-900 ring-1 ring-inset ring-white/10">
                {resultA.timeline.map((step, idx) => (
                  <div
                    key={idx}
                    className={`h-full flex-1 ${
                      step.isSunVisible && step.isEarthVisible
                        ? 'bg-amber-400/70'
                        : step.isSunVisible
                        ? 'bg-orange-500/45'
                        : step.isEarthVisible
                        ? 'bg-sky-500/45'
                        : 'bg-zinc-900'
                    }`}
                  />
                ))}
              </div>

              {/* Бегунок текущей позиции */}
              <div
                style={{ left: `${progressPercent}%` }}
                className="pointer-events-none absolute top-1/2 h-4 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_10px_#fff]"
              />

              {/* Невидимый нативный range поверх для плавного перетаскивания мышкой и стрелками */}
              <input
                type="range"
                min={0}
                max={maxHours}
                value={safeHour}
                onChange={(e) => setHourIndex(Number(e.target.value))}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;