import 'server-only';
import { randomInt } from 'node:crypto';

/**
 * Readable passwords for children (G1-08 §3.1, board 18): three simple words and a two-digit
 * number, for example "green-river-tiger-42". 256 words give 3 × 8 bits plus about 6.5 bits
 * for the number (about 30 bits). Combined with the 5-try lock this is ample for a child
 * account, and easy for a young child to type.
 */
// prettier-ignore
const WORDS = [
  'apple', 'arrow', 'autumn', 'badge', 'bakery', 'balloon', 'bamboo', 'banana', 'barn', 'basket',
  'beach', 'beads', 'bear', 'bell', 'berry', 'bicycle', 'bird', 'blanket', 'blue', 'boat',
  'bottle', 'branch', 'bread', 'breeze', 'brick', 'bridge', 'brook', 'brush', 'bubble', 'bucket',
  'button', 'cabin', 'cactus', 'camel', 'candle', 'canoe', 'carrot', 'castle', 'cedar', 'chalk',
  'cherry', 'circle', 'cloud', 'clover', 'coconut', 'comet', 'copper', 'coral', 'cotton', 'crayon',
  'cricket', 'crystal', 'cup', 'daisy', 'dancer', 'desert', 'dolphin', 'dragon', 'drum', 'eagle',
  'echo', 'emerald', 'falcon', 'feather', 'fern', 'field', 'fig', 'finch', 'flag', 'flute',
  'forest', 'fossil', 'fountain', 'fox', 'frog', 'garden', 'giraffe', 'glacier', 'globe', 'gold',
  'grape', 'grass', 'green', 'guava', 'hammock', 'harbor', 'harp', 'hat', 'hazel', 'hedge',
  'helmet', 'heron', 'hill', 'honey', 'horizon', 'igloo', 'island', 'ivory', 'jacket', 'jasmine',
  'jelly', 'jungle', 'kayak', 'kettle', 'kite', 'koala', 'ladder', 'lagoon', 'lake', 'lamp',
  'lantern', 'lemon', 'lily', 'lime', 'lion', 'lotus', 'magnet', 'mango', 'maple', 'marble',
  'meadow', 'melon', 'meteor', 'mint', 'mirror', 'mitten', 'monkey', 'moon', 'moss', 'mountain',
  'mouse', 'muffin', 'nest', 'noodle', 'nutmeg', 'oak', 'ocean', 'olive', 'orange', 'orbit',
  'otter', 'owl', 'paddle', 'panda', 'paper', 'parrot', 'peach', 'peacock', 'pebble', 'pencil',
  'penguin', 'pepper', 'piano', 'pillow', 'pine', 'planet', 'plum', 'pocket', 'pond', 'poppy',
  'potato', 'pumpkin', 'puzzle', 'quilt', 'rabbit', 'rain', 'rainbow', 'raven', 'reef', 'ribbon',
  'river', 'robin', 'rocket', 'rose', 'saddle', 'sail', 'salt', 'sand', 'sapphire', 'saturn',
  'scarf', 'seed', 'shell', 'silver', 'sky', 'sled', 'snail', 'snow', 'sock', 'spark',
  'sparrow', 'spoon', 'spring', 'squirrel', 'star', 'stone', 'stream', 'sugar', 'summer', 'sun',
  'swan', 'swing', 'table', 'teapot', 'tiger', 'toast', 'tomato', 'tortoise', 'tower', 'train',
  'tree', 'trumpet', 'tulip', 'turnip', 'turtle', 'umbrella', 'valley', 'velvet', 'violet', 'violin',
  'wagon', 'walnut', 'water', 'wave', 'whale', 'wheat', 'whistle', 'willow', 'window', 'winter',
  'wizard', 'wool', 'yak', 'yellow', 'yogurt', 'zebra', 'zigzag', 'acorn', 'anchor', 'badger',
  'beetle', 'biscuit', 'blossom', 'canyon', 'cereal', 'chimney', 'cocoa', 'compass', 'cookie', 'dune',
  'gecko', 'ginger', 'hippo', 'jigsaw', 'lizard', 'llama',
] as const;

export const PASSPHRASE_WORD_COUNT = WORDS.length;

export function generatePassphrase(): string {
  const words = Array.from({ length: 3 }, () => WORDS[randomInt(WORDS.length)]);
  return `${words.join('-')}-${randomInt(10, 100)}`;
}
