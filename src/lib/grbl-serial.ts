export type GrblStreamProgress = {
  completed: number;
  total: number;
  sourceLine: number;
  command: string;
};

export class GrblStreamCancelledError extends Error {
  constructor() {
    super('G-code streaming was stopped. GRBL is in feed hold; the pen may still be down.');
    this.name = 'GrblStreamCancelledError';
  }
}

export type GrblCommand = { command: string; sourceLine: number };

export function grblCommands(program: string): GrblCommand[] {
  return program.split(/\r?\n/).flatMap((source, index) => {
    const command = source.split(';', 1)[0].trim();
    return command ? [{ command, sourceLine: index + 1 }] : [];
  });
}

export interface GrblTransport {
  readLine(): Promise<string>;
  write(data: string): Promise<void>;
}

async function readWithAbort(transport: GrblTransport, signal: AbortSignal): Promise<string> {
  if (signal.aborted) throw new GrblStreamCancelledError();
  let rejectAbort: (() => void) | undefined;
  const cancelled = new Promise<never>((_, reject) => {
    rejectAbort = () => reject(new GrblStreamCancelledError());
    signal.addEventListener('abort', rejectAbort, { once: true });
  });
  try {
    return await Promise.race([transport.readLine(), cancelled]);
  } finally {
    if (rejectAbort) signal.removeEventListener('abort', rejectAbort);
  }
}

/** Stream conservatively: one command is sent only after GRBL acknowledges the previous one. */
export async function streamGrblProgram(
  program: string,
  transport: GrblTransport,
  options: {
    signal: AbortSignal;
    onProgress?: (progress: GrblStreamProgress) => void;
    onProgramPause?: (command: GrblCommand) => boolean | Promise<boolean>;
  },
): Promise<void> {
  const commands = grblCommands(program);

  for (let index = 0; index < commands.length; index++) {
    if (options.signal.aborted) throw new GrblStreamCancelledError();
    const item = commands[index];
    await transport.write(`${item.command}\n`);

    while (true) {
      const response = (await readWithAbort(transport, options.signal)).trim();
      if (/^ok\b/i.test(response)) break;
      if (/^(?:error:|alarm:)/i.test(response))
        throw new Error(
          `GRBL rejected G-code line ${item.sourceLine} (${item.command}): ${response}`,
        );
      // Startup banners, status reports, and bracketed feedback are informational.
    }

    if (/^M0(?:\s|$)/i.test(item.command)) {
      if (!options.onProgramPause)
        throw new Error('GRBL entered an M0 program pause, but no resume handler is available.');
      if (!(await options.onProgramPause(item))) throw new GrblStreamCancelledError();
      if (options.signal.aborted) throw new GrblStreamCancelledError();
      await transport.write('~');
    }

    options.onProgress?.({
      completed: index + 1,
      total: commands.length,
      sourceLine: item.sourceLine,
      command: item.command,
    });
  }
}

type SerialPortLike = {
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
  open(options: { baudRate: number; bufferSize?: number }): Promise<void>;
  close(): Promise<void>;
};

type SerialProviderLike = {
  requestPort(): Promise<SerialPortLike>;
};

type LineWaiter = { resolve: (line: string) => void; reject: (error: Error) => void };

export class WebSerialGrblConnection implements GrblTransport {
  private port: SerialPortLike | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private lines: string[] = [];
  private waiters: LineWaiter[] = [];
  private readTask: Promise<void> | null = null;
  private encoder = new TextEncoder();
  private closing = false;
  private online = false;

  constructor(
    private serial: SerialProviderLike,
    private onUnexpectedDisconnect?: (error?: Error) => void,
    private startupDelayMs = 2000,
  ) {}

  get connected(): boolean {
    return this.online;
  }

  async connect(): Promise<void> {
    if (this.connected) return;
    const port = await this.serial.requestPort();
    await port.open({ baudRate: 115200, bufferSize: 4096 });
    if (!port.readable || !port.writable) {
      await port.close();
      throw new Error('The selected serial port did not expose readable and writable streams.');
    }
    this.port = port;
    this.reader = port.readable.getReader();
    this.writer = port.writable.getWriter();
    this.closing = false;
    this.online = true;
    this.readTask = this.readLoop();
    try {
      // Opening common USB serial adapters resets GRBL. Give its bootloader time to emit the
      // welcome banner, then discard that banner and the `ok` replies produced by wake-up lines so
      // they can never be mistaken for acknowledgements to the actual program.
      await this.write('\r\n\r\n');
      await new Promise((resolve) => setTimeout(resolve, this.startupDelayMs));
      if (!this.online) throw new Error('The plotter disconnected during GRBL startup.');
      this.lines = [];
    } catch (error) {
      try {
        await this.disconnect();
      } catch {
        // Preserve the startup error while still attempting to release the port.
      }
      throw error;
    }
  }

  async write(data: string): Promise<void> {
    if (!this.writer) throw new Error('Connect the plotter before sending G-code.');
    await this.writer.write(this.encoder.encode(data));
  }

  async hold(): Promise<void> {
    if (this.writer) await this.writer.write(Uint8Array.of('!'.charCodeAt(0)));
  }

  readLine(): Promise<string> {
    const line = this.lines.shift();
    if (line !== undefined) return Promise.resolve(line);
    if (!this.reader) return Promise.reject(new Error('The serial connection is closed.'));
    return new Promise((resolve, reject) => this.waiters.push({ resolve, reject }));
  }

  async disconnect(): Promise<void> {
    if (!this.port) return;
    this.closing = true;
    this.online = false;
    const port = this.port;
    this.rejectWaiters(new Error('The serial connection was closed.'));
    try {
      await this.reader?.cancel();
      await this.readTask;
    } finally {
      this.reader?.releaseLock();
      this.writer?.releaseLock();
      this.reader = null;
      this.writer = null;
      this.readTask = null;
      this.port = null;
      this.lines = [];
      await port.close();
    }
  }

  private acceptLine(line: string): void {
    const waiter = this.waiters.shift();
    if (waiter) waiter.resolve(line);
    else this.lines.push(line);
  }

  private rejectWaiters(error: Error): void {
    for (const waiter of this.waiters.splice(0)) waiter.reject(error);
  }

  private async readLoop(): Promise<void> {
    const decoder = new TextDecoder();
    let pending = '';
    let failure: Error | undefined;
    try {
      while (this.reader) {
        const { value, done } = await this.reader.read();
        if (done) break;
        pending += decoder.decode(value, { stream: true });
        const parts = pending.split(/\r?\n/);
        pending = parts.pop() || '';
        for (const line of parts) if (line.trim()) this.acceptLine(line);
      }
      pending += decoder.decode();
      if (pending.trim()) this.acceptLine(pending);
    } catch (error) {
      failure = error instanceof Error ? error : new Error(String(error));
    }
    if (!this.closing) {
      this.online = false;
      const error = failure || new Error('The plotter disconnected.');
      this.rejectWaiters(error);
      this.onUnexpectedDisconnect?.(error);
    }
  }
}

export function webSerialProvider(): SerialProviderLike | null {
  const serial = (navigator as Navigator & { serial?: SerialProviderLike }).serial;
  return serial || null;
}
