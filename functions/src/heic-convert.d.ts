declare module "heic-convert" {
  interface ConvertOptions {
    buffer: ArrayBuffer | SharedArrayBuffer | Uint8Array;
    format: "JPEG" | "PNG";
    quality?: number;
  }

  export default function convert(options: ConvertOptions): Promise<ArrayBuffer>;
}
