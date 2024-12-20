import crypto from 'node:crypto';
import { hmac } from '../util.js';
import { ITuyaCipher } from '../types.js';

export class TuyaCipher implements ITuyaCipher {
  constructor(public key: Buffer) {}

  encrypt(data: Buffer): Buffer {
    const cipher = crypto.createCipheriv('aes-128-ecb', this.key, null);
    cipher.setAutoPadding(false);
    const encrypted = cipher.update(data);
    cipher.final();
    return encrypted;
  }

  decrypt(data: Buffer): Buffer {
    const decipher = crypto.createDecipheriv('aes-128-ecb', this.key, null);
    decipher.setAutoPadding(false);
    const result = decipher.update(data);
    decipher.final();
    return (
      result
        // remove padding
        .subarray(0, result.length - (result.at(-1) ?? 0))
    );
  }

  hmac(data: Buffer) {
    return hmac(this.key, data);
  }
}
