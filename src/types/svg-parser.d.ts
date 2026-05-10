declare module 'svg-parser' {
  export interface SvgNode {
    type: string;
    tagName?: string;
    properties?: Record<string, string | number | boolean | undefined>;
    children?: SvgNode[];
    value?: string;
  }

  export function parse(svg: string): SvgNode;
}
