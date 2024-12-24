import { TuyaLocalBase } from '../lib/tuya-local-base';
import { IMessageParser, ITuyaCipher } from '../lib/types';

class TuyaLocal extends TuyaLocalBase {
  protected override parser!: IMessageParser;
  protected override cipher!: ITuyaCipher;
  override dps(): Promise<Record<string, unknown>> {
    throw new Error('Method not implemented.');
  }
}
it('constructor throws error if key is invalid', () => {
  expect(() => {
    new TuyaLocal({
      ip: '0.0.0.0',
      id: '22325186db4a2217dc8e',
      key: '4226aa407d5c1e2',
      version: '3.3',
    });
  }).toThrow();
});
