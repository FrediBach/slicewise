// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { SavedStatesPanel } from './SavedStatesPanel';

vi.mock('../../lib/presets/library', async (original) => ({
  ...(await original<typeof import('../../lib/presets/library')>()),
  rememberedPresetFolder: async () => null,
  listExamplePresets: async () => [],
}));
vi.mock('../../lib/parameter-snapshots', async (original) => ({
  ...(await original<typeof import('../../lib/parameter-snapshots')>()),
  listParameterSnapshots: async () => [],
}));

it('combines both tools in one collapsible with keyboard tabs and persistent drafts', async () => {
  const { container } = render(<SavedStatesPanel />);
  expect(container.querySelectorAll('details')).toHaveLength(1);
  const section = container.querySelector('details')!;
  expect(section.open).toBe(false);
  fireEvent.click(screen.getByText('Presets & snapshots'));
  expect(section.open).toBe(true);
  expect(screen.getByRole('tabpanel', { name: 'Presets' })).toBeVisible();
  expect(screen.getByText('Complete workspaces, saved as local files.')).toBeVisible();
  fireEvent.change(screen.getByLabelText('Preset name'), {
    target: { value: 'Unfinished preset' },
  });

  fireEvent.keyDown(screen.getByRole('tab', { name: 'Presets' }), { key: 'ArrowRight' });
  expect(screen.getByRole('tab', { name: 'Snapshots' })).toHaveFocus();
  expect(screen.getByRole('tabpanel', { name: 'Snapshots' })).toBeVisible();
  expect(screen.getByText('Quick drawing states, saved in this browser.')).toBeVisible();
  expect(screen.queryByRole('textbox', { name: 'Preset name' })).not.toBeInTheDocument();
  await waitFor(() => expect(screen.getByText('No saved snapshots yet.')).toBeVisible());
  fireEvent.change(screen.getByLabelText('Snapshot name'), {
    target: { value: 'Unfinished snapshot' },
  });

  fireEvent.keyDown(screen.getByRole('tab', { name: 'Snapshots' }), { key: 'Home' });
  expect(screen.getByRole('tab', { name: 'Presets' })).toHaveFocus();
  expect(screen.getByLabelText('Preset name')).toHaveValue('Unfinished preset');
  fireEvent.click(screen.getByRole('tab', { name: 'Snapshots' }));
  expect(screen.getByLabelText('Snapshot name')).toHaveValue('Unfinished snapshot');
  fireEvent.click(screen.getByText('Presets & snapshots'));
  expect(section.open).toBe(false);
});
