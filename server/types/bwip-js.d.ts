// Task #3248 — minimal typings for bwip-js. The package ships types under
// `exports`, but this repo's older moduleResolution doesn't pick them up.
declare module "bwip-js" {
  export interface BwipOptions {
    bcid: string;
    text: string;
    scale?: number;
    height?: number;
    includetext?: boolean;
    textxalign?: string;
    paddingwidth?: number;
    paddingheight?: number;
    backgroundcolor?: string;
    [key: string]: unknown;
  }
  const bwipjs: {
    toSVG(opts: BwipOptions): string;
    toBuffer(opts: BwipOptions): Promise<Buffer>;
  };
  export default bwipjs;
}
