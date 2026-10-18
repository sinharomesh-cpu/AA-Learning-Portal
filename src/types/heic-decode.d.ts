/** Minimal types for heic-decode 2.1 (ISC); it decodes HEIC/HEIF with libheif-js (LGPL-3.0). */
declare module 'heic-decode' {
  interface DecodedImage {
    width: number;
    height: number;
    data: Uint8ClampedArray;
  }
  interface LazyImage {
    width: number;
    height: number;
    decode(): Promise<DecodedImage>;
  }
  function decode(input: { buffer: Uint8Array }): Promise<DecodedImage>;
  namespace decode {
    function all(input: { buffer: Uint8Array }): Promise<LazyImage[] & { dispose(): void }>;
  }
  export default decode;
}
