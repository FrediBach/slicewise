import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { ThreeDArtifact, ThreeDSlices } from './three-d-project';
export type ReferenceView = 'Fit' | 'Front' | 'Side' | 'Top' | 'Isometric';
export type SceneStyle = 'Studio' | 'Inspect' | 'Print';

/** Display-only adapter. Physical placement is already baked into the artifact. */
export function createThreeDScene(host: HTMLElement) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor('#e8e4df');
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  host.appendChild(renderer.domElement);
  renderer.domElement.setAttribute(
    'aria-label',
    '3D source viewport. Drag to orbit, right-drag to pan, scroll to zoom.',
  );
  const scene = new THREE.Scene();
  const perspective = new THREE.PerspectiveCamera(35, 1, 0.01, 100000);
  const orthographic = new THREE.OrthographicCamera(-100, 100, 100, -100, 0.01, 100000);
  perspective.up.set(0, 0, 1);
  orthographic.up.set(0, 0, 1);
  let camera: THREE.PerspectiveCamera | THREE.OrthographicCamera = perspective;
  const controls = new OrbitControls<THREE.PerspectiveCamera | THREE.OrthographicCamera>(
    camera,
    renderer.domElement,
  );
  controls.enableDamping = false;
  const material = new THREE.MeshStandardMaterial({
    color: '#b78166',
    roughness: 0.78,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
  scene.add(mesh);
  material.polygonOffset = true;
  material.polygonOffsetFactor = 1;
  material.polygonOffsetUnits = 1;
  const sliceLines = new THREE.LineSegments(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ color: '#776d62', transparent: true, opacity: 0.35 }),
  );
  const selectedLines = new THREE.LineSegments(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ color: '#8b3216' }),
  );
  selectedLines.renderOrder = 2;
  scene.add(sliceLines, selectedLines);
  scene.add(new THREE.HemisphereLight('#fff8ef', '#77788b', 2.7));
  const light = new THREE.DirectionalLight('#ffffff', 3.2);
  light.position.set(-150, -200, 300);
  scene.add(light);
  const fill = new THREE.DirectionalLight('#dfebff', 1.5);
  fill.position.set(160, 120, 100);
  scene.add(fill);
  const grid = new THREE.GridHelper(220, 22, '#a89e92', '#cdc5bb');
  grid.rotation.x = Math.PI / 2;
  grid.position.z = -0.05;
  scene.add(grid);
  const box = new THREE.Box3Helper(
    new THREE.Box3(new THREE.Vector3(-110, -110, 0), new THREE.Vector3(110, 110, 250)),
    '#9b9288',
  );
  box.visible = false;
  scene.add(box);
  const center = new THREE.Vector3(0, 0, 50);
  let radius = 75,
    initialized = false,
    width = 1,
    height = 1,
    disposed = false;
  const draw = () => {
    if (!disposed) renderer.render(scene, camera);
  };
  const resize = () => {
    width = Math.max(1, host.clientWidth);
    height = Math.max(1, host.clientHeight);
    renderer.setSize(width, height);
    perspective.aspect = width / height;
    perspective.updateProjectionMatrix();
    const half = (radius * 1.35) / Math.min(1, width / height);
    orthographic.left = (-half * width) / height;
    orthographic.right = (half * width) / height;
    orthographic.top = half;
    orthographic.bottom = -half;
    orthographic.updateProjectionMatrix();
    draw();
  };
  const view = (name: ReferenceView) => {
    const direction =
      name === 'Fit'
        ? camera.position.clone().sub(controls.target).normalize()
        : new THREE.Vector3(
            ...((name === 'Front'
              ? [0, -1, 0]
              : name === 'Side'
                ? [1, 0, 0]
                : name === 'Top'
                  ? [0, -0.0001, 1]
                  : [1, -1.6, 1.1]) as [number, number, number]),
          ).normalize();
    if (!direction.lengthSq()) direction.set(1, -1.6, 1.1).normalize();
    const halfFov = Math.atan(
      Math.tan(THREE.MathUtils.degToRad(17.5)) * Math.min(1, width / height),
    );
    camera.position.copy(center).addScaledVector(direction, (radius / Math.sin(halfFov)) * 1.15);
    controls.target.copy(center);
    camera.lookAt(center);
    orthographic.zoom = 1;
    orthographic.updateProjectionMatrix();
    resize();
    controls.update();
    draw();
  };
  controls.addEventListener('change', draw);
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();
  const doubleClick = () => view('Fit');
  host.addEventListener('dblclick', doubleClick);
  return {
    setArtifact(artifact: ThreeDArtifact | null) {
      mesh.geometry.dispose();
      mesh.geometry = new THREE.BufferGeometry();
      mesh.visible = !!artifact;
      if (artifact) {
        mesh.geometry.setAttribute('position', new THREE.BufferAttribute(artifact.V, 3));
        mesh.geometry.setIndex(new THREE.BufferAttribute(artifact.T, 1));
        mesh.geometry.computeVertexNormals();
        mesh.geometry.computeBoundingSphere();
        const sphere = mesh.geometry.boundingSphere!;
        center.copy(sphere.center);
        radius = Math.max(0.1, sphere.radius);
        if (!initialized) {
          initialized = true;
          view('Isometric');
        }
      }
      draw();
    },
    slices(slices: ThreeDSlices | null) {
      for (const [object, positions] of [
        [sliceLines, slices?.positions],
        [selectedLines, slices?.selected],
      ] as const) {
        object.geometry.dispose();
        object.geometry = new THREE.BufferGeometry();
        if (positions)
          object.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        object.visible = !!positions?.length;
      }
      draw();
    },
    direction(): [number, number, number] {
      return camera.getWorldDirection(new THREE.Vector3()).toArray();
    },
    view,
    style(style: SceneStyle) {
      material.wireframe = style === 'Inspect';
      grid.visible = style === 'Print';
      box.visible = style === 'Print';
      renderer.setClearColor(style === 'Inspect' ? '#eceff0' : '#e8e4df');
      draw();
    },
    projection(ortho: boolean) {
      const next = ortho ? orthographic : perspective;
      next.position.copy(camera.position);
      next.quaternion.copy(camera.quaternion);
      camera = next;
      controls.object = camera;
      view('Fit');
    },
    dispose() {
      disposed = true;
      observer.disconnect();
      host.removeEventListener('dblclick', doubleClick);
      controls.removeEventListener('change', draw);
      controls.dispose();
      mesh.geometry.dispose();
      material.dispose();
      for (const lines of [sliceLines, selectedLines]) {
        lines.geometry.dispose();
        lines.material.dispose();
      }
      grid.geometry.dispose();
      (grid.material as THREE.Material).dispose();
      box.geometry.dispose();
      (box.material as THREE.Material).dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    },
  };
}
