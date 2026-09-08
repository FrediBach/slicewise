import { hasExportableGeometry } from './three-d-export';
import {
  initialThreeDState,
  type ThreeDRequest,
  type ThreeDReply,
  type ThreeDUiState,
} from './three-d-project';

/** Coalesces edits, owns worker lifetime, and never displays replies from an old revision. */
export class ThreeDRuntime {
  #worker: Worker | null = null;
  #stl: ArrayBuffer | null = null;
  #id = 0;
  #signature = '';

  #busy = false;
  #input: Omit<ThreeDRequest, 'id'> | null = null;
  #preparing = false;
  #queued: ThreeDRequest | null = null;
  state: ThreeDUiState = { ...initialThreeDState };
  constructor(
    private publish: (state: ThreeDUiState) => void,
    private createWorker = () =>
      new Worker(new URL('./three-d-worker.ts', import.meta.url), { type: 'module' }),
  ) {}
  request(input: Omit<ThreeDRequest, 'id'>): void {
    const signature = JSON.stringify([
      input.source.id,
      input.source.version,
      input.project,
      input.settings,
    ]);
    // Blur/resize may request the same geometry again. They must not invalidate
    // a prepared artifact or restart an identical pending job.
    if (
      input.purpose !== 'prepare' &&
      signature === this.#signature &&
      this.state.status !== 'error'
    )
      return;
    this.#stl = null;
    this.#signature = signature;
    if (this.#preparing) this.#terminate();
    this.#input = input;
    const preparing = input.purpose === 'prepare';
    this.#preparing = preparing;
    const previous = this.state;
    const id = ++this.#id;
    this.state = {
      active: true,
      source: { id: input.source.id, name: input.source.name, imported: input.source.imported },
      project: structuredClone(input.project),
      status: 'pending',
      message: preparing
        ? 'Preparing treatment · untreated source shown'
        : 'Updating shaped source…',
      artifact: preparing ? (previous.sourceArtifact ?? previous.artifact) : null,
      sourceArtifact: preparing ? (previous.sourceArtifact ?? previous.artifact) : null,
      slices: preparing ? previous.slices : null,
      preparation: {
        status: preparing ? 'pending' : 'idle',
        message: preparing
          ? 'Starting preparation…'
          : 'Settings changed · prepare to see the treatment',
      },
    };
    this.publish(this.state);
    if (!this.#worker) {
      const worker = this.createWorker();
      this.#worker = worker;
      worker.addEventListener('message', (event: MessageEvent<ThreeDReply>) => {
        if (worker !== this.#worker) return;
        const reply = event.data;
        if (reply.progress) {
          if (reply.id === this.#id && reply.sourceVersion === this.#sourceVersion) {
            this.state = {
              ...this.state,
              preparation: { status: 'pending', message: reply.progress },
            };
            this.publish(this.state);
          }
          return;
        }
        this.#busy = false;
        if (reply.id === this.#id && reply.sourceVersion === this.#sourceVersion) {
          this.#stl =
            this.#preparing && reply.stl && hasExportableGeometry(reply) ? reply.stl : null;
          this.#preparing = false;
          this.state = {
            ...this.state,
            exportAvailable: !!this.#stl,
            status: reply.artifact || this.state.sourceArtifact ? 'ready' : 'error',
            artifact: reply.artifact ?? this.state.sourceArtifact ?? null,
            sourceArtifact:
              reply.sourceArtifact ?? reply.artifact ?? this.state.sourceArtifact ?? null,
            slices: reply.slices ?? this.state.slices,
            preparation:
              reply.preparation ??
              (reply.error
                ? { status: 'rejected', message: reply.error }
                : { status: 'idle', message: 'Untreated source · choose a treatment and prepare' }),
            message:
              reply.error ??
              (reply.preparation?.status === 'accepted'
                ? reply.preparation.message
                : 'Untreated source · no current prepared result'),
          };
          this.publish(this.state);
        }
        this.#dispatch();
      });
      worker.addEventListener('error', () => {
        if (worker !== this.#worker) return;
        this.#stl = null;
        worker.terminate();
        this.#worker = null;
        this.#busy = false;
        this.#queued = null;
        this.#preparing = false;
        this.state = {
          ...this.state,
          exportAvailable: false,
          status: this.state.sourceArtifact ? 'ready' : 'error',
          artifact: this.state.sourceArtifact ?? null,
          preparation: { status: 'rejected', message: 'Worker stopped. Prepare again to retry.' },
          message: 'The 3D worker stopped. Change a setting or re-enter 3D to retry.',
        };
        this.publish(this.state);
      });
    }
    this.#sourceVersion = input.source.version;
    this.#queued = { ...input, id };
    this.#dispatch();
  }
  #sourceVersion = 0;
  #dispatch(): void {
    if (this.#busy || !this.#queued || !this.#worker) return;
    const request = this.#queued;
    this.#queued = null;
    const mesh = request.source.mesh;
    const V = Float32Array.from(mesh.V),
      T = Uint32Array.from(mesh.T),
      N = Float32Array.from(mesh.N ?? []);
    this.#busy = true;
    this.#worker.postMessage(
      { ...request, source: { ...request.source, mesh: { ...mesh, V, T, N } } },
      [V.buffer, T.buffer, N.buffer],
    );
  }
  prepare(): void {
    if (
      !this.#input ||
      this.#busy ||
      !this.state.artifact ||
      this.state.slices?.error ||
      !this.#input.project.sizeConfirmed ||
      this.#input.project.treatment === 'off' ||
      this.#input.project.radiusMm === 0
    )
      return;
    this.request({ ...this.#input, purpose: 'prepare' });
  }
  cancel(): void {
    if (!this.#preparing) return;
    this.#id++;
    this.#terminate();
    this.state = {
      ...this.state,
      status: 'ready',
      artifact: this.state.sourceArtifact ?? null,
      exportAvailable: false,
      message: 'Untreated source · preparation cancelled',
      preparation: { status: 'cancelled', message: 'Cancelled. You can prepare again.' },
    };
    this.publish(this.state);
  }
  exportStl(): ArrayBuffer | null {
    return this.state.active &&
      this.state.status === 'ready' &&
      this.state.preparation?.status === 'accepted'
      ? (this.#stl?.slice(0) ?? null)
      : null;
  }
  #terminate(): void {
    this.#stl = null;
    this.#preparing = false;
    this.#worker?.terminate();
    this.#worker = null;
    this.#busy = false;
    this.#queued = null;
  }
  stop(): void {
    this.#id++;
    this.#terminate();
    this.#input = null;
    this.#signature = '';
    this.state = { ...initialThreeDState };
    this.publish(this.state);
  }
}
