import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame } from '@react-three/fiber';
import { Line, OrbitControls } from '@react-three/drei';
import type { SimulationResult, TimeStepData } from '../types';

interface Props {
  result: SimulationResult;
  currentStep: TimeStepData;
}

function LandingBeacon({ position }: { position: [number, number, number] }) {
  const ringRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (!ringRef.current) return;
    const t = clock.getElapsedTime();
    const scale = 1 + (t % 2) * 0.9;
    ringRef.current.scale.set(scale, scale, 1);
    const mat = ringRef.current.material as THREE.MeshBasicMaterial;
    mat.opacity = Math.max(0, 0.75 * (1 - (t % 2) / 2));
  });

  return (
    <group position={position}>
      {/* Корпус посадочного модуля */}
      <mesh castShadow position={[0, 0.22, 0]}>
        <cylinderGeometry args={[0.2, 0.34, 0.44, 16]} />
        <meshStandardMaterial color="#f4f4f5" metalness={0.6} roughness={0.3} />
      </mesh>
      {/* Оранжевый маяк */}
      <mesh position={[0, 0.48, 0]}>
        <sphereGeometry args={[0.11, 16, 16]} />
        <meshBasicMaterial color="#ff5d1f" />
      </mesh>
      {/* Пульсирующее кольцо на грунте */}
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}>
        <ringGeometry args={[0.45, 0.54, 32]} />
        <meshBasicMaterial color="#ff5d1f" transparent opacity={0.6} side={THREE.DoubleSide} />
      </mesh>
      <pointLight color="#ff5d1f" intensity={1.8} distance={4.5} position={[0, 0.6, 0]} />
    </group>
  );
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

  const sunPos = useMemo<[number, number, number]>(() => {
    const azRad = (currentStep.sunAzimuth * Math.PI) / 180;
    const elRad = (Math.max(0.5, currentStep.sunElevation) * Math.PI) / 180;
    const r = 36;
    return [
      r * Math.cos(elRad) * Math.sin(azRad),
      r * Math.sin(elRad),
      -r * Math.cos(elRad) * Math.cos(azRad),
    ];
  }, [currentStep.sunAzimuth, currentStep.sunElevation]);

  const earthEnd = useMemo<[number, number, number]>(() => {
    const azRad = (currentStep.earthAzimuth * Math.PI) / 180;
    const elRad = (Math.max(1, currentStep.earthElevation) * Math.PI) / 180;
    const r = 11;
    return [
      r * Math.cos(elRad) * Math.sin(azRad),
      centerHeight + 0.5 + r * Math.sin(elRad),
      -r * Math.cos(elRad) * Math.cos(azRad),
    ];
  }, [currentStep.earthAzimuth, currentStep.earthElevation, centerHeight]);

  const isSunUp = currentStep.sunElevation > -1;

  return (
    <>
      <ambientLight intensity={0.07} color="#94a3b8" />
      <directionalLight
        position={sunPos}
        intensity={isSunUp ? 6.5 : 0}
        color="#fff6e5"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0005}
        shadow-normalBias={0.03}
        shadow-camera-left={-14}
        shadow-camera-right={14}
        shadow-camera-top={14}
        shadow-camera-bottom={-14}
        shadow-camera-near={1}
        shadow-camera-far={72}
      />

      {/* Подложка-сетка для ощущения инженерного скана */}
      <gridHelper args={[26, 13, '#27272a', '#18181b']} position={[0, -1.75, 0]} />

      {/* Рельеф Луны */}
      <mesh geometry={geometry} receiveShadow castShadow>
        <meshStandardMaterial color="#b4b7bd" roughness={0.94} metalness={0.04} />
      </mesh>

      <LandingBeacon position={[0, centerHeight, 0]} />

      {/* Луч прямой связи с Землей */}
      <Line
        points={[[0, centerHeight + 0.48, 0], earthEnd]}
        color={currentStep.isEarthVisible ? '#38bdf8' : '#f43f5e'}
        lineWidth={2}
        dashed={!currentStep.isEarthVisible}
        dashScale={6}
      />

      <OrbitControls
        enableDamping
        dampingFactor={0.06}
        maxPolarAngle={Math.PI / 2 - 0.06}
        minDistance={6}
        maxDistance={27}
      />
    </>
  );
}

export function LunarScene({ result, currentStep }: Props) {
  return (
    <div className="group relative h-64 w-full overflow-hidden rounded-xl border border-white/10 bg-[#050608] ring-1 ring-inset ring-white/[0.03]">
      <Canvas shadows camera={{ position: [0, 10.5, 13.5], fov: 40 }}>
        <color attach="background" args={['#050608']} />
        <fog attach="fog" args={['#050608', 22, 42]} />
        <TerrainMesh result={result} currentStep={currentStep} />
      </Canvas>

      {/* Угловые засечки оптического видоискателя */}
      <div className="pointer-events-none absolute inset-2.5 border border-white/[0.04]">
        <div className="absolute -left-[1px] -top-[1px] h-2.5 w-2.5 border-l-2 border-t-2 border-white/30" />
        <div className="absolute -right-[1px] -top-[1px] h-2.5 w-2.5 border-r-2 border-t-2 border-white/30" />
        <div className="absolute -bottom-[1px] -left-[1px] h-2.5 w-2.5 border-b-2 border-l-2 border-white/30" />
        <div className="absolute -bottom-[1px] -right-[1px] h-2.5 w-2.5 border-b-2 border-r-2 border-white/30" />
      </div>

      {/* Верхняя левая плашка телеметрии */}
      <div className="pointer-events-none absolute left-4 top-4 flex items-center gap-2">
        <span className="rounded-md border border-white/10 bg-black/70 px-2 py-0.5 font-mono text-[10px] tracking-wider text-zinc-300 backdrop-blur-md">
          {result.isInsideDem
            ? `LOLA DEM // ${result.patchSpanKm}×${result.patchSpanKm} KM`
            : 'OUTSIDE LOLA TILE // SPHERICAL'}
        </span>
        <span className="hidden rounded-md border border-white/10 bg-black/70 px-2 py-0.5 font-mono text-[10px] text-zinc-400 backdrop-blur-md sm:inline">
          DRAG TO ORBIT
        </span>
      </div>

      {/* Нижняя панель углов и связи */}
      <div className="pointer-events-none absolute bottom-3.5 left-4 right-4 flex items-center justify-between gap-2 text-[11px]">
        <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/75 px-2.5 py-1 font-mono text-zinc-200 backdrop-blur-md">
          <span className="h-1.5 w-1.5 rounded-full bg-orange-400" />
          <span>
            SUN {currentStep.sunElevation.toFixed(1)}° · AZ {Math.round(currentStep.sunAzimuth)}°
          </span>
        </div>

        <div
          className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 font-mono backdrop-blur-md ${
            currentStep.isEarthVisible
              ? 'border-sky-500/30 bg-sky-950/75 text-sky-300'
              : 'border-rose-500/30 bg-rose-950/75 text-rose-300'
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              currentStep.isEarthVisible ? 'animate-pulse bg-sky-400' : 'bg-rose-400'
            }`}
          />
          <span>{currentStep.isEarthVisible ? 'DTE LINK LOCK' : 'TERRAIN OCCLUDED'}</span>
        </div>
      </div>
    </div>
  );
}