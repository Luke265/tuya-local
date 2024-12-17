import crypto from 'node:crypto';

/**
 * Calculates a MD5 hash.
 * @returns characters 8 through 16 of hash of data
 */
export function md5(data: string): string {
  return crypto
    .createHash('md5')
    .update(data, 'utf8')
    .digest('hex')
    .slice(8, 24);
}

/**
 * Returns the HMAC for the current key (sessionKey if set for protocol 3.4, 3.5 or key)
 */
export function hmac(key: string | Buffer, data: Buffer) {
  return crypto.createHmac('sha256', key).update(data).digest();
}

export interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: any) => void;
}

export function deferred<T>(): Deferred<T> {
  let resolve: ((value: T | PromiseLike<T>) => void) | undefined = undefined;
  let reject: ((reason?: any) => void) | undefined = undefined;
  const promise = new Promise<T>((_resolve, _reject) => {
    resolve = _resolve;
    reject = _reject;
  });
  return { promise, resolve: resolve!!, reject: reject!! };
}

export function normalizePayload(
  payload: Buffer<ArrayBufferLike> | string | object,
) {
  if (payload instanceof Buffer) {
    return payload;
  }
  switch (typeof payload) {
    case 'object':
      return Buffer.from(JSON.stringify(payload));
    case 'string':
      return Buffer.from(payload);
  }
  throw new Error('Unsupported payload type');
}
