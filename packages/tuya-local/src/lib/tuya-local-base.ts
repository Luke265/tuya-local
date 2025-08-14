import EventEmitter from 'node:events';
import net from 'node:net';
import { Command } from './command-type.js';
import { Deferred, deferred } from './util.js';
import {
  exhaustMap,
  filter,
  firstValueFrom,
  interval,
  Subject,
  Subscription,
  take,
  throwError,
  timeout,
} from 'rxjs';
import {
  IMessageParser,
  ITuyaCipher,
  ITuyaLocal,
  Options,
  Packet,
} from './types.js';
import { debug } from './debug.js';

export interface RefreshOptions {}

export abstract class TuyaLocalBase extends EventEmitter implements ITuyaLocal {
  private connectDeferred: Deferred<void> | null = null;
  private hearBeatSub: Subscription | null = null;
  private _connected = false;
  public get connected() {
    return this._connected;
  }
  private set connected(value: boolean) {
    this._connected = value;
    this._connected$.next(value);
  }
  protected client: net.Socket | null = null;
  protected abstract parser: IMessageParser;
  protected abstract cipher: ITuyaCipher;
  protected currentSequenceN = 0;
  protected readonly options: Options;
  private readonly _packet$ = new Subject<Packet>();
  public readonly packet$ = this._packet$.asObservable();
  private readonly _connected$ = new Subject<boolean>();
  public readonly connected$ = this._connected$.asObservable();

  constructor(options: Options) {
    super();
    this.options = { ...options };
    if (options.key.length !== 16) {
      throw new Error('Expected key length of 16 characters');
    }
  }

  async connect() {
    if (this.connectDeferred) {
      return this.connectDeferred.promise;
    }
    if (this.client) {
      if (this.client.destroyed) {
        throw new Error('destroyed');
      }
      return;
    }
    this.connectDeferred = deferred();
    this.client = new net.Socket();
    this.client.setTimeout(this.options.connectionTimeout ?? 5000);
    this.client.once('timeout', () => {
      this.client?.destroy();
      const error = new Error('connection timed out');
      this.emit('error', error);
      this.connectDeferred?.reject(error);
      this.connectDeferred = null;
    });
    this.client.on('data', (data) => {
      if (debug.enabled) {
        debug('Data:');
        debug(data.toString('hex'));
      }
      try {
        this.parser.decode(data).forEach((packet) => {
          if (debug.enabled) {
            debug('Parsed:');
            debug(packet);
          }
          this._packet$.next(packet);
          this.emit('packet', packet);
        });
      } catch (e) {
        this._packet$.error(e);
        this.emit('error', e);
      }
    });
    this.client.on('close', () => {
      this.connectDeferred?.reject('Closed');
      this.connectDeferred = null;
      this.disconnect();
    });
    this.client.on('error', (e) => {
      this.onError(e);
    });
    this.client.on('connect', async () => {
      const client = this.client;
      if (!client) {
        return;
      }
      try {
        client.setTimeout(0);
        await this.onConnect(client);
        this.setupHeartBeat();
        this.emit('connected', client);
        this.connected = true;
        this.connectDeferred?.resolve();
      } catch (e) {
        this.connected = false;
        this.connectDeferred?.reject(e);
      } finally {
        this.connectDeferred = null;
      }
    });
    this.client.connect(this.options.port ?? 6668, this.options.ip);
    return this.connectDeferred.promise;
  }

  disconnect() {
    if (this._packet$.closed) {
      return;
    }
    this.hearBeatSub?.unsubscribe();
    this.hearBeatSub = null;
    this.client?.destroy();
    this.connected = false;
    this._packet$.complete();
    this._connected$.complete();
    this.emit('disconnected');
  }

  send(command: Command, data: Buffer | string | object) {
    if (!this.client || !this.parser) {
      throw new Error('Not connected');
    }
    const sequenceN = ++this.currentSequenceN;
    if (debug.enabled) {
      debug('Send', {
        data,
        command,
        sequenceN,
      });
    }
    return this.write(
      this.parser.encode({
        data,
        command,
        sequenceN,
      }),
    );
  }

  async sendWithResponse(
    command: Command,
    data: Buffer | string | object,
    options?: {
      responseCommand?: Command;
      sequenceN?: number;
      timeout?: number;
    },
  ): Promise<Packet> {
    if (!this.client || !this.parser) {
      throw new Error('Not connected');
    }
    const sequenceN = options?.sequenceN ?? ++this.currentSequenceN;
    if (debug.enabled) {
      debug('Send', {
        data,
        command,
        sequenceN,
      });
    }
    await this.write(
      this.parser.encode({
        data,
        command,
        sequenceN,
      }),
    );
    const response = await this.forPacket(
      (packet) =>
        packet.sequenceN === sequenceN &&
        (packet.command === command ||
          packet.command === options?.responseCommand),
    );
    return response;
  }

  protected forPacket(
    predicate: (value: Packet) => boolean,
    timeoutMs?: number,
  ) {
    return firstValueFrom(
      this.packet$.pipe(
        filter(predicate),
        timeout({
          each: timeoutMs ?? this.options.responseTimeout ?? 1000,
          with: () => throwError(() => new Error('Timeout')),
        }),
        take(1),
      ),
    );
  }

  async sendPing() {
    try {
      await this.sendWithResponse('HEART_BEAT', Buffer.allocUnsafe(0));
    } catch (e) {
      this.onError(e);
      return false;
    }
    return true;
  }

  abstract dps(): Promise<Record<string, unknown>>;
  abstract set(data: Record<string, string | number>): Promise<unknown>;

  protected async onConnect(client: net.Socket) {}

  protected onError(e: unknown) {
    this.connectDeferred?.reject(e);
    this.connectDeferred = null;
    this._packet$.error(e);
    this._connected$.error(e);
    this.disconnect();
    this.emit('error', e);
  }

  private setupHeartBeat() {
    this.hearBeatSub = interval(this.options.heartBeatInterval ?? 10_000)
      .pipe(exhaustMap(this.sendPing.bind(this)))
      .subscribe();
  }

  private write(buffer: Buffer) {
    return new Promise<void>((resolve, reject) => {
      const client = this.client;
      if (!client) {
        reject('Not connected');
        return;
      }
      client.write(buffer, (error) => (error ? reject(error) : resolve()));
    });
  }
}
