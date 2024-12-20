import crypto from 'node:crypto';
import { MessageParser } from './message-parser.js';
import { debug } from '../debug.js';
import { TuyaCipher } from './cipher.js';
import { TuyaLocalBase } from '../tuya-local-base.js';
import { Options } from '../types.js';

export class TuyaLocal extends TuyaLocalBase {
  protected override cipher: TuyaCipher;
  protected override parser: MessageParser;

  constructor(options: Options) {
    super(options);
    this.cipher = new TuyaCipher(Buffer.from(options.key));
    this.parser = new MessageParser(this.cipher);
  }

  override async dps() {
    await this.connect();
    const payload = {
      gwId: this.options.gwId,
      devId: this.options.id,
      t: (Date.now() / 1000).toFixed(0),
      dps: {},
      uid: this.options.id,
    };
    const response = await this.sendWithResponse('DP_QUERY_NEW', payload);
    return (response.payload as { dps: Record<string, unknown> }).dps;
  }

  protected override async onConnect() {
    // Negotiate session key then emit 'connected'
    // 16 bytes random + 32 bytes hmac
    const tmpLocalKey = crypto.randomBytes(16);
    const packet = await this.sendWithResponse(
      'SESS_KEY_NEG_START',
      tmpLocalKey,
      {
        responseCommand: 'SESS_KEY_NEG_RES',
      },
    );
    if (debug.enabled) {
      debug('Protocol 3.4, 3.5: Negotiate Session Key - Send Msg 0x03');
    }
    if (!(packet.payload instanceof Buffer)) {
      throw new Error(
        'Expected payload of type Buffer for SESS_KEY_NEG_RES command',
      );
    }
    if (!tmpLocalKey) {
      throw new Error(
        'Local key is undefined, ensure that connect() has been called',
      );
    }
    if (!this.client) {
      throw new Error('Not connected');
    }
    // 16 bytes _tmpRemoteKey and hmac on _tmpLocalKey
    const tmpRemoteKey = packet.payload.subarray(0, 16);
    if (debug.enabled) {
      debug(
        'Protocol 3.4, 3.5: Local Random Key: ' + tmpLocalKey.toString('hex'),
      );
      debug(
        'Protocol 3.4, 3.5: Remote Random Key: ' + tmpRemoteKey.toString('hex'),
      );
    }
    this.currentSequenceN = packet.sequenceN - 1;
    const calcLocalHmac = this.cipher.hmac(tmpLocalKey).toString('hex');
    const expLocalHmac = packet.payload.subarray(16, 16 + 32).toString('hex');
    if (expLocalHmac !== calcLocalHmac) {
      throw new Error(
        `HMAC mismatch(keys): expected ${expLocalHmac}, was ${calcLocalHmac}. ${packet.payload.toString('hex')}`,
      );
    }

    // Send response 0x05
    await this.send('SESS_KEY_NEG_FINISH', this.cipher.hmac(tmpRemoteKey));

    // Calculate session key
    let newSessionKey = Buffer.from(tmpLocalKey);
    for (let i = 0; i < tmpLocalKey.length; i++) {
      newSessionKey[i] = tmpLocalKey[i] ^ tmpRemoteKey[i];
    }
    this.cipher.key = this.cipher.encrypt(newSessionKey);
    if (debug.enabled) {
      debug(
        'Protocol 3.4, 3.5: Session Key: ' + this.cipher.key.toString('hex'),
      );
      debug('Protocol 3.4, 3.5: Initialization done');
    }
  }
}
