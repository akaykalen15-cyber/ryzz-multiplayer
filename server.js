const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

const ADMIN_NAME = 'RYZZ';

app.use(express.static(path.join(__dirname, 'public')));

let players = {};

const MAP_WIDTH = 2400;
const MAP_HEIGHT = 1600;

// Store orbs on server
let orbs = [];

function generateOrbs(count) {
    for (let i = 0; i < count; i++) {
        orbs.push({
            id: Math.random().toString(36).substr(2, 8),
            x: Math.random() * MAP_WIDTH,
            y: Math.random() * MAP_HEIGHT,
            radius: 6,
            value: 10
        });
    }
}

// Initial orbs
generateOrbs(80);

// Respawn orbs over time
setInterval(() => {
    if (orbs.length < 60) {
        generateOrbs(10);
    }
}, 3000);

io.on('connection', (socket) => {
    console.log('Player connected:', socket.id);

    socket.on('joinGame', (username) => {
        let isAdmin = (username === ADMIN_NAME);
        
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

        // Send orbs to new player
        socket.emit('currentOrbs', orbs);
        
        // Send current players
        socket.emit('currentPlayers', players);
        
        // Tell everyone about new player
        socket.broadcast.emit('newPlayer', players[socket.id]);
        
        // Update leaderboard
        updateLeaderboard();
        
        if (isAdmin) {
            socket.emit('adminConfirm', '👑 You are ADMIN! Type /help for commands');
        }
        
        console.log(`${username} joined${isAdmin ? ' as ADMIN' : ''}`);
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
        
        // Find and remove the orb
        const orbIndex = orbs.findIndex(o => o.id === orbId);
        if (orbIndex !== -1) {
            orbs.splice(orbIndex, 1);
            
            // Add score
            players[socket.id].score += 10;
            players[socket.id].radius = Math.min(80, 20 + Math.floor(players[socket.id].score / 50));
            
            // Update everyone
            updateLeaderboard();
            io.emit('scoreUpdate', {
                id: socket.id,
                score: players[socket.id].score,
                radius: players[socket.id].radius
            });
            
            // Tell everyone about removed orb
            io.emit('orbCollected', orbId);
        }
    });

    socket.on('chatMessage', (data) => {
        if (!players[socket.id]) return;
        
        const sender = players[socket.id];
        
        if (data.message.startsWith('/') && sender.isAdmin) {
            processAdminCommand(socket, data.message);
        } else {
            // Broadcast to ALL players including sender
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
            socket.emit('chatMessage', { username: 'System', message: `${orbs.length} orbs on the map`, isSystem: true });
            break;
        default:
            socket.emit('chatMessage', { username: 'System', message: `Unknown command: ${cmd}. Type /help`, isSystem: true });
    }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ RYZZ.io server running on port ${PORT}`);
    console.log(`👑 Admin username: ${ADMIN_NAME}`);
});
