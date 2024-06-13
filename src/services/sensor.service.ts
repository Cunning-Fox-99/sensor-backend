import { redisClient } from '../utils/redisClient';
import { Sensor, SensorData, Vector3 } from '../models/sensor.model';
import { v4 as uuidv4 } from 'uuid';

const sensors: Sensor[] = [];
const SAFE_ZONE_SIZE = parseFloat(process.env.SAFE_ZONE_SIZE || '500');

const getRandomValue = (min: number, max: number) => Math.random() * (max - min) + min;

const createRandomSensor = (name: string): Sensor => {
    const position: Vector3 = {
        x: getRandomValue(parseFloat(process.env.SENSOR_POSITION_MIN || '-1000'), parseFloat(process.env.SENSOR_POSITION_MAX || '1000')),
        y: getRandomValue(parseFloat(process.env.SENSOR_POSITION_MIN || '-1000'), parseFloat(process.env.SENSOR_POSITION_MAX || '1000')),
        z: getRandomValue(parseFloat(process.env.SENSOR_POSITION_MIN || '-1000'), parseFloat(process.env.SENSOR_POSITION_MAX || '1000')),
    };

    const waterSpeed: Vector3 = {
        x: getRandomValue(parseFloat(process.env.WATER_SPEED_MIN || '-5'), parseFloat(process.env.WATER_SPEED_MAX || '5')),
        y: getRandomValue(parseFloat(process.env.WATER_SPEED_MIN || '-5'), parseFloat(process.env.WATER_SPEED_MAX || '5')),
        z: getRandomValue(parseFloat(process.env.WATER_SPEED_MIN || '-5'), parseFloat(process.env.WATER_SPEED_MAX || '5')),
    };

    const thrustersSpeed: Vector3 = { x: -waterSpeed.x, y: -waterSpeed.y, z: -waterSpeed.z };
    const temperature = getRandomValue(parseFloat(process.env.WATER_TEMPERATURE_MIN || '-2'), parseFloat(process.env.WATER_TEMPERATURE_MAX || '30'));

    return {
        id: uuidv4(),
        name,
        position,
        waterSpeed,
        thrustersSpeed,
        temperature,
        lost: false
    };
};

export const initSensors = async () => {
    const sensorNames = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta', 'iota', 'kappa', 'lambda', 'mu'];
    console.log(sensorNames)
    for (const name of sensorNames) {
        const sensor = createRandomSensor(name);
        sensors.push(sensor);
        await redisClient.hSet('sensors', sensor.id, JSON.stringify(sensor));
    }
};

export const getSensorData = (): SensorData[] => sensors.map(sensor => ({
    id: sensor.id,
    name: sensor.name,
    position: sensor.position,
    waterSpeed: sensor.waterSpeed,
    thrustersSpeed: sensor.thrustersSpeed,
    temperature: sensor.temperature,
    lost: sensor.lost
}));

export const updateThrusterSpeed = async (name: string, increment: Partial<Vector3>) => {
    const sensor = sensors.find(sensor => sensor.name === name);
    if (!sensor) throw new Error('Sensor not found');

    sensor.thrustersSpeed = {
        x: (increment.x !== undefined) ? sensor.thrustersSpeed.x + increment.x : sensor.thrustersSpeed.x,
        y: (increment.y !== undefined) ? sensor.thrustersSpeed.y + increment.y : sensor.thrustersSpeed.y,
        z: (increment.z !== undefined) ? sensor.thrustersSpeed.z + increment.z : sensor.thrustersSpeed.z
    };

    await redisClient.hSet('sensors', sensor.id, JSON.stringify(sensor));
};
