import net from 'node:net';
import dgram from 'node:dgram';
import { MessageParser } from '../lib/34/message-parser';
import { Command } from '../lib/command-type';
import d from 'debug';
import { EncodeOptions } from '../lib/types';
import { TuyaCipher } from '../lib/34/cipher';
const debug = d('TuyaLocalStub');

/**
 * A stub implementation of the
 * Tuya protocol for local testing.
 * @class
 * @param {Object} options
 * @param {String} options.id ID of mock device
 * @param {String} options.key key of mock device
 * @param {String} [options.ip=localhost] IP address of mock device
 * @param {Boolean} [options.respondToHeartbeat=true] sends pong if true in response to pings
 * @param {Object} options.state inital state of device
 * @example
 * const stub = new TuyaStub({ id: 'xxxxxxxxxxxxxxxxxxxx',
                               key: 'xxxxxxxxxxxxxxxx',
                               state: {'1': false, '2': true}});
 */
export class TuyaStub {
  private state: Record<string, unknown> = {};
  private readonly id: string;
  private readonly ip: string;
  private readonly respondToHeartbeat: boolean;
  private readonly parser: MessageParser;
  private server: net.Server | null = null;
  private socket: net.Socket | null = null;
  private broadcastSocket: dgram.Socket | null = null;
  private broadcastInterval: NodeJS.Timeout | null = null;
  constructor({
    state = {},
    id,
    key,
    ip = 'localhost',
    respondToHeartbeat = true,
  }: {
    state: any;
    id: string;
    key: string;
    ip: string;
    respondToHeartbeat: boolean;
  }) {
    this.state = state;

    this.id = id;
    this.ip = ip;
    this.respondToHeartbeat = respondToHeartbeat;
    const cipher = new TuyaCipher(Buffer.from(key));
    this.parser = new MessageParser(cipher);
  }

  /**
   * Starts the mocking server.
   * @param {Number} [port=6668] port to listen on
   */
  startServer(port: number = 6668) {
    this.server = net
      .createServer((socket) => {
        this.socket = socket;

        socket.on('data', (data) => {
          this.handleRequest(data);
        });
      })
      .listen(port);
  }

  /**
   * Call to cleanly exit.
   */
  shutdown() {
    this.socket?.destroy();
    this.socket = null;
    this.server?.close();
    this.server = null;

    this.broadcastSocket?.close();
    this.broadcastSocket = null;
    if (this.broadcastInterval) {
      clearInterval(this.broadcastInterval);
    }
    this.broadcastInterval = null;
  }

  /**
   * Starts the periodic UDP broadcast.
   * @param {Object} options
   * @param {Number} [options.port=6666] port to broadcast on
   * @param {Number} [options.interval=5] interval, in seconds, to broadcast at
   */
  startUDPBroadcast(option: { port?: number; interval?: number } = {}) {
    // Defaults
    let options = {
      port: 6666,
      interval: 5,
      ...option,
    };
    // Encode broadcast
    const message = this.parser.encode({
      data: { devId: this.id, gwId: this.id, ip: this.ip },
      command: 'DP_QUERY',
    });

    // Create and bind socket
    this.broadcastSocket = dgram.createSocket({
      type: 'udp4',
      reuseAddr: true,
    });

    this.broadcastSocket.bind(options.port);

    // When socket is ready, start broadcasting
    this.broadcastSocket.on('listening', () => {
      const socket = this.broadcastSocket;
      if (!socket) {
        return;
      }
      socket.setBroadcast(true);
      if (this.broadcastInterval) {
        return;
      }
      this.broadcastInterval = setInterval(() => {
        const socket = this.broadcastSocket;
        if (!socket) {
          return;
        }
        debug('Sending UDP broadcast...');
        socket.send(
          message,
          0,
          message.length,
          options.port,
          '255.255.255.255',
        );
      }, options.interval * 1000);
    });
  }

  /**
   * Handles incoming requests.
   */
  private handleRequest(data: Buffer) {
    debug('Incoming packet(s):');
    debug(data.toString('hex'));

    const parsedPackets = this.parser.decode(data);

    debug('Parsed request:');
    debug(parsedPackets);

    parsedPackets.forEach((packet) => {
      if (!this.socket) {
        throw new Error('Not connected');
      }
      if (packet.command === 'DP_QUERY') {
        const payload = packet.payload as { devId: string };
        // GET request
        // Check device ID
        if (payload.devId !== this.id) {
          throw new Error('devId of request does not match');
        }

        // Write response
        this.send({
          data: {
            devId: this.id,
            gwId: this.id,
            dps: this.state,
          },
          command: 'DP_QUERY' as Command,
          sequenceN: packet.sequenceN,
        });
      } else if (packet.command === 'CONTROL') {
        const payload = packet.payload as {
          devId: string;
          t: number;
          dps: Record<string, unknown>;
        };
        // SET request
        // Decrypt data

        debug('Decrypted data:');
        debug(payload);

        // Check device ID
        if (payload.devId !== this.id) {
          throw new Error('devId of request does not match');
        }

        // Check timestamp
        const now = Math.floor(Date.now() / 1000); // Seconds since epoch

        // Timestamp difference must be no more than 10 seconds
        if (Math.abs(now - payload.t) > 10) {
          throw new Error('Bad timestamp.');
        }

        // Set properties
        Object.keys(payload.dps).forEach((property) => {
          this.setProperty(property, payload.dps[property]);
        });

        // Responses for status updates have two parts
        this.send({
          data: {},
          command: 'CONTROL' as Command,
          sequenceN: packet.sequenceN,
        });
        this.send({
          data: {
            devId: this.id,
            gwId: this.id,
            dps: this.state,
          },
          command: 'STATUS',
        });
      } else if (packet.command === 'HEART_BEAT' && this.respondToHeartbeat) {
        // Heartbeat packet
        // Send response pong
        debug('Sending pong...');
        this.send({
          data: Buffer.allocUnsafe(0),
          command: 'HEART_BEAT',
          sequenceN: packet.sequenceN,
        });
      }
    });
  }

  /**
   * Sets a property of the mock device.
   */
  setProperty(property: string, value: unknown) {
    this.state[property] = value;

    if (this.server && this.socket) {
      this.send({
        data: {
          devId: this.id,
          gwId: this.id,
          dps: this.state,
        },
        command: 'CONTROL',
      });
    }

    return this.state[property];
  }

  /**
   * Gets a property of the mock device.
   */
  getProperty(property: string) {
    return this.state[property];
  }

  /**
   * Gets entire state of the mock device.
   */
  getState() {
    return this.state;
  }

  /**
   * Sets entire state of the mock device.
   */
  setState(state: Record<string, unknown>) {
    this.state = state;
    return this.state;
  }

  private send(response: EncodeOptions) {
    return this.socket?.write(this.parser.encode(response));
  }
}
