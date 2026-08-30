import { describe, expect, it, vi } from 'vitest';
import {
  GrblStreamCancelledError,
  WebSerialGrblConnection,
  grblCommands,
  streamGrblProgram,
  type GrblTransport,
} from './grbl-serial';

function transport(responses: string[]): GrblTransport & { write: ReturnType<typeof vi.fn> } {
  return {
    write: vi.fn(async () => undefined),
    readLine: vi.fn(async () => responses.shift() || 'ok'),
  };
}

describe('GRBL serial streaming', () => {
  it('removes comments and blank lines while retaining source line numbers', () => {
    expect(grblCommands('; title\nG21 ; mm\n\nG90')).toEqual([
      { command: 'G21', sourceLine: 2 },
      { command: 'G90', sourceLine: 4 },
    ]);
  });

  it('waits for an acknowledgement before sending each command', async () => {
    const link = transport(['<Idle|MPos:0,0,0>', '[MSG:ready]', 'ok', 'ok']);
    const progress = vi.fn();

    await streamGrblProgram('G21\nG90', link, {
      signal: new AbortController().signal,
      onProgress: progress,
    });

    expect(link.write.mock.calls).toEqual([['G21\n'], ['G90\n']]);
    expect(progress).toHaveBeenLastCalledWith({
      command: 'G90',
      completed: 2,
      sourceLine: 2,
      total: 2,
    });
  });

  it('reports the source command when GRBL rejects it', async () => {
    const link = transport(['ok', 'error:20']);
    await expect(
      streamGrblProgram('; setup\nG21\nG90', link, {
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow('line 3 (G90): error:20');
  });

  it('waits for confirmation at M0 and sends GRBL cycle start before continuing', async () => {
    const link = transport(['ok', 'ok', 'ok']);
    const onProgramPause = vi.fn(async () => true);

    await streamGrblProgram('G21\nM0 ; change pen\nG90', link, {
      signal: new AbortController().signal,
      onProgramPause,
    });

    expect(onProgramPause).toHaveBeenCalledWith({ command: 'M0', sourceLine: 2 });
    expect(link.write.mock.calls).toEqual([['G21\n'], ['M0\n'], ['~'], ['G90\n']]);
  });

  it('cancels a job when an M0 pen change is declined', async () => {
    const link = transport(['ok']);
    await expect(
      streamGrblProgram('M0', link, {
        signal: new AbortController().signal,
        onProgramPause: () => false,
      }),
    ).rejects.toBeInstanceOf(GrblStreamCancelledError);
    expect(link.write.mock.calls).toEqual([['M0\n']]);
  });

  it('stops before writing when already cancelled', async () => {
    const controller = new AbortController();
    controller.abort();
    const link = transport([]);

    await expect(
      streamGrblProgram('G21', link, { signal: controller.signal }),
    ).rejects.toBeInstanceOf(GrblStreamCancelledError);
    expect(link.write).not.toHaveBeenCalled();
  });

  it('cancels while waiting for a controller acknowledgement', async () => {
    const controller = new AbortController();
    const link: GrblTransport = {
      write: vi.fn(async () => undefined),
      readLine: vi.fn(() => new Promise<string>(() => undefined)),
    };
    const streaming = streamGrblProgram('G1 X10', link, { signal: controller.signal });

    controller.abort();

    await expect(streaming).rejects.toBeInstanceOf(GrblStreamCancelledError);
  });

  it('drains GRBL wake-up acknowledgements before streaming the first command', async () => {
    let inbound!: ReadableStreamDefaultController<Uint8Array>;
    const sent: string[] = [];
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const readable = new ReadableStream<Uint8Array>({
      start(controller) {
        inbound = controller;
      },
    });
    const writable = new WritableStream<Uint8Array>({
      write(data) {
        const message = decoder.decode(data);
        sent.push(message);
        inbound.enqueue(
          encoder.encode(message === '\r\n\r\n' ? "Grbl 1.1h ['$' for help]\nok\n" : 'ok\n'),
        );
      },
    });
    const connection = new WebSerialGrblConnection(
      {
        requestPort: async () => ({
          readable,
          writable,
          open: async () => undefined,
          close: async () => undefined,
        }),
      },
      undefined,
      0,
    );

    await connection.connect();
    await streamGrblProgram('G21', connection, { signal: new AbortController().signal });
    await connection.disconnect();

    expect(sent).toEqual(['\r\n\r\n', 'G21\n']);
  });
});
