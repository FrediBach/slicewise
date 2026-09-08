import {
  initialThreeDState,
  type ThreeDRequest,
  type ThreeDReply,
  type ThreeDUiState,
} from './three-d-project';

/** Coalesces edits, owns worker lifetime, and never displays replies from an old revision. */
export class ThreeDRuntime {
  #worker: Worker | null = null;
  #id = 0;
  #busy = false;
  #queued: ThreeDRequest | null = null;
  state: ThreeDUiState = { ...initialThreeDState };
  constructor(
    private publish: (state: ThreeDUiState) => void,
    private createWorker = () =>
      new Worker(new URL('./three-d-worker.ts', import.meta.url), { type: 'module' }),
  ) {}
  request(input: Omit<ThreeDRequest, 'id'>): void {
    const id = ++this.#id;
    this.state = {
      active: true,
      source: { id: input.source.id, name: input.source.name, imported: input.source.imported },
      project: structuredClone(input.project),
      status: 'pending',
      message: 'Updating shaped source…',
      artifact: null,
    };
    this.publish(this.state);
    if (!this.#worker) {
      const worker = this.createWorker();
      this.#worker = worker;
      worker.addEventListener('message', (event: MessageEvent<ThreeDReply>) => {
        if (worker !== this.#worker) return;
        this.#busy = false;
        const reply = event.data;
        if (reply.id === this.#id && reply.sourceVersion === this.#sourceVersion) {
          this.state = {
            ...this.state,
            status: reply.artifact ? 'ready' : 'error',
            artifact: reply.artifact ?? null,
            message:
              reply.error ?? 'Untreated source · solid and manufacturing checks have not run',
          };
          this.publish(this.state);
        }
        this.#dispatch();
      });
      worker.addEventListener('error', () => {
        if (worker !== this.#worker) return;
        worker.terminate();
        this.#worker = null;
        this.#busy = false;
        this.#queued = null;
        this.state = {
          ...this.state,
          status: 'error',
          artifact: null,
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
  stop(): void {
    this.#id++;
    this.#worker?.terminate();
    this.#worker = null;
    this.#busy = false;
    this.#queued = null;
    this.state = { ...initialThreeDState };
    this.publish(this.state);
  }
}
