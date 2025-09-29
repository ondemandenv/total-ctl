declare module 'delaunator' {
  export default class Delaunator {
      static from(points: number[][]): Delaunator;
      triangles: Uint32Array;
      halfedges: Int32Array;
      hull: Uint32Array;
      points: number[][];
      coords: number[];
      update(): void;
      constructor(points: number[]);
    }
  }