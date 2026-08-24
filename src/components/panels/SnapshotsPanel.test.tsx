// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ParameterSnapshot } from '../../lib/parameter-snapshots';
import { SnapshotsPanel } from './SnapshotsPanel';

const storage = vi.hoisted(() => ({
  list: vi.fn(),
  save: vi.fn(),
  remove: vi.fn(),
}));

vi.mock('../../lib/parameter-snapshots', () => ({
  listParameterSnapshots: storage.list,
  saveParameterSnapshot: storage.save,
  deleteParameterSnapshot: storage.remove,
}));

const storedSnapshot = {
  id: 'saved-1',
  name: 'Fine topography',
  createdAt: '2026-08-24T10:30:00.000Z',
  parameters: { morphEnabled: true, morphTargets: { zoom: 1.4 } },
  randomLocks: ['zoom', 'color'],
} as unknown as ParameterSnapshot;

describe('SnapshotsPanel', () => {
  beforeEach(() => {
    storage.list.mockReset().mockResolvedValue([storedSnapshot]);
    storage.save.mockReset().mockResolvedValue(undefined);
    storage.remove.mockReset().mockResolvedValue(undefined);
  });

  it('lists dated snapshots and restores their parameters and locks', async () => {
    const restored = vi.fn();
    document.addEventListener('applyparametersnapshot', restored);
    render(<SnapshotsPanel />);

    expect(await screen.findByText('Fine topography')).toBeInTheDocument();
    expect(screen.getByText(/2026/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Restore Fine topography' }));

    expect(restored).toHaveBeenCalledOnce();
    expect((restored.mock.calls[0][0] as CustomEvent).detail).toEqual({
      parameters: storedSnapshot.parameters,
      randomLocks: ['zoom', 'color'],
      name: 'Fine topography',
    });
    document.removeEventListener('applyparametersnapshot', restored);
  });

  it('captures a trimmed named snapshot and can delete a stored one', async () => {
    const capture = (event: Event) => {
      (event as CustomEvent).detail.snapshot = {
        parameters: storedSnapshot.parameters,
        randomLocks: storedSnapshot.randomLocks,
      };
    };
    document.addEventListener('captureparametersnapshot', capture);
    render(<SnapshotsPanel />);
    await screen.findByText('Fine topography');

    const name = screen.getByLabelText('Snapshot name');
    fireEvent.change(name, { target: { value: '  Alternate view  ' } });
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(storage.save).toHaveBeenCalledOnce());
    expect(storage.save.mock.calls[0][0]).toMatchObject({
      name: 'Alternate view',
      parameters: storedSnapshot.parameters,
      randomLocks: storedSnapshot.randomLocks,
    });
    expect(storage.save.mock.calls[0][0].createdAt).toEqual(expect.any(String));

    await userEvent.click(screen.getByRole('button', { name: 'Delete Fine topography' }));
    await waitFor(() => expect(storage.remove).toHaveBeenCalledWith('saved-1'));
    document.removeEventListener('captureparametersnapshot', capture);
  });
});
