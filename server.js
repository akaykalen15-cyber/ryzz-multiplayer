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

const MAP_WIDTH = 2400;
const MAP_HEIGHT = 1600;

let orbs = [];

const orbTypes = [
    { color: '#fbbf24', value: 10, name: 'yellow', weight: 50 },
    { color: '#22c55e', value: 25, name: 'green', weight: 25 },
    { color: '#3b82f6', value: 50, name: 'blue', weight: 15 },
    { color: '#a855f7', value: 100, name: 'purple', weight: 10 }
];

function getRandomOrbType() {
    const totalWeight = orbTypes.reduce((sum, type) => sum + type.weight, 0);
    let random = Math.random() * totalWeight;
    let accumulated = 0;
    for (const type of orbTypes) {
        accumulated += type.weight;
        if (random <= accumulated) return type;
    }
    return orbTypes[0];
}

function generateOrbs(count) {
    for (let i = 0; i < count; i++) {
        const orbType = getRandomOrbType();
        orbs.push({
            id: Math.random().toString(36).substr(2, 8),
            x: Math.random() * MAP_WIDTH,
            y: Math.random() * MAP_HEIGHT,
            radius: 6,
            value: orbType.value,
            color: orbType.color,
            type: orbType.name
        });
    }
}

generateOrbs(150);

setInterval(() => {
    if (orbs.length < 100) {
        generateOrbs(25);
    } else {
        generateOrbs(5);
    }
}, 2000);

