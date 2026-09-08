// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { ThreeDWorkspace } from './ThreeDWorkspace';
import {
  createThreeDProject,
  initialThreeDState,
  type ThreeDUiState,
} from '../../lib/three-d-project';
const scene = vi.hoisted(() => ({
  setArtifact: vi.fn(),
  buildVolume: vi.fn(),
  slices: vi.fn(),
  style: vi.fn(),
  dispose: vi.fn(),
  view: vi.fn(),
  projection: vi.fn(),
  direction: vi.fn(() => [0, 0, 1]),
}));
vi.mock('../../lib/three-d-scene', () => ({ createThreeDScene: () => scene }));
const artifact = () => ({
  V: Float32Array.from([0, 0, 0]),
  T: Uint32Array.from([0, 0, 0]),
  min: [0, 0, 0] as [number, number, number],
  max: [1, 1, 1] as [number, number, number],
  dimensions: [1, 1, 1] as [number, number, number],
});
const state = (): ThreeDUiState => ({
  ...initialThreeDState,
  active: true,
  status: 'ready',
  source: { id: 'box', name: 'Box', imported: false },
  project: createThreeDProject('box'),
  artifact: artifact(),
  slices: {
    fieldKey: 'height',
    positions: Float32Array.from([0, 0, 0, 1, 1, 1]),
    selected: new Float32Array(),
    count: 1,
    selectedCount: 1,
    runs: 1,
  },
});
const publish = (value: ThreeDUiState) =>
  act(() => {
    document.dispatchEvent(new CustomEvent('threedstatechange', { detail: value }));
  });
it('shows new field contours after slices were hidden, while preserving the choice for placement changes', async () => {
  const value = state();
  render(<ThreeDWorkspace />);
  publish(value);
  await waitFor(() => expect(scene.slices).toHaveBeenCalledWith(value.slices));
  fireEvent.click(screen.getByRole('button', { name: 'Hide slices' }));
  expect(scene.slices).toHaveBeenLastCalledWith(null);
  expect(screen.getByText(/Contours hidden/)).toBeInTheDocument();
  publish({ ...value, artifact: artifact() });
  expect(screen.getByRole('button', { name: 'Show slices' })).toBeInTheDocument();
  const changed = { ...value, slices: { ...value.slices!, fieldKey: 'width' } };
  publish(changed);
  expect(screen.getByRole('button', { name: 'Hide slices' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(scene.slices).toHaveBeenLastCalledWith(changed.slices);
  publish(value);
  expect(screen.getByRole('button', { name: 'Hide slices' })).toBeInTheDocument();
});
it('does not carry source comparison into a newly prepared result', async () => {
  const value = {
    ...state(),
    sourceArtifact: artifact(),
    preparation: { status: 'accepted' as const, message: 'Prepared' },
  };
  render(<ThreeDWorkspace />);
  publish(value);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Fit' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Compare source' }));
  expect(scene.slices).toHaveBeenLastCalledWith(null);
  const changed = { ...value, artifact: artifact() };
  publish(changed);
  expect(scene.setArtifact).toHaveBeenLastCalledWith(changed.artifact);
  expect(scene.slices).toHaveBeenLastCalledWith(changed.slices);
  expect(screen.getByRole('button', { name: 'Compare source' })).toBeInTheDocument();
});
it('discloses slice extraction failure directly in the viewport', () => {
  render(<ThreeDWorkspace />);
  const value = state();
  publish({ ...value, slices: { ...value.slices!, error: 'A slice overlaps a source face.' } });
  expect(
    screen.getByText('Contours unavailable: A slice overlaps a source face.'),
  ).toBeInTheDocument();
});

it('updates the print volume and outside warning without changing the object', async () => {
  const value = state();
  value.artifact!.max = [60, 20, 40];
  render(<ThreeDWorkspace />);
  publish(value);
  await waitFor(() => expect(scene.buildVolume).toHaveBeenCalledWith([220, 220, 250]));
  expect(screen.queryByText(/Outside build volume/)).not.toBeInTheDocument();
  publish({ ...value, project: { ...value.project!, buildVolumeMm: [100, 50, 80] } });
  expect(scene.buildVolume).toHaveBeenLastCalledWith([100, 50, 80]);
  expect(screen.getByText(/Outside build volume/)).toBeInTheDocument();
  expect(scene.setArtifact).toHaveBeenLastCalledWith(value.artifact);
});
