import { ITuyaLocal, Options } from './types';
import { TuyaLocal as TuyaLocal33 } from './33/tuya-local.js';
import { TuyaLocal as TuyaLocal34 } from './34/tuya-local.js';

export function TuyaLocal(options: Options): ITuyaLocal {
  switch (options.version) {
    case '3.3':
      return new TuyaLocal33(options);
    case '3.4':
      return new TuyaLocal34(options);
  }
  throw new Error('Version not implemented');
}
