import crypto from 'node:crypto';
import { ITuyaCipher } from '../types';

export class TuyaCipher implements ITuyaCipher {
  constructor(public key: Buffer) {}

  encrypt(data: Buffer, options?: { iv?: Buffer; aad?: Buffer }) {
    let encrypted;
    let localIV = Buffer.from((Date.now() * 10).toString().slice(0, 12));
    if (options?.iv) {
      localIV = options.iv.subarray(0, 12);
    }

    const cipher = crypto.createCipheriv('aes-128-gcm', this.key, localIV);
    if (options?.aad === undefined) {
      encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
    } else {
      cipher.setAAD(options.aad);
      encrypted = Buffer.concat([
        localIV,
        cipher.update(data),
        cipher.final(),
        cipher.getAuthTag(),
        Buffer.from([0x00, 0x00, 0x99, 0x66]),
      ]);
    }
    return encrypted;
  }

  decrypt(data: Buffer): Buffer {
    const header = data.subarray(0, 14);
    const iv = data.subarray(14, 26);
    const tag = data.subarray(data.length - 16);
    const decipher = crypto.createDecipheriv('aes-128-gcm', this.key, iv);
    decipher.setAuthTag(tag);
    decipher.setAAD(header);

    return (
      Buffer.concat([
        decipher.update(data.subarray(26, data.length - 16)),
        decipher.final(),
      ])
        // Remove 32bit return code
        .subarray(4)
    );
  }
}
