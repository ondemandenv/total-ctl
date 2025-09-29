declare module 'colorthief' {
  export default class ColorThief {
    /**
     * Gets the dominant color from an image.
     * @param sourceImage - Image element or canvas
     * @param quality - Optional. The quality level (0 = fast, 10 = good, defaults to 10)
     * @returns RGB array with the dominant color [r, g, b]
     */
    getColor(sourceImage: HTMLImageElement | HTMLCanvasElement, quality?: number): [number, number, number];
  }
}