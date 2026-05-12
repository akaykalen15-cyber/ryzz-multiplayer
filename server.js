const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

// Admin username - YOU!
const ADMIN_NAME = 'RYZZ';

app.use(express.static(path.join(__dirname, 'public')));

let players = {};
let leaderboard = [];

// Game constants
const MAP_WIDTH = 2400;
const MAP_HEIGHT = 1600;

io.on('connection', (socket) => {
    console.log('Player connected:', socket.id);

    // Player joins with username
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

        // Send current players to new player
        socket.emit('currentPlayers', players);
        
        // Tell everyone about new player
        socket.broadcast.emit('newPlayer', players[socket.id]);
        
        // Update leaderboard for everyone
        updateLeaderboard();
        
        if (isAdmin) {
            socket.emit('adminConfirm', '👑 You are ADMIN! Type /help for commands');
        }
        
        console.log(`${username} joined the game${isAdmin ? ' as ADMIN!' : ''}`);
    });

    // Handle player movement
    socket.on('playerMovement', (data) => {
        if (players[socket.id]) {
            players[socket.id].x = data.x;
            players[socket.id].y = data.y;
            socket.broadcast.emit('playerMoved', players[socket.id]);
        }
    });

    // Handle chat message
    socket.on('chatMessage', (data) => {
        if (!players[socket.id]) return;
        
        let sender = players[socket.id];
        
        // Check for admin commands
        if (data.message.startsWith('/') && sender.isAdmin) {
            processAdminCommand(socket, data.message);
        } else {
            // Broadcast chat to everyone
            io.emit('chatMessage', {
                username: sender.username,
                message: data.message,
                isAdmin: sender.isAdmin,
                isSystem: false
            });
        }
    });

    // Handle orb collection (score update)
    socket.on('collectOrb', (value) => {
        if (players[socket.id]) {
            players[socket.id].score += value;
            players[socket.id].radius = Math.min(80, 20 + Math.floor(players[socket.id].score / 50));
            updateLeaderboard();
            io.emit('scoreUpdate', {
                id: socket.id,
                score: players[socket.id].score,
                radius: players[socket.id].radius
            });
        }
    });

    // Handle player disconnect
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
    leaderboard = list.slice(0, 10);
    io.emit('leaderboardUpdate', leaderboard);
}

function processAdminCommand(socket, command) {
    let parts = command.trim().split(' ');
    let cmd = parts[0].toLowerCase();
    let adminName = players[socket.id].username;
    
    if (cmd === '/help') {
        socket.emit('chatMessage', {
            username: 'System',
            message: 'Commands: /kick [name], /clear, /god, /heal, /list',
            isSystem: true,
            isAdmin: false
        });
    }
    else if (cmd === '/kick') {
        if (parts.length < 2) {
            socket.emit('chatMessage', { username: 'System', message: 'Usage: /kick [username]', isSystem: true });
            return;
        }
        let targetName = parts.slice(1).join(' ');
        if (targetName === ADMIN_NAME) {
            socket.emit('chatMessage', { username: 'System', message: 'You cannot kick yourself!', isSystem: true });
            return;
        }
        for (let id in players) {
            if (players[id].username === targetName) {
                io.to(id).emit('kicked', `You were kicked by admin ${adminName}`);
                io.sockets.sockets.get(id)?.disconnect();
                delete players[id];
                io.emit('chatMessage', { username: 'System', message: `🔨 ${targetName} was kicked by ${adminName}`, isSystem: true });
                updateLeaderboard();
                break;
            }
        }
    }
    else if (cmd === '/clear') {
        for (let id in players) {
            if (!players[id].isAdmin) {
                io.to(id).emit('kicked', 'Server cleared by admin');
                io.sockets.sockets.get(id)?.disconnect();
                delete players[id];
            }
        }
        io.emit('chatMessage', { username: 'System', message: `🗑️ All non-admin players were cleared by ${adminName}`, isSystem: true });
        updateLeaderboard();
    }
    else if (cmd === '/god') {
        players[socket.id].godMode = !players[socket.id].godMode;
        let status = players[socket.id].godMode ? 'ACTIVATED' : 'DEACTIVATED';
        socket.emit('chatMessage', { username: 'System', message: `🛡️ GOD MODE ${status}!`, isSystem: true });
        io.emit('playerGodMode', { id: socket.id, godMode: players[socket.id].godMode });
    }
    else if (cmd === '/heal') {
        if (players[socket.id].radius < 20) {
            players[socket.id].radius = 20;
            socket.emit('chatMessage', { username: 'System', message: '💚 You have been healed!', isSystem: true });
        } else {
            socket.emit('chatMessage', { username: 'System', message: '💚 You are already healthy!', isSystem: true });
        }
    }
    else if (cmd === '/list') {
        let playerList = [];
        for (let id in players) {
            playerList.push(`${players[id].username}${players[id].isAdmin ? ' 👑' : ''} (${players[id].score} pts)`);
        }
        socket.emit('chatMessage', { username: 'System', message: `Online: ${playerList.join(', ')}`, isSystem: true });
    }
    else {
        socket.emit('chatMessage', { username: 'System', message: `Unknown command: ${cmd}. Type /help`, isSystem: true });
    }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ RYZZ.io server running on port ${PORT}`);
    console.log(`👑 Admin username: ${ADMIN_NAME}`);
});
