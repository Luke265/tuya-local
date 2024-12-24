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
    if (
      options.command !== 'DP_QUERY' &&
      options.command !== 'HEART_BEAT' &&
      options.command !== 'DP_QUERY_NEW' &&
      options.command !== 'SESS_KEY_NEG_START' &&
      options.command !== 'SESS_KEY_NEG_FINISH' &&
      options.command !== 'DP_REFRESH'
    ) {
      // Add 3.4 header
      // check this: mqc_very_pcmcd_mcd(int a1, unsigned int a2)
      const buffer = Buffer.alloc(payload.length + 15);
      Buffer.from('3.4').copy(buffer, 0);
      payload.copy(buffer, 15);
      payload = buffer;
    }
    const padding = 0x10 - (payload.length & 0xf);
    const buf34 = Buffer.alloc(payload.length + padding, padding);
    payload.copy(buf34);
    payload = buf34;

    payload = this.cipher.encrypt(payload);

    payload = Buffer.from(payload);

    // Allocate buffer with room for payload + 24 bytes for
    // prefix, sequence, command, length, crc, and suffix
    const buffer = Buffer.alloc(payload.length + 52);

    // Add prefix, command, and length
    buffer.writeUInt32BE(0x000055aa, 0);
    buffer.writeUInt32BE(CommandType[options.command], 8);
    buffer.writeUInt32BE(payload.length + 0x24, 12);

    if (options.sequenceN) {
      buffer.writeUInt32BE(options.sequenceN, 4);
    }

    // Add payload, crc, and suffix
    payload.copy(buffer, 16);
    const calculatedCrc = this.cipher.hmac(
      buffer.subarray(0, payload.length + 16),
    ); // & 0xFFFFFFFF;
    calculatedCrc.copy(buffer, payload.length + 16);

    buffer.writeUInt32BE(0x0000aa55, payload.length + 48);
    return buffer;
  }

  decode(buffer: Buffer): Packet[] {
    const packets: Packet[] = [];
    let inputBuffer: Buffer | null = buffer;
    while (inputBuffer && inputBuffer.length > 0) {
      const { leftover, command, payload, sequenceN } =
        this.parsePacket(inputBuffer);
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

    // Check for prefix
    const prefix = buffer.readUInt32BE(0);

    // Only for 3.4 and 3.5 packets
    if (prefix !== 0x000055aa && prefix !== 0x00006699) {
      throw new Error(`Prefix does not match: ${buffer.toString('hex')}`);
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

    const packageFromDiscovery =
      command === 'UDP' ||
      command === 'UDP_NEW' ||
      command === 'BOARDCAST_LPV34';

    // Get the return code, 0 = success
    // This field is only present in messages from the devices
    // Absent in messages sent to device
    const returnCode = buffer.readUInt32BE(16);

    // Get the payload
    // Adjust for messages lacking a return code
    let payload;
    if (returnCode & 0xffffff00) {
      if (!packageFromDiscovery) {
        payload = buffer.subarray(
          HEADER_SIZE,
          HEADER_SIZE + payloadSize - 0x24,
        );
      } else {
        payload = buffer.subarray(HEADER_SIZE, HEADER_SIZE + payloadSize - 8);
      }
    } else if (!packageFromDiscovery) {
      payload = buffer.subarray(
        HEADER_SIZE + 4,
        HEADER_SIZE + payloadSize - 0x24,
      );
    } else {
      payload = buffer.subarray(HEADER_SIZE + 4, HEADER_SIZE + payloadSize - 8);
    }

    // Check CRC
    if (!packageFromDiscovery) {
      const expectedCrc = buffer
        .subarray(HEADER_SIZE + payloadSize - 0x24, buffer.length - 4)
        .toString('hex');
      const computedCrc = this.cipher
        .hmac(buffer.subarray(0, HEADER_SIZE + payloadSize - 0x24))
        .toString('hex');

      if (expectedCrc !== computedCrc) {
        throw new Error(
          `HMAC mismatch: expected ${expectedCrc}, was ${computedCrc}. ${buffer.toString('hex')}`,
        );
      }
    } else {
      const expectedCrc = buffer.readInt32BE(HEADER_SIZE + payloadSize - 8);
      const computedCrc = crc32(buffer.subarray(0, payloadSize + 8));

      if (expectedCrc !== computedCrc) {
        throw new Error(
          `CRC mismatch: expected ${expectedCrc}, was ${computedCrc}. ${buffer.toString('hex')}`,
        );
      }
    }

    return { payload, leftover, command, sequenceN };
  }

  /**
   * Attempts to decode a given payload into
   * an object or string.
   */
  private getPayload(data: Buffer): Buffer | unknown {
    if (data.length === 0) {
      return data;
    }
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