io.on('connection', (socket) => {
    console.log('Player connected:', socket.id);

    socket.on('joinGame', (data) => {
        const username = data.username;
        const password = data.password || '';
        
        let isAdmin = (username === ADMIN_NAME && password === ADMIN_PASSWORD);
        
        if (username === ADMIN_NAME && !isAdmin) {
            socket.emit('nameRejected', 'Invalid admin credentials!');
            return;
        }
        
        let nameTaken = false;
        for (let id in players) {
            if (players[id].username === username) {
                nameTaken = true;
                break;
            }
        }
        
        if (nameTaken) {
            socket.emit('nameRejected', 'Username already taken! Choose another.');
            return;
        }
        
        players[socket.id] = {
            id: socket.id,
            username: username,
            x: Math.random() * MAP_WIDTH,
            y: Math.random() * MAP_HEIGHT,
            radius: 20,
            score: 0,
            isAdmin: isAdmin,
            godMode: false
        };

        socket.emit('currentOrbs', orbs);
        socket.emit('currentPlayers', players);
        socket.broadcast.emit('newPlayer', players[socket.id]);
        updateLeaderboard();
        
        if (isAdmin) {
            socket.emit('adminConfirm', '👑 You are ADMIN! Type /help for commands');
        }
        
        console.log(`${username} joined${isAdmin ? ' as ADMIN' : ''}, orbs: ${orbs.length}`);
    });

    socket.on('playerMovement', (data) => {
        if (players[socket.id]) {
            players[socket.id].x = data.x;
            players[socket.id].y = data.y;
            socket.broadcast.emit('playerMoved', players[socket.id]);
        }
    });

    socket.on('collectOrb', (orbId) => {
        if (!players[socket.id]) return;
        
        const orbIndex = orbs.findIndex(o => o.id === orbId);
        if (orbIndex !== -1) {
            const orb = orbs[orbIndex];
            const points = orb.value;
            orbs.splice(orbIndex, 1);
            
            players[socket.id].score += points;
            players[socket.id].radius = Math.min(80, 20 + Math.floor(players[socket.id].score / 50));
            
            updateLeaderboard();
            io.emit('scoreUpdate', {
                id: socket.id,
                score: players[socket.id].score,
                radius: players[socket.id].radius
            });
            io.emit('orbCollected', orbId);
            
            io.emit('chatMessage', {
                username: 'System',
                message: `${players[socket.id].username} earned +${points} points!`,
                isSystem: true
            });
        }
    });

    // 🍽️ PLAYER EATING LOGIC
    socket.on('eatPlayer', (targetId) => {
        if (!players[socket.id] || !players[targetId]) return;
        if (socket.id === targetId) return;
        
        const eater = players[socket.id];
        const target = players[targetId];
        
        // Don't eat admins if not admin
        if (target.isAdmin && !eater.isAdmin) return;
        
        // Check if eater is bigger (radius comparison)
        const eaterSize = eater.radius;
        const targetSize = target.radius;
        
        // You need to be at least 10% bigger to eat someone
        if (eaterSize > targetSize * 1.1) {
            // EAT! Give points to eater
            const pointsGained = Math.floor(target.score / 2) + 50;
            eater.score += pointsGained;
            eater.radius = Math.min(80, 20 + Math.floor(eater.score / 50));
            
            // Announce the kill
            io.emit('chatMessage', {
                username: 'System',
                message: `🍽️ ${eater.username} ate ${target.username}! +${pointsGained} points`,
                isSystem: true
            });
            
            // Respawn target at random location with reduced score
            target.score = Math.floor(target.score / 3);
            target.radius = Math.max(20, 20 + Math.floor(target.score / 50));
            target.x = Math.random() * MAP_WIDTH;
            target.y = Math.random() * MAP_HEIGHT;
            
            // Update everyone
            updateLeaderboard();
            io.emit('scoreUpdate', {
                id: socket.id,
                score: eater.score,
                radius: eater.radius
            });
            io.emit('scoreUpdate', {
                id: targetId,
                score: target.score,
                radius: target.radius
            });
            io.emit('playerMoved', target);
        }
    });

    socket.on('chatMessage', (data) => {
        if (!players[socket.id]) return;
        
        const sender = players[socket.id];
        
        if (data.message.startsWith('/') && sender.isAdmin) {
            processAdminCommand(socket, data.message);
        } else {
            io.emit('chatMessage', {
                username: sender.username,
                message: data.message,
                isAdmin: sender.isAdmin,
                isSystem: false
            });
        }
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
    let list = [];
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

function processAdminCommand(socket, command) {
    const parts = command.trim().split(' ');
    const cmd = parts[0].toLowerCase();
    const adminName = players[socket.id].username;
    
    switch(cmd) {
        case '/help':
            socket.emit('chatMessage', { username: 'System', message: 'Commands: /kick [name], /clear, /god, /list, /orbs', isSystem: true });
            break;
        case '/kick':
            if (parts.length < 2) {
                socket.emit('chatMessage', { username: 'System', message: 'Usage: /kick [username]', isSystem: true });
                return;
            }
            const targetName = parts.slice(1).join(' ');
            for (let id in players) {
                if (players[id].username === targetName && !players[id].isAdmin) {
                    io.to(id).emit('kicked', `Kicked by admin ${adminName}`);
                    io.sockets.sockets.get(id)?.disconnect();
                    delete players[id];
                    io.emit('chatMessage', { username: 'System', message: `${targetName} was kicked`, isSystem: true });
                    updateLeaderboard();
                    break;
                }
            }
            break;
        case '/clear':
            for (let id in players) {
                if (!players[id].isAdmin) {
                    io.to(id).emit('kicked', 'Server cleared by admin');
                    io.sockets.sockets.get(id)?.disconnect();
                    delete players[id];
                }
            }
            io.emit('chatMessage', { username: 'System', message: 'All non-admin players cleared', isSystem: true });
            updateLeaderboard();
            break;
        case '/god':
            players[socket.id].godMode = !players[socket.id].godMode;
            socket.emit('chatMessage', { username: 'System', message: `God mode ${players[socket.id].godMode ? 'ON' : 'OFF'}`, isSystem: true });
            break;
        case '/list':
            let list = [];
            for (let id in players) {
                list.push(`${players[id].username}${players[id].isAdmin ? '👑' : ''} (${players[id].score})`);
            }
            socket.emit('chatMessage', { username: 'System', message: `Online: ${list.join(', ')}`, isSystem: true });
            break;
        case '/orbs':
            socket.emit('chatMessage', { username: 'System', message: `${orbs.length} orbs on map | 🟡10 🟢25 🔵50 🟣100`, isSystem: true });
            break;
        default:
            socket.emit('chatMessage', { username: 'System', message: `Unknown command: ${cmd}. Type /help`, isSystem: true });
    }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ RYZZ.io server running on port ${PORT}`);
    console.log(`👑 Admin name: ${ADMIN_NAME}`);
    console.log(`🔒 Admin password required`);
});
