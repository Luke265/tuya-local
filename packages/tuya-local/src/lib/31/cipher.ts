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

  decrypt(data: string): object {
    // Incoming data format
    // Remove prefix of version number and MD5 hash
    data = data.substring(19);
    // Decode incoming data as base64
    // Decrypt data
    const decipher = crypto.createDecipheriv(
      'aes-128-ecb',
      this.sessionKey,
      '',
    );
    let result = decipher.update(data, 'base64', 'utf8');
    result += decipher.final('utf8');
    return JSON.parse(result);
  }
}
