import * as THREE from 'three';

export interface FaceLandmark {
x: number;
y: number;
z: number;
visibility?: number;
}

export interface Transform {
position: {
  x: number;
  y: number;
  z: number;
};
rotation: {
  x: number;
  y: number;
  z: number;
  order?: string;
};
scale: {
  x: number;
  y: number;
  z: number;
};
}

export interface Bounds {
minX: number;
minY: number;
maxX: number;
maxY: number;
}

export interface FaceFrame {
time: number;
bounds: Bounds;
transform: Transform;
// landmarks: FaceLandmark[];
}

export interface FaceMetadata {
timestamp: number;
fps: number;
totalFrames: number;
frames: FaceFrame[];
averageBounds: Bounds;
clippingPlane: {
  position: {
    x: number;
    y: number;
    z: number;
  };
  rotation: {
    y: number;
  };
  normal: {
    x: number;
    y: number;
    z: number;
  };
  constant: number;
};
}

export interface MeshRecordFrame {
time: number;
positions: Float32Array;
indices: Uint16Array;
uvs: Float32Array;
transform: Transform;
}

export interface ThreeSetup {
scene: THREE.Scene;
camera: THREE.PerspectiveCamera;
renderer: THREE.WebGLRenderer;
controls: any; // OrbitControls type
clippingPlane: THREE.Plane;
hidingPlane: THREE.Mesh;
}

export interface RecordingFormat {
mimeType: string;
container: string;
}

export interface VideoData {
video: HTMLVideoElement;
audioStream: MediaStream;
}
export interface PlaneControls {
  posX: number;
  posY: number;
  posZ: number;
  rotY: number;
  opacity: number;
  }

// Interfaces for the interchangeable face tracking implementations
export interface IFaceLandmark {
  x: number;
  y: number;
  z: number;
}

export interface IFaceDetectorStatus {
  isInitialized: boolean;
  isInitializing?: boolean;
  hasLandmarks: boolean;
  fps?: number;
  lastUpdateTime?: number;
  landmarkCount?: number;
  totalFacesDetected?: number;
}

export interface IFaceDetector {
  getLandmarks(): IFaceLandmark[];
  getTimeSinceLastUpdate(): number;
  getStatus(): IFaceDetectorStatus;
  cleanup(forceCleanup?: boolean): void;
  setUpdateThrottling?(interval: number): void;
}

export interface IFaceDetectorAPI extends IFaceDetector {
  setupFaceMeshDetector(
    video: HTMLVideoElement,
    canvas: HTMLCanvasElement | null,
    threeContext: any
  ): Promise<any>;
}