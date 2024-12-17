import { Observable } from 'rxjs';
import type { Command } from './command-type';

export type TuyaVersion = '3.1' | '3.2' | '3.3' | '3.4' | '3.5';

export interface ITuyaCipher {
  key: Buffer;
  encrypt(data: Buffer): Buffer;
  decrypt(data: Buffer): Buffer;
}

export interface EncodeOptions {
  data: Buffer | string | object;
  command: Command;
  sequenceN?: number;
}

export interface Options {
  ip: string;
  port?: number;
  id: string;
  gwId?: string;
  connectionTimeout?: number;
  key: string;
  version: TuyaVersion;
  responseTimeout?: number;
  heartBeatInterval?: number;
}

interface Events {
  connected: () => void;
  heartbeat: () => void;
  disconnected: () => void;
  error: (error: Error) => void;
  packet: (packet: Packet) => void;
}

export interface ITuyaLocal {
  readonly packet$: Observable<Packet>;
  readonly connected$: Observable<boolean>;
  readonly connected: boolean;
  connect(): Promise<void>;
  dps(): Promise<Record<string, unknown>>;
  disconnect(): void;
  sendWithResponse(
    command: Command,
    data: Buffer | string | object,
    options?: {
      responseCommand?: Command;
      timeout?: number;
    },
  ): Promise<Packet>;
  on<K extends keyof Events>(event: K, listener: Events[K]): this;
}

export interface IMessageParser {
  /**
   * Given a buffer potentially containing
   * multiple packets, this parses and returns
   * all of them.
   */
  decode(buffer: Buffer): Packet[];

  /**
   * Encodes a payload into a Tuya-protocol-compliant packet.
   */
  encode(options: EncodeOptions): Buffer;
}

export interface Packet {
  command: Command;
  sequenceN: number;
  payload: Buffer | unknown;
}
