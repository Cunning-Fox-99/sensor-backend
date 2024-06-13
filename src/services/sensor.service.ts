import {redisClient} from '../utils/redisClient';
import {Sensor, Vector3} from '../models/sensor.model';
import {v4 as uuidv4} from 'uuid';

const sensors: Sensor[] = [];
const SAFE_ZONE_SIZE = parseFloat(process.env.SAFE_ZONE_SIZE || '500');

const getRandomValue = (min: number, max: number) => Math.floor(Math.random() * (max - min) + min);

const calculateTimeToExit = (position: Vector3, speed: Vector3): number => {
    const timeToBoundary = (axisPos: number, axisSpeed: number) => {
        if (axisSpeed === 0) {
            return Infinity; // Если скорость равна нулю, время до выхода считаем бесконечностью
        }
        return (SAFE_ZONE_SIZE - Math.abs(axisPos)) / Math.abs(axisSpeed);
    };

    const timeX = timeToBoundary(position.x, speed.x);
    const timeY = timeToBoundary(position.y, speed.y);
    const timeZ = timeToBoundary(position.z, speed.z);

    return Math.floor(Math.min(timeX, timeY, timeZ));
};

const createRandomSensor = (name: string): Sensor => {
    const minPosition = SAFE_ZONE_SIZE / 2 - 20;
    const maxPosition = SAFE_ZONE_SIZE / 2 + 20;

    const position: Vector3 = {
        x: Math.round(getRandomValue(minPosition, maxPosition)),
        y: Math.round(getRandomValue(minPosition, maxPosition)),
        z: Math.round(getRandomValue(minPosition, maxPosition)),
    };

    // Генерация случайных скоростей
    let waterSpeed: Vector3;
    let thrustersSpeed: Vector3;

    do {
        waterSpeed = {
            x: getRandomValue(parseFloat(process.env.WATER_SPEED_MIN || '1'), parseFloat(process.env.WATER_SPEED_MAX || '20')),
            y: getRandomValue(parseFloat(process.env.WATER_SPEED_MIN || '1'), parseFloat(process.env.WATER_SPEED_MAX || '20')),
            z: getRandomValue(parseFloat(process.env.WATER_SPEED_MIN || '1'), parseFloat(process.env.WATER_SPEED_MAX || '20')),
        };

        thrustersSpeed = {
            x: getRandomValue(parseFloat(process.env.WATER_SPEED_MIN || '1'), parseFloat(process.env.WATER_SPEED_MAX || '20')),
            y: getRandomValue(parseFloat(process.env.WATER_SPEED_MIN || '1'), parseFloat(process.env.WATER_SPEED_MAX || '20')),
            z: getRandomValue(parseFloat(process.env.WATER_SPEED_MIN || '1'), parseFloat(process.env.WATER_SPEED_MAX || '20')),
        };
    } while (waterSpeed.x === thrustersSpeed.x && waterSpeed.y === thrustersSpeed.y && waterSpeed.z === thrustersSpeed.z); // Проверка, чтобы скорости были различными

    const temperature = getRandomValue(parseFloat(process.env.WATER_TEMPERATURE_MIN || '-2'), parseFloat(process.env.WATER_TEMPERATURE_MAX || '30'));
    const timeToExit = calculateTimeToExit(position, {
        x: waterSpeed.x + thrustersSpeed.x,
        y: waterSpeed.y + thrustersSpeed.y,
        z: waterSpeed.z + thrustersSpeed.z
    });

    return {
        id: uuidv4(),
        name,
        position,
        waterSpeed,
        thrustersSpeed,
        temperature,
        lost: false,
        timeToExit: Math.max(timeToExit, 0) // Убедимся, что время до выхода не отрицательное
    };
};


export const initSensors = async () => {
    const sensorNames = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta', 'iota', 'kappa', 'lambda', 'mu'];

    for (const name of sensorNames) {
        const sensorData = await redisClient.hGet('sensors', name);

        if (sensorData) {
            const sensor: Sensor = JSON.parse(sensorData);
            sensors.push(sensor);
        } else {
            const sensor = createRandomSensor(name);
          //  console.log(sensor);
            if (sensor.timeToExit <= 0) {
                sensor.lost = true; // Установить флаг потери только если сенсор уже за пределами SAFE_ZONE_SIZE
            }
            sensors.push(sensor);
            await redisClient.hSet('sensors', sensor.id, JSON.stringify(sensor));
        }
    }
};

