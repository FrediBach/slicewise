import { buildVolumeBounds } from './three-d-build-volume';
import { cleanGeneratedSolid, type SolidCleanup } from './generated-solid-cleanup';
import type { ManifoldToplevel } from 'manifold-3d';
import { ThreeDGeometryCache } from './three-d-cache';
import { createSolidKernel } from './solid-kernel';
import type { extractPlanarSlices } from './slice-geometry';
import { createRoundedTreatmentRecipe, RoundedToolBudgetError } from './slice-treatment';
import { PrintTopologyError } from './print-validation';
import { auditPrintManufacturing } from './print-manufacturing';
import {
  placeScaledThreeDSource,
  type ThreeDRequest,
  type ThreeDReply,
  type ThreeDPreparation,
} from './three-d-project';
import { threeDSliceField, threeDSliceOverlay } from './three-d-slices';

export function previewThreeD(request: ThreeDRequest, cache = new ThreeDGeometryCache()) {
  const { source, project, settings } = request;
  const base = cache.base(request);
  const artifact = placeScaledThreeDSource(base, project);
  const reply: ThreeDReply = {
    id: request.id,
    sourceVersion: source.version,
    artifact,
    sourceArtifact: artifact,
  };
  let geometry: ReturnType<typeof extractPlanarSlices> | null = null;
  try {
    geometry = cache.slices(base, threeDSliceField(base, settings, project), source.version);
    reply.slices = threeDSliceOverlay(geometry, project, artifact, settings.axis ?? 'up');
  } catch (error) {
    reply.slices = {
      positions: new Float32Array(),
      selected: new Float32Array(),
      count: 0,
      selectedCount: 0,
      runs: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
  return { base, reply, geometry };
}

/** Bounded experimental capsule workflow. Acceptance is explicitly not print readiness. */
export function prepareThreeD(
  request: ThreeDRequest,
  module: ManifoldToplevel,
  progress: (message: string) => void = () => {},
  cache = new ThreeDGeometryCache(),
): ThreeDReply {
  const { base, reply, geometry } = previewThreeD(request, cache);
  const cleanup: SolidCleanup[] = [];
  const kernel = createSolidKernel(
    module,
    (report) => cleanup.push(report),
    request.project.resultWeldToleranceMm ?? 0,
  );
  let approximation: ThreeDPreparation['approximation'] = null;
  try {
    if (!request.project.sizeConfirmed)
      throw new Error('Confirm the physical size before preparing.');
    if (request.project.treatment === 'off' || request.project.radiusMm === 0)
      throw new Error('Choose Inset or Emboss with a nonzero circular tool radius.');
    if (!geometry) throw new Error(reply.slices!.error);
    if (!reply.slices?.selectedCount) throw new Error('The selected slice range is empty.');
    progress('Checking the source…');
    kernel.run(base, [], 'off');
    progress('Constructing circular tools…');
    const recipe = createRoundedTreatmentRecipe(
      geometry,
      request.project.selection,
      request.project.radiusMm,
      request.project.profileToleranceMm ?? 0.05,
      request.project.pathToleranceMm,
    );
    approximation = recipe.approximation;
    if (!recipe.runs.length) throw new Error('The selected slices do not intersect the source.');
    const tools = kernel.createRoundedTools(recipe);
    progress('Applying treatment and checking the result…');
    const result = kernel.run(base, tools, request.project.treatment);
    const placed = placeScaledThreeDSource(result.mesh, request.project);
    const cleaned = cleanGeneratedSolid(placed, 'Placed result');
    if (
      cleaned.report.mergedVertices ||
      cleaned.report.removedFaces ||
      cleaned.report.removedUnusedVertices
    )
      cleanup.push(cleaned.report);
    const artifact = { ...placed, ...cleaned.mesh };
    progress('Checking the placed artifact and screening manufacturing advisories…');
    const screen = auditPrintManufacturing(artifact, {
      buildVolume: buildVolumeBounds(request.project.buildVolumeMm),
      bedToleranceMm: 0.05,
      overhangFromVerticalDeg: 45,
    });
    if (screen.status !== 'screened') {
      if (screen.geometry.status === 'invalid')
        throw new PrintTopologyError(screen.geometry, 'Placed result');
      throw new Error('Manufacturing measurements are unavailable for this result.');
    }
    reply.artifact = artifact;
    reply.slices = threeDSliceOverlay(
      geometry,
      request.project,
      artifact,
      request.settings.axis ?? 'up',
    );
    reply.preparation = {
      status: 'accepted',
      message: 'Experimental result · geometry audits completed; not print-ready',
      checks: screen.geometry.checks,
      issues: screen.geometry.issues.map(({ code, count }) => ({ code, count })),
      advisories: screen.advisories,
      bodyCount: screen.measurements!.bodyCount,
      volumeMm3: screen.geometry.signedVolumeMm3!,
      approximation,
      cleanup,
    };
  } catch (error) {
    if (error instanceof RoundedToolBudgetError) approximation = error.approximation;
    reply.preparation = {
      status: 'rejected',
      message: error instanceof Error ? error.message : String(error),
      approximation,
      cleanup,
      ...(error instanceof PrintTopologyError
        ? {
            checks: error.report.checks,
            issues: error.report.issues.map(({ code, count }) => ({ code, count })),
          }
        : {}),
    };
  }
  return reply;
}
