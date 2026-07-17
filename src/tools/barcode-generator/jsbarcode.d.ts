/**
 * Minimal local typings for jsbarcode (the package ships no types and there
 * is no @types/jsbarcode). Only the surface this tool uses is declared.
 */
declare module "jsbarcode" {
  interface JsBarcodeOptions {
    format?: string;
    /** Width of a single bar in px. */
    width?: number;
    /** Bar height in px. */
    height?: number;
    displayValue?: boolean;
    text?: string;
    fontOptions?: string;
    font?: string;
    textAlign?: "left" | "center" | "right";
    textPosition?: "top" | "bottom";
    textMargin?: number;
    fontSize?: number;
    background?: string;
    lineColor?: string;
    margin?: number;
    marginTop?: number;
    marginBottom?: number;
    marginLeft?: number;
    marginRight?: number;
    flat?: boolean;
    /** Called synchronously with false when the value fails format validation. */
    valid?: (valid: boolean) => void;
  }

  function JsBarcode(
    element: HTMLCanvasElement | HTMLImageElement | SVGElement | string,
    value: string,
    options?: JsBarcodeOptions,
  ): void;

  export default JsBarcode;
}
