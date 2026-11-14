import { useMemo } from 'react';
import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import { Line, OrbitControls } from '@react-three/drei';
import type { SimulationResult, TimeStepData } from '../types';

interface Props {
  result: SimulationResult;
  currentStep: TimeStepData;
}

function TerrainMesh({
  result,
  currentStep,
}: {
  result: SimulationResult;
  currentStep: TimeStepData;
}) {
  const { geometry, centerHeight } = useMemo(() => {
    const size = result.gridSize;
    const geom = new THREE.PlaneGeometry(24, 24, size - 1, size - 1);
    geom.rotateX(-Math.PI / 2);

    const pos = geom.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      pos.setY(i, result.heightmap[i] * 0.9);
    }
    geom.computeVertexNormals();

    const midIdx = Math.floor(size / 2) * size + Math.floor(size / 2);
    return {
      geometry: geom,
      centerHeight: result.heightmap[midIdx] * 0.9,
    };
  }, [result]);

  // Позиция Солнца из азимута и угла над горизонтом
  const sunPos = useMemo<[number, number, number]>(() => {
    const azRad = (currentStep.sunAzimuth * Math.PI) / 180;
    const elRad = (Math.max(0.5, currentStep.sunElevation) * Math.PI) / 180;
    const r = 35;
    return [
      r * Math.cos(elRad) * Math.sin(azRad),
      r * Math.sin(elRad),
      -r * Math.cos(elRad) * Math.cos(azRad),
    ];
  }, [currentStep.sunAzimuth, currentStep.sunElevation]);

  // Вектор направления на Землю
  const earthEnd = useMemo<[number, number, number]>(() => {
    const azRad = (currentStep.earthAzimuth * Math.PI) / 180;
    const elRad = (Math.max(1, currentStep.earthElevation) * Math.PI) / 180;
    const r = 10;
    return [
      r * Math.cos(elRad) * Math.sin(azRad),
      centerHeight + 0.5 + r * Math.sin(elRad),
      -r * Math.cos(elRad) * Math.cos(azRad),
    ];
  }, [currentStep.earthAzimuth, currentStep.earthElevation, centerHeight]);

  const isSunUp = currentStep.sunElevation > -1;

  return (
    <>
      <ambientLight intensity={0.08} />
      <directionalLight
        position={sunPos}
        intensity={isSunUp ? 3.2 : 0}
        color="#fff8e7"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0005}
        shadow-normalBias={0.03}
        shadow-camera-left={-14}
        shadow-camera-right={14}
        shadow-camera-top={14}
        shadow-camera-bottom={-14}
        shadow-camera-near={1}
        shadow-camera-far={70}
      />

      <mesh geometry={geometry} receiveShadow castShadow>
        <meshStandardMaterial color="#8b8e94" roughness={0.95} metalness={0.05} />
      </mesh>

      {/* Посадочный модуль в центре */}
      <group position={[0, centerHeight + 0.25, 0]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.25, 0.35, 0.5, 16]} />
          <meshStandardMaterial color="#f59e0b" emissive="#d97706" emissiveIntensity={0.4} />
        </mesh>
        <pointLight color="#fbbf24" intensity={1.5} distance={4} />
      </group>

      {/* Луч связи с Землей */}
      <Line
        points={[[0, centerHeight + 0.5, 0], earthEnd]}
        color={currentStep.isEarthVisible ? '#22c55e' : '#ef4444'}
        lineWidth={2}
      />

      <OrbitControls maxPolarAngle={Math.PI / 2 - 0.05} minDistance={5} maxDistance={28} />
    </>
  );
}

export function LunarScene({ result, currentStep }: Props) {
  return (
    <div className="relative h-64 w-full overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
      <Canvas shadows camera={{ position: [0, 11, 14], fov: 42 }}>
        <color attach="background" args={['#020617']} />
        <TerrainMesh result={result} currentStep={currentStep} />
      </Canvas>
      <div className="pointer-events-none absolute bottom-2 left-3 flex gap-3 text-[11px] text-slate-300">
        <span className="rounded bg-slate-900/80 px-2 py-0.5">
          Солнце: {currentStep.sunElevation.toFixed(1)}° (Аз. {Math.round(currentStep.sunAzimuth)}°)
        </span>
        <span
          className={`rounded px-2 py-0.5 ${
            currentStep.isEarthVisible
              ? 'bg-emerald-950/90 text-emerald-300'
              : 'bg-rose-950/90 text-rose-300'
          }`}
        >
          {currentStep.isEarthVisible ? 'Связь DTE активна' : 'Земля за хребтом'}
        </span>
      </div>
    </div>
  );
}