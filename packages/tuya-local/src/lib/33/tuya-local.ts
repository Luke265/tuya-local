import { MessageParser } from './message-parser.js';
import { TuyaCipher } from './cipher.js';
import { TuyaLocalBase } from '../tuya-local-base.js';
import { Options } from '../types.js';

export class TuyaLocal extends TuyaLocalBase {
  protected override cipher: TuyaCipher;
  protected override parser: MessageParser;

  constructor(options: Options) {
    super(options);
    const cipher = (this.cipher = new TuyaCipher(
      Buffer.from(this.options.key),
    ));
    this.parser = new MessageParser(cipher);
  }

  override async dps() {
    await this.connect();
    const payload = {
      gwId: this.options.gwId ?? this.options.id,
      devId: this.options.id,
      t: (Date.now() / 1000).toFixed(0),
      dps: {},
      uid: this.options.id,
    };
    const response = await this.sendWithResponse('DP_QUERY', payload);
    return (response.payload as { dps: Record<string, unknown> }).dps;
  }
}
