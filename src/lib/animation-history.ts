import { ParameterHistory } from './parameter-history';
import { type AnimationProject } from './animation-project';

/** Creates animation-scoped undo/redo history with an initial detached project snapshot. */
export function createAnimationHistory(
  initialProject: AnimationProject,
  limit = 100,
): ParameterHistory<AnimationProject> {
  const history = new ParameterHistory<AnimationProject>({ limit });
  history.commit(initialProject);
  return history;
}
