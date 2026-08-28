export interface ParameterHistoryStatus {
  size: number;
  index: number;
  canUndo: boolean;
  canRedo: boolean;
}

export interface ParameterHistoryOptions<T> {
  limit?: number;
  clone?: (value: T) => T;
  equals?: (left: T, right: T) => boolean;
}

/** A bounded, branch-aware timeline independent of DOM restoration. */
export class ParameterHistory<T> {
  readonly #limit: number;
  readonly #clone: (value: T) => T;
  readonly #equals: (left: T, right: T) => boolean;
  readonly #entries: T[] = [];
  #index = -1;

  constructor(options: ParameterHistoryOptions<T> = {}) {
    this.#limit = Math.max(1, Math.floor(options.limit ?? 100));
    // Keep the platform function call bound through globalThis. Some browsers
    // reject a detached structuredClone reference with "Illegal invocation".
    this.#clone = options.clone ?? ((value) => globalThis.structuredClone(value));
    this.#equals =
      options.equals ?? ((left, right) => JSON.stringify(left) === JSON.stringify(right));
  }

  get status(): ParameterHistoryStatus {
    return {
      size: this.#entries.length,
      index: this.#index,
      canUndo: this.#index > 0,
      canRedo: this.#index >= 0 && this.#index < this.#entries.length - 1,
    };
  }

  /** Commit a detached snapshot, discarding any redo branch. */
  commit(value: T): boolean {
    const snapshot = this.#clone(value);
    if (this.#index >= 0 && this.#equals(this.#entries[this.#index], snapshot)) return false;

    this.#entries.splice(this.#index + 1);
    this.#entries.push(snapshot);
    if (this.#entries.length > this.#limit) this.#entries.shift();
    this.#index = this.#entries.length - 1;
    return true;
  }

  /** Move by an offset and return a detached destination snapshot. */
  move(offset: number): T | null {
    if (!this.#entries.length) return null;
    const next = Math.max(0, Math.min(this.#entries.length - 1, this.#index + offset));
    if (next === this.#index) return null;
    this.#index = next;
    return this.#clone(this.#entries[this.#index]);
  }
}