export const getSensorData = (): Sensor[] => sensors;

export const updateThrusterSpeed = async (name: string, increment: Partial<Vector3>) => {
    const sensor = sensors.find(sensor => sensor.name === name);
    if (!sensor) throw new Error('Sensor not found');

    sensor.thrustersSpeed = {
        x: (increment.x !== undefined) ? increment.x : sensor.thrustersSpeed.x,
        y: (increment.y !== undefined) ? increment.y : sensor.thrustersSpeed.y,
        z: (increment.z !== undefined) ? increment.z : sensor.thrustersSpeed.z
    };

    await redisClient.hSet('sensors', sensor.id, JSON.stringify(sensor)); // Обновление данных в Redis
};

export const updateSensorData = async () => {
    for (const sensor of sensors) {
        if (sensor.lost) continue;

        const newPosition = {
            x: sensor.position.x + sensor.waterSpeed.x + sensor.thrustersSpeed.x,
            y: sensor.position.y + sensor.waterSpeed.y + sensor.thrustersSpeed.y,
            z: sensor.position.z + sensor.waterSpeed.z + sensor.thrustersSpeed.z
        };

        sensor.temperature = getRandomValue(parseFloat(process.env.WATER_TEMPERATURE_MIN || '-2'), parseFloat(process.env.WATER_TEMPERATURE_MAX || '30'));
        sensor.position = newPosition;

        // Определение направления движения
        const movingTowardsSafeZone = newPosition.x >= SAFE_ZONE_SIZE &&
            newPosition.y >= SAFE_ZONE_SIZE &&
            newPosition.z >= SAFE_ZONE_SIZE;

        const movingTowardsZero = newPosition.x <= 0 &&
            newPosition.y <= 0 &&
            newPosition.z <= 0;

        let timeToExit = Infinity;

        if (movingTowardsSafeZone) {
            // Сенсор движется к границе SAFE_ZONE_SIZE
            timeToExit = calculateTimeToExit(sensor.position, {
                x: sensor.waterSpeed.x + sensor.thrustersSpeed.x,
                y: sensor.waterSpeed.y + sensor.thrustersSpeed.y,
                z: sensor.waterSpeed.z + sensor.thrustersSpeed.z
            });
        } else if (movingTowardsZero) {
            // Сенсор движется к границе 0 или меньше
            timeToExit = calculateTimeToExit(sensor.position, {
                x: -sensor.waterSpeed.x - sensor.thrustersSpeed.x,
                y: -sensor.waterSpeed.y - sensor.thrustersSpeed.y,
                z: -sensor.waterSpeed.z - sensor.thrustersSpeed.z
            });
        } else {
            // Сенсор находится где-то посередине, считаем до ближайшей границы
            const distanceToSafeZone = Math.min(
                SAFE_ZONE_SIZE - newPosition.x,
                SAFE_ZONE_SIZE - newPosition.y,
                SAFE_ZONE_SIZE - newPosition.z
            );

            const distanceToZero = Math.min(
                newPosition.x,
                newPosition.y,
                newPosition.z
            );

            if (distanceToSafeZone <= distanceToZero) {
                timeToExit = calculateTimeToExit(sensor.position, {
                    x: sensor.waterSpeed.x + sensor.thrustersSpeed.x,
                    y: sensor.waterSpeed.y + sensor.thrustersSpeed.y,
                    z: sensor.waterSpeed.z + sensor.thrustersSpeed.z
                });
            } else {
                timeToExit = calculateTimeToExit(sensor.position, {
                    x: -sensor.waterSpeed.x - sensor.thrustersSpeed.x,
                    y: -sensor.waterSpeed.y - sensor.thrustersSpeed.y,
                    z: -sensor.waterSpeed.z - sensor.thrustersSpeed.z
                });
            }
        }

        sensor.timeToExit = Math.max(timeToExit, 0);

        if (sensor.timeToExit === 0) {
            sensor.lost = true;
        }

        await redisClient.hSet('sensors', sensor.id, JSON.stringify(sensor)); // Сохранение обновленных данных в Redis
    }
};

