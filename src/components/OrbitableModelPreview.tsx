import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RotateCcw } from 'lucide-react';
import type { BuildingElementSpec } from '../domain/types';

interface OrbitableModelPreviewProps {
  elements: BuildingElementSpec[];
  label: string;
  heightClass?: string;
}

/**
 * Lightweight, self-disposing orbitable 3D area preview used inside Blueprint management.
 * Renders real BuildingElementSpec geometry on demand (only re-renders on orbit interaction).
 */
export function OrbitableModelPreview({
  elements,
  label,
  heightClass = 'h-[210px]',
}: OrbitableModelPreviewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const resetFnRef = useRef<(() => void) | null>(null);
  const [webglError, setWebglError] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || elements.length === 0) return;

    let renderer: THREE.WebGLRenderer | null = null;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'low-power' });
    } catch {
      setWebglError(true);
      return;
    }

    const width = Math.max(container.clientWidth, 240);
    const height = Math.max(container.clientHeight, 180);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(width, height);
    renderer.setClearColor(0xf4f3ef, 1);

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 120);

    const ambient = new THREE.AmbientLight(0xffffff, 0.85);
    const dir = new THREE.DirectionalLight(0xffffff, 0.65);
    dir.position.set(8, 14, 10);
    scene.add(ambient, dir);

    const group = new THREE.Group();
    const disposables: Array<{ dispose: () => void }> = [];

    const wallMat = new THREE.MeshStandardMaterial({ color: 0xe6e8eb, roughness: 0.78 });
    const partMat = new THREE.MeshStandardMaterial({ color: 0xd5dce3, roughness: 0.8 });
    const slabMat = new THREE.MeshStandardMaterial({ color: 0xcbd2d9, roughness: 0.9 });
    const edgeMat = new THREE.LineBasicMaterial({ color: 0x1b2a4a, transparent: true, opacity: 0.35 });
    disposables.push(wallMat, partMat, slabMat, edgeMat);

    for (const el of elements) {
      for (const box of el.boxes) {
        if (box.kind === 'glass' || box.kind === 'frame' || box.kind === 'door_leaf') continue;
        const geom = new THREE.BoxGeometry(box.size.x, box.size.y, box.size.z);
        disposables.push(geom);
        const mat =
          box.kind === 'slab'
            ? slabMat
            : el.category === 'interior_partition'
              ? partMat
              : wallMat;
        const mesh = new THREE.Mesh(geom, mat);
        mesh.position.set(box.center.x, box.center.y, box.center.z);
        group.add(mesh);

        const edges = new THREE.EdgesGeometry(geom);
        disposables.push(edges);
        const lines = new THREE.LineSegments(edges, edgeMat);
        lines.position.copy(mesh.position);
        group.add(lines);
      }
    }

    scene.add(group);

    // Frame bounding box
    const bbox = new THREE.Box3().setFromObject(group);
    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    bbox.getCenter(center);
    bbox.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z, 4);

    const initialPos = new THREE.Vector3(
      center.x + maxDim * 0.95,
      center.y + maxDim * 0.85,
      center.z + maxDim * 0.95
    );
    camera.position.copy(initialPos);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(center);
    controls.enableDamping = false;
    controls.enablePan = false;
    controls.minDistance = maxDim * 0.5;
    controls.maxDistance = maxDim * 2.8;
    controls.update();

    const renderOnce = () => {
      renderer?.render(scene, camera);
    };

    resetFnRef.current = () => {
      camera.position.copy(initialPos);
      controls.target.copy(center);
      controls.update();
      renderOnce();
    };

    controls.addEventListener('change', renderOnce);
    renderOnce();

    const handleResize = () => {
      if (!container || !renderer) return;
      const w = Math.max(container.clientWidth, 240);
      const h = Math.max(container.clientHeight, 180);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      renderOnce();
    };

    const observer = new ResizeObserver(handleResize);
    observer.observe(container);

    return () => {
      observer.disconnect();
      controls.removeEventListener('change', renderOnce);
      controls.dispose();
      for (const item of disposables) item.dispose();
      renderer?.dispose();
      container.innerHTML = '';
    };
  }, [elements]);

  if (webglError) {
    return (
      <div
        className={`flex ${heightClass} flex-col items-center justify-center rounded-lg border border-[#D9DEE2] bg-[#F4F3EF] p-4 text-center text-[12px] text-[#4F5C67]`}
      >
        <p className="font-semibold text-[#1B2A4A]">3D preview unavailable in this browser</p>
        <p className="mt-1">Open Workspace to inspect the verified area model.</p>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-lg border border-[#D9DEE2] bg-[#F4F3EF]">
      <div
        ref={containerRef}
        aria-label={`Orbitable 3D model preview for ${label}`}
        data-testid="orbitable-3d-preview"
        className={`w-full cursor-grab active:cursor-grabbing ${heightClass}`}
      />
      <div className="pointer-events-none absolute left-2 top-2 rounded bg-[#1B2A4A]/85 px-2 py-0.5 text-[10px] font-semibold text-white">
        Orbitable 3D preview · Drag to rotate
      </div>
      <button
        type="button"
        onClick={() => resetFnRef.current?.()}
        aria-label={`Reset 3D preview camera for ${label}`}
        className="absolute right-2 top-2 inline-flex items-center gap-1 rounded border border-[#D9DEE2] bg-white/95 px-2 py-1 text-[11px] font-medium text-[#1B2A4A] hover:bg-[#F4F3EF]"
      >
        <RotateCcw className="h-3 w-3" aria-hidden="true" />
        Reset
      </button>
    </div>
  );
}
