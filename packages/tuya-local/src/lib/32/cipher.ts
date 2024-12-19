import crypto from 'node:crypto';

export class TuyaCipher {
  constructor(private readonly sessionKey: string) {}

  encrypt(data: string, options: { base64?: boolean }) {
    const cipher = crypto.createCipheriv('aes-128-ecb', this.sessionKey, '');

    let encrypted = cipher.update(data, 'utf8', 'base64');
    encrypted += cipher.final('base64');

    // Default base64 enable
    if (options.base64 === false) {
      return Buffer.from(encrypted, 'base64');
    }

    return encrypted;
  }

  decrypt(data: Buffer): object {
    const decipher = crypto.createDecipheriv(
      'aes-128-ecb',
      this.sessionKey,
      '',
    );
    decipher.update(data.subarray(15));
    const result = decipher.final().toString();

    // Try to parse data as JSON,
    // otherwise return as string.
    return JSON.parse(result);
  }
}
