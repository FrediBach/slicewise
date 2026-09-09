import type { RawMesh } from './app-state';
import {
  radialColumnDemo,
  radishDemo,
  roundedDemo,
  ringTorus,
  sphereDemo,
  tetrapodDemo,
  torusKnot,
} from './demo-meshes';
type DemoDefinition = { name: string; create: () => RawMesh };
export const BUILTIN_SOURCES: Record<string, DemoDefinition> = {
  knot: { name: 'demo · torus knot', create: () => torusKnot() },
  ripple: { name: 'demo · ripple sphere', create: () => sphereDemo('ripple') },
  cube: { name: 'demo · rounded cube', create: () => sphereDemo('cube') },
  pyramid: { name: 'demo · rounded pyramid', create: () => roundedDemo('pyramid') },
  'twin-balls': { name: 'demo · twin balls', create: () => roundedDemo('twin-balls') },
  pebble: { name: 'demo · pebble', create: () => roundedDemo('pebble') },
  'rounded-cylinder': {
    name: 'demo · rounded cylinder',
    create: () => roundedDemo('rounded-cylinder'),
  },
  diamond: { name: 'demo · soft diamond', create: () => sphereDemo('diamond') },
  torus: { name: 'demo · ring torus', create: () => ringTorus() },
  twist: { name: 'demo · twisted bloom', create: () => radialColumnDemo('twist') },
  hourglass: { name: 'demo · hourglass', create: () => radialColumnDemo('hourglass') },
  tetrapod: { name: 'demo · tetrapod', create: () => tetrapodDemo() },
  radish: { name: 'demo · radish', create: () => radishDemo() },
};
