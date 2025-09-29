export type LayerType = 'normal' | 'hero' | 'mask' | 'starfield';
export type Axis = 'x' | 'y' | 'z';

export interface Vector3Like {
x: number;
y: number;
z: number;
}

export interface LayerData {
path: string;
position: { x: number; y: number; z: number };
scale: number;
layerType: LayerType;
renderOrder: number;
alphaTest: number;
}

export interface GroundPlaneData {
path: string;
position: Vector3Like;
rotation: Vector3Like;
scale: number;
renderOrder: number;
}

export interface CameraSettings {
position: Vector3Like;
sensitivity: number;
lookAtDistance: number;
}

export interface CharacterData {
name: string;
backgroundColor: string;
groundPlane?: GroundPlaneData;
layers: LayerData[];
cameraSettings?: CameraSettings;
}

export interface LayerObject {
mesh: THREE.Mesh;
intensity: number;
id: string;
layerIndex: number;
}