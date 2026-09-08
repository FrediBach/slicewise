import { ThreeDSurfacePanel } from './ThreeDSurfacePanel';
// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { ThreeDPanel } from './ThreeDWorkspace';
import { createThreeDProject, initialThreeDState } from '../../lib/three-d-project';
it('keeps signed numeric drafts editable, restores invalid drafts, and follows external undo', async () => {
  const user = userEvent.setup();
  const commands = vi.fn();
  document.addEventListener('threedprojectchange', commands);
  const { unmount } = render(<ThreeDPanel />);
  const project = createThreeDProject('test');
  const publish = () =>
    act(() => {
      document.dispatchEvent(
        new CustomEvent('threedstatechange', {
          detail: {
            ...initialThreeDState,
            active: true,
            project,
            source: { id: 'test', name: 'Test', imported: false },
          },
        }),
      );
    });
  publish();
  const rotation = screen.getByRole('spinbutton', { name: 'Print rotation X' });
  await user.clear(rotation);
  expect(commands).not.toHaveBeenCalled();
  await user.type(rotation, '-45');
  expect(commands.mock.lastCall![0].detail.rotation).toEqual([-45, 0, 0]);
  project.rotation = [-45, 0, 0];
  publish();
  fireEvent.change(rotation, { target: { value: '-999' } });
  fireEvent.blur(rotation);
  expect(rotation).toHaveValue(-45);
  fireEvent.change(screen.getByRole('combobox', { name: 'Result vertex cleanup' }), {
    target: { value: '0' },
  });
  expect(commands.mock.lastCall![0].detail.resultWeldToleranceMm).toBe(0);
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Nominal width (mm)' }), {
    target: { value: '2.4' },
  });
  expect(commands.mock.lastCall![0].detail.radiusMm).toBe(1.2);
  project.radiusMm = 1.2;
  project.treatment = 'inset';
  publish();
  expect(screen.getByRole('spinbutton', { name: 'Circular tool radius (mm)' })).toHaveValue(1.2);
  expect(
    screen.getByRole('img', { name: /nominal width 2.4 mm, depth 1.2 mm/ }),
  ).toBeInTheDocument();
  project.treatment = 'emboss';
  publish();
  expect(
    screen.getByRole('img', { name: /nominal width 2.4 mm, height 1.2 mm/ }),
  ).toBeInTheDocument();
  fireEvent.change(screen.getByRole('combobox', { name: 'Profile precision' }), {
    target: { value: '0.02' },
  });
  expect(commands.mock.lastCall![0].detail.profileToleranceMm).toBe(0.02);
  project.radiusMm = 0.6;
  project.profileToleranceMm = 0.05;
  publish();
  expect(screen.getByRole('spinbutton', { name: 'Nominal width (mm)' })).toHaveValue(1.2);
  expect(screen.getByRole('combobox', { name: 'Profile precision' })).toHaveValue('0.05');
  project.rotation = [0, 0, 0];
  publish();
  expect(rotation).toHaveValue(0);
  expect(screen.getByRole('button', { name: '3D export unavailable' })).toBeDisabled();
  unmount();
  document.removeEventListener('threedprojectchange', commands);
});

it('gates preparation on current slices and size and exposes cancellation without enabling export', () => {
  const prepare = vi.fn(),
    cancel = vi.fn();
  document.addEventListener('threedprepare', prepare);
  document.addEventListener('threedcancel', cancel);
  const { unmount } = render(<ThreeDPanel />);
  const project = { ...createThreeDProject('test'), treatment: 'inset' as const };
  const state = {
    ...initialThreeDState,
    active: true,
    status: 'ready' as const,
    project,
    source: { id: 'test', name: 'Test', imported: false },
    slices: {
      positions: new Float32Array(),
      selected: new Float32Array(),
      count: 3,
      selectedCount: 3,
      runs: 3,
    },
    preparation: { status: 'idle' as 'idle' | 'pending', message: 'Source preview' },
  };
  const publish = () =>
    act(() => {
      document.dispatchEvent(new CustomEvent('threedstatechange', { detail: { ...state } }));
    });
  publish();
  expect(screen.getByRole('button', { name: 'Prepare treatment' })).toBeDisabled();
  project.sizeConfirmed = true;
  publish();
  fireEvent.click(screen.getByRole('button', { name: 'Prepare treatment' }));
  expect(prepare).toHaveBeenCalledTimes(1);
  state.preparation = { status: 'pending', message: 'Constructing tools…' };
  publish();
  expect(screen.getByRole('button', { name: 'Prepare treatment' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: '3D export unavailable' })).toBeDisabled();
  unmount();
  document.removeEventListener('threedprepare', prepare);
  document.removeEventListener('threedcancel', cancel);
});

it.each(['accepted', 'rejected'] as const)(
  'discloses exact cleanup for a %s preparation',
  (status) => {
    const project = createThreeDProject('test');
    render(
      <ThreeDSurfacePanel
        project={project}
        state={{
          ...initialThreeDState,
          project,
          preparation: {
            status,
            message: 'Audit finished',
            cleanup: [
              {
                stage: 'Result',
                mergedVertices: 8,
                removedFaces: 16,
                removedUnusedVertices: 0,
                toleranceMm: 0.00001,
                maximumDisplacementMm: 0.000003814697265625,
              },
            ],
          },
        }}
      />,
    );
    expect(screen.getByText('Generated mesh cleanup')).toBeInTheDocument();
    expect(
      screen.getByText('Generated geometry only. Vertex movement is reported for each stage.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Result: 8 vertices merged, 16 zero-area faces removed/),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '3D export unavailable' })).toBeDisabled();
  },
);
