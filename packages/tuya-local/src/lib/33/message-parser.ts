import { CommandType, CommandTypeReverse } from '../command-type.js';
import { crc32 } from '../crc.js';
import { debug } from '../debug.js';
import { EncodeOptions, IMessageParser, Packet } from '../types.js';
import { normalizePayload } from '../util.js';
import { TuyaCipher } from './cipher.js';

const HEADER_SIZE = 16;

export class MessageParser implements IMessageParser {
  constructor(private readonly cipher: TuyaCipher) {}

  encode(options: EncodeOptions): Buffer {
    let payload = normalizePayload(options.data);

    payload = this.cipher.encrypt(payload);

    // Check if we need an extended header, only for certain CommandTypes
    if (options.command !== 'DP_QUERY' && options.command !== 'DP_REFRESH') {
      // Add 3.3 header
      const buffer = Buffer.alloc(payload.length + 15);
      Buffer.from('3.3').copy(buffer, 0);
      payload.copy(buffer, 15);
      payload = buffer;
    }

    // Allocate buffer with room for payload + 24 bytes for
    // prefix, sequence, command, length, crc, and suffix
    const buffer = Buffer.alloc(payload.length + 24);

    // Add prefix, command, and length
    buffer.writeUInt32BE(0x000055aa, 0);
    buffer.writeUInt32BE(CommandType[options.command], 8);
    buffer.writeUInt32BE(payload.length + 8, 12);

    if (options.sequenceN) {
      buffer.writeUInt32BE(options.sequenceN, 4);
    }

    // Add payload, crc, and suffix
    payload.copy(buffer, 16);
    const calculatedCrc =
      crc32(buffer.slice(0, payload.length + 16)) & 0xffffffff;

    buffer.writeInt32BE(calculatedCrc, payload.length + 16);
    buffer.writeUInt32BE(0x0000aa55, payload.length + 20);
    return buffer;
  }

  decode(buffer: Buffer): Packet[] {
    const packets: Packet[] = [];
    let inputBuffer: Buffer | null = buffer;
    while (inputBuffer) {
      const { leftover, command, payload, sequenceN } =
        this.parsePacket(buffer);
      inputBuffer = leftover;
      packets.push({
        command,
        sequenceN,
        payload: this.getPayload(payload),
      });
    }
    return packets;
  }

  /**
   * Parses a Buffer of data containing at least
   * one complete packet at the beginning of the buffer.
   * Will return multiple packets if necessary.
   */
  private parsePacket(buffer: Buffer) {
    // Check for length
    // At minimum requires: prefix (4), sequence (4), command (4), length (4),
    // CRC (4), and suffix (4) for 24 total bytes
    // Messages from the device also include return code (4), for 28 total bytes
    if (buffer.length < 24) {
      throw new Error(`Packet too short. Length: ${buffer.length}.`);
    }

    // Check for extra data
    let leftover: Buffer | null = null;

    let suffixLocation = buffer.indexOf('0000AA55', 0, 'hex');
    if (suffixLocation === -1) {
      // Couldn't find 0000AA55 during parse
      suffixLocation = buffer.indexOf('00009966', 0, 'hex');
    }

    if (suffixLocation !== buffer.length - 4) {
      leftover = buffer.subarray(suffixLocation + 4);
      buffer = buffer.subarray(0, suffixLocation + 4);
    }

    // Check for suffix
    const suffix = buffer.readUInt32BE(buffer.length - 4);

    if (suffix !== 0x0000aa55 && suffix !== 0x00009966) {
      throw new Error(`Suffix does not match: ${buffer.toString('hex')}`);
    }

    let sequenceN = 0;
    let commandId = 0;
    let payloadSize = 0;

    if (suffix === 0x0000aa55) {
      // Get sequence number
      sequenceN = buffer.readUInt32BE(4);

      // Get command byte
      commandId = buffer.readUInt32BE(8);

      // Get payload size
      payloadSize = buffer.readUInt32BE(12);

      // Check for payload
      if (buffer.length - 8 < payloadSize) {
        throw new Error(
          `Packet missing payload: payload has length ${payloadSize}.`,
        );
      }
    } else if (suffix === 0x00009966) {
      // Get sequence number
      sequenceN = buffer.readUInt32BE(6);

      // Get command byte
      commandId = buffer.readUInt32BE(10);

      // Get payload size
      payloadSize = buffer.readUInt32BE(14) + 14; // Add additional bytes for extras

      // Check for payload
      if (buffer.length - 8 < payloadSize) {
        throw new Error(
          `Packet missing payload: payload has length ${payloadSize}.`,
        );
      }
    }

    const command =
      CommandTypeReverse[commandId as keyof typeof CommandTypeReverse];
    if (!command) {
      if (debug.enabled) {
        debug('Unsupported command', commandId, buffer.toString('hex'));
      }
      throw new Error('Unsupported command');
    }
    // Get the return code, 0 = success
    // This field is only present in messages from the devices
    // Absent in messages sent to device
    const returnCode = buffer.readUInt32BE(16);

    // Get the payload
    // Adjust for messages lacking a return code
    let payload;
    if (returnCode & 0xffffff00) {
      payload = buffer.subarray(HEADER_SIZE, HEADER_SIZE + payloadSize - 8);
    } else {
      payload = buffer.subarray(HEADER_SIZE + 4, HEADER_SIZE + payloadSize - 8);
    }

    // Check CRC
    const expectedCrc = buffer.readInt32BE(HEADER_SIZE + payloadSize - 8);
    const computedCrc = crc32(buffer.subarray(0, payloadSize + 8));

    if (expectedCrc !== computedCrc) {
      if (debug.enabled) {
        debug('CRC mismatch buffer', buffer.toString('hex'));
      }
      throw new Error(
        `CRC mismatch: expected ${expectedCrc}, was ${computedCrc}`,
      );
    }

    return { payload, leftover, command, sequenceN };
  }

  /**
   * Attempts to decode a given payload into
   * an object or string.
   */
  private getPayload(data: Buffer): Buffer | unknown {
    const payload = this.cipher.decrypt(data);
    // if starts with '{' then this might be json
    if (payload.at(0) === 123) {
      try {
        const res = JSON.parse(payload.toString());
        if ('data' in res) {
          const resData = res.data;
          resData.t = res.t;
          return resData; // Or res.data // for compatibility with tuya-mqtt
        }
        return res;
      } catch (_) {
        /* ignore */
      }
    }
    return payload;
  }
}
