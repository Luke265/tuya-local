import crypto from 'node:crypto';
import { hmac } from '../util';
import { ITuyaCipher } from '../types';

export class TuyaCipher implements ITuyaCipher {
  constructor(public key: Buffer) {}

  encrypt(data: Buffer): Buffer {
    const cipher = crypto.createCipheriv('aes-128-ecb', this.key, null);
    return Buffer.concat([cipher.update(data), cipher.final()]);
  }

  decrypt(data: Buffer): Buffer {
    const decipher = crypto.createDecipheriv('aes-128-ecb', this.key, null);
    return Buffer.concat([decipher.update(data), decipher.final()]);
  }

  hmac(data: Buffer) {
    return hmac(this.key, data);
  }
}
