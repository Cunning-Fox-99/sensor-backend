export interface Vector3 {
    x: number;
    y: number;
    z: number;
}

export interface Sensor {
    id: string;
    name: string;
    position: Vector3;
    waterSpeed: Vector3;
    thrustersSpeed: Vector3;
    temperature: number;
    lost: boolean;
    timeToExit: number; // Новое поле для времени до выхода
}
