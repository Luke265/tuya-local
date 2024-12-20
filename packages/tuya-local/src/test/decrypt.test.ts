import { TuyaCipher } from '../lib/33/cipher';
import { MessageParser } from '../lib/33/message-parser';

const parser = new MessageParser(
  new TuyaCipher(Buffer.from(';nIBfAzQyoXF72n>')),
);

it('should decode', () => {
  parser.decode(
    Buffer.from(
      '000055aa00000000000000080000006b00000000332e33000000000029b1b800000001c15225da69296be786acd63c2fbdf4ae9ff55dcb91841045caf06b860eb5a052b09740ad6edc58d0bf8c96ba84165a924171a83618f7f883dae8be1cee0ae034ea1764b2f1f195933f2135a6c90a7c53d5837d400000aa55',
      'hex',
    ),
  );
  parser.decode(
    Buffer.from(
      '000055aa00000000000000090000000c00000000b051ab030000aa55',
      'hex',
    ),
  );
});
