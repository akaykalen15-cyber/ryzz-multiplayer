const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

const ADMIN_NAME = 'RYZZ';
const ADMIN_PASSWORD = 'ryzzking2024';

app.use(express.static(path.join(__dirname, 'public')));

let players = {};

// 🗺️ MUCH LARGER MAP - 4000x4000 (was 2000x2000)
const MAP_WIDTH = 4000;
const MAP_HEIGHT = 4000;

let orbs = [];

function generateOrbs(count) {
    for (let i = 0; i < count; i++) {
        orbs.push({
            id: Math.random().toString(36).substr(2, 8),
            x: Math.random() * MAP_WIDTH,
            y: Math.random() * MAP_HEIGHT,
            radius: 8,
            value: 10,
            color: '#fbbf24'
        });
    }
    console.log(`Total orbs: ${orbs.length}`);
}

// Start with 300 orbs on large map
generateOrbs(300);

// Faster orb respawn for large map
setInterval(() => {
    if (orbs.length < 200) {
        generateOrbs(50);
        console.log(`Low on orbs (${orbs.length}), generated 50 more`);
    }
}, 1500);

io.on('connection', (socket) => {
    console.log('Player connected:', socket.id);

    socket.on('joinGame', (data) => {
        const username = data.username;
        const password = data.password || '';
        const isAdmin = (username === ADMIN_NAME && password === ADMIN_PASSWORD);
        
        for (let id in players) {
            if (players[id].username === username) {
                socket.emit('nameRejected', 'Username already taken!');
                return;
            }
        }
        
        players[socket.id] = {
            id: socket.id,
            username: username,
            x: Math.random() * MAP_WIDTH,
            y: Math.random() * MAP_HEIGHT,
            radius: 20,
            score: 0,
            isAdmin: isAdmin
        };
        
        socket.emit('currentOrbs', orbs);
        socket.emit('currentPlayers', players);
        socket.emit('adminConfirm', isAdmin);
        socket.broadcast.emit('newPlayer', players[socket.id]);
        updateLeaderboard();
        
        console.log(`${username} joined at (${players[socket.id].x.toFixed(0)}, ${players[socket.id].y.toFixed(0)})`);
    });
    
    socket.on('playerMovement', (data) => {
        if (players[socket.id]) {
            players[socket.id].x = data.x;
            players[socket.id].y = data.y;
            socket.broadcast.emit('playerMoved', players[socket.id]);
        }
    });
    
    socket.on('collectOrb', (orbId) => {
        const player = players[socket.id];
        if (!player) return;
        
        const orbIndex = orbs.findIndex(o => o.id === orbId);
        if (orbIndex === -1) return;
        
        const orb = orbs[orbIndex];
        orbs.splice(orbIndex, 1);
        
        player.score += orb.value;
        player.radius = Math.min(120, 20 + Math.floor(player.score / 60));
        
        console.log(`${player.username} collected orb! Score: ${player.score}`);
        
        updateLeaderboard();
        io.emit('scoreUpdate', {
            id: socket.id,
            score: player.score,
            radius: player.radius
        });
        io.emit('orbCollected', orbId);
    });
    
    socket.on('chatMessage', (data) => {
        const player = players[socket.id];
        if (!player) return;
        
        io.emit('chatMessage', {
            username: player.username,
            message: data.message,
            isAdmin: player.isAdmin
        });
    });
    
    socket.on('disconnect', () => {
        if (players[socket.id]) {
            io.emit('playerDisconnected', socket.id);
            delete players[socket.id];
            updateLeaderboard();
            console.log('Player disconnected:', socket.id);
        }
    });
});

function updateLeaderboard() {
    const list = [];
    for (let id in players) {
        list.push({
            username: players[id].username,
            score: players[id].score,
            isAdmin: players[id].isAdmin
        });
    }
    list.sort((a, b) => b.score - a.score);
    io.emit('leaderboardUpdate', list.slice(0, 10));
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`🗺️ Map size: ${MAP_WIDTH}x${MAP_HEIGHT}`);
});
