// index.ts

import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import { json } from 'body-parser';
import { initSensors, getSensorData, updateThrusterSpeed, updateSensorData } from './services/sensor.service';
import { redisClient } from './utils/redisClient';
import cors from 'cors';

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(json());

// API endpoint для обновления скорости двигателей
app.post('/sensor/:name/thruster', async (req, res) => {
    const { name } = req.params;
    const { x, y, z } = req.body;

    try {
        await updateThrusterSpeed(name, { x, y, z });
        res.status(200).send('Thruster speed updated');
    } catch (error) {
        console.error('Error updating thruster speed:', error);
        res.status(500).send('Error updating thruster speed');
    }
});

// WebSocket для передачи данных датчиков
io.on('connection', (socket) => {
    console.log('Client connected');
    socket.emit('data', getSensorData());

    socket.on('disconnect', () => {
        console.log('Client disconnected');
    });
});

const startServer = async () => {
    await redisClient.connect();
    await initSensors();

    const tickInterval = parseInt(process.env.TICK_INTERVAL || '1000', 10);
    setInterval(async () => {
        await updateSensorData(); // Вызов функции для обновления данных о сенсорах
        const data = getSensorData();
        io.emit('data', data);
    }, tickInterval);

    server.listen(3000, () => {
        console.log('Server is running on port 3000');
    });
};

startServer().catch((err) => {
    console.error('Error starting server:', err);
});
