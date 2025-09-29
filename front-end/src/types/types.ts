import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

export interface PlaneControls {
  posX: number;
  posY: number;
  posZ: number;
  rotY: number;
  opacity: number;
}

export interface ThreeJSContext {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
  faceMesh?: THREE.Mesh;
  videoTexture?: THREE.VideoTexture;
  clippingPlane: THREE.Plane;
  hidingPlane: THREE.Mesh;
}

export interface Vector3Data {
  x: number;
  y: number;
  z: number;
}

export interface Transform {
  position: Vector3Data;
  rotation: {
    x: number;
    y: number;
    z: number;
    order: string;
  };
  scale: Vector3Data;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface Landmark {
  x: number;
  y: number;
  z: number;
}

export interface ExportResult {
  glbBlob: Blob
  processedVideoBlob: Blob
}

export interface MeshFrame {
  time: number;
  positions: Float32Array;
  indices: number[];
  uvs: number[];
  transform: Transform;
  landmarks: Landmark[];
}

export interface FaceFrame {
  time: number;
  bounds: Bounds;
  transform: Transform;
  // landmarks: Landmark[];
}

export interface ClippingPlaneData {
  position: Vector3Data;
  rotation: { y: number };
  normal: Vector3Data;
  constant: number;
}

export interface FaceMetadata {
  timestamp: number;
  uuid?: string | undefined;
  fps: number;
  totalFrames: number;
  clippingPlane: {
    position: Vector3Data;
    rotation: { y: number };
    normal: Vector3Data;
    constant: number;
  };
  frames: Array<{
    time: number;
    transform: {
      position: Vector3Data;
      rotation: {
        x: number;
        y: number;
        z: number;
        order: string;
      };
      scale: Vector3Data;
    }
     bounds: Bounds  
  }>;
  averageBounds: Bounds  
}

export interface RecordingFrame {
  meshRecordedFrames: MeshFrame[];
  faceFrame: FaceFrame;
}

export interface ExportOptions {
  binary?: boolean;
  animations?: THREE.AnimationClip[];
  includeCustomExtensions?: boolean;
}

export interface RecordingState {
  recordedChunks: Blob[];
  meshRecordedFrames: MeshFrame[];
  mediaRecorder?: MediaRecorder;
  faceMetadata?: FaceMetadata;
  recordingUuid?: string;
}
export interface RecordingFrameResult {
  meshRecordedFrames: MeshFrame[];
  faceFrame?: FaceFrame;
}
export interface AudioConfig {
  audioContext?: AudioContext;
  audioDestination?: MediaStreamAudioDestinationNode;
  globalAudioStream?: MediaStream;
}