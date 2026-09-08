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
  project.rotation = [0, 0, 0];
  publish();
  expect(rotation).toHaveValue(0);
  expect(screen.getByRole('button', { name: '3D export unavailable' })).toBeDisabled();
  unmount();
  document.removeEventListener('threedprojectchange', commands);
});
