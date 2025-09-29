/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AWS_ACCESS_KEY_ID: string
  readonly VITE_AWS_SECRET_ACCESS_KEY: string
  readonly VITE_AWS_SESSION_TOKEN: string
  readonly VITE_S3_BUCKET: string
  readonly VITE_AWS_REGION: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare namespace THREE {
  export class Mesh {
    // Basic mesh properties - this is a minimal definition
    geometry: any;
    material: any;
    position: any;
    rotation: any;
    scale: any;
  }
}
