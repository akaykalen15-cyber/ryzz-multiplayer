const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);

const io = socketIO(server, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    pingTimeout: 60000,
    pingInterval: 25000,
    transports: ['websocket', 'polling']
});

server.timeout = 120000;
app.use(express.static(path.join(__dirname, 'public')));

const ADMIN_NAME = 'RYZZ';
const ADMIN_PASSWORD = 'ryzzking2024';

let players = {};
let bots = {};

const MAP_WIDTH = 4000;
const MAP_HEIGHT = 4000;
let orbs = [];

const botNames = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Echo', 'Zeta', 'Theta', 'Sigma', 'Omega', 'Nova', 'Rex', 'Luna', 'Orion', 'Atlas'];
const orbColors = ['#fbbf24', '#22c55e', '#3b82f6', '#a855f7'];
const orbValues = [10, 25, 50, 100];

// Generate orbs
function generateOrbs(count) {
    for (let i = 0; i < count; i++) {
        const idx = Math.floor(Math.random() * orbColors.length);
        orbs.push({
            id: Math.random().toString(36).substr(2, 8),
            x: Math.random() * MAP_WIDTH,
            y: Math.random() * MAP_HEIGHT,
            radius: 8,
            value: orbValues[idx],
            color: orbColors[idx]
        });
    }
    console.log(`Total orbs: ${orbs.length}`);
}

function generateBot() {
    const name = botNames[Math.floor(Math.random() * botNames.length)] + Math.floor(Math.random() * 99);
    const botId = 'bot_' + Math.random().toString(36).substr(2, 8);
    bots[botId] = {
        id: botId,
        username: name,
        x: Math.random() * MAP_WIDTH,
        y: Math.random() * MAP_HEIGHT,
        radius: 18,
        score: 50,
        isBot: true
    };
}

// START WITH 600 ORBS
generateOrbs(600);
for (let i = 0; i < 12; i++) {
    generateBot();
}

// INSTANT ORB RESPAWN - Every 0.8 seconds, keep map full
setInterval(() => {
    // Always keep at least 500 orbs on map
    if (orbs.length < 500) {
        generateOrbs(80);
    } else {
        // Even when full, add new ones continuously
        generateOrbs(25);
    }
}, 800);  // Every 0.8 seconds

// Bot respawn
setInterval(() => {
    const botCount = Object.keys(bots).length;
    if (botCount < 10) {
        generateBot();
    }
}, 10000);

// Bot AI movement - FAST
setInterval(() => {
    for (const id in bots) {
        const bot = bots[id];
        
        let nearestOrb = null;
        let nearestDist = Infinity;
        for (const orb of orbs) {
            const dx = bot.x - orb.x;
            const dy = bot.y - orb.y;
            const dist = dx * dx + dy * dy;
            if (dist < nearestDist) {
                nearestDist = dist;
                nearestOrb = orb;
            }
        }
        
        let nearestPlayer = null;
        let playerDist = Infinity;
        for (const pid in players) {
            const p = players[pid];
            const dx = bot.x - p.x;
            const dy = bot.y - p.y;
            const dist = dx * dx + dy * dy;
            if (dist < playerDist) {
                playerDist = dist;
                nearestPlayer = p;
            }
        }
        
        let moveX = 0, moveY = 0;
        
        if (nearestPlayer && playerDist < 122500) {
            const dist = Math.sqrt(playerDist);
            if (bot.radius > nearestPlayer.radius + 10) {
                const dx = nearestPlayer.x - bot.x;
                const dy = nearestPlayer.y - bot.y;
                const len = dist;
                if (len > 0) {
                    moveX = (dx / len) * 6;
                    moveY = (dy / len) * 6;
                }
            } else if (nearestPlayer.radius > bot.radius + 10) {
                const dx = bot.x - nearestPlayer.x;
                const dy = bot.y - nearestPlayer.y;
                const len = dist;
                if (len > 0) {
                    moveX = (dx / len) * 7.5;
                    moveY = (dy / len) * 7.5;
                }
            }
        }
        
        if (moveX === 0 && moveY === 0 && nearestOrb) {
            const dx = nearestOrb.x - bot.x;
            const dy = nearestOrb.y - bot.y;
            const len = Math.hypot(dx, dy);
            if (len > 0) {
                moveX = (dx / len) * 5;
                moveY = (dy / len) * 5;
            }
        }
        
        moveX += (Math.random() - 0.5) * 2;
        moveY += (Math.random() - 0.5) * 2;
        
        bot.x += moveX;
        bot.y += moveY;
        bot.x = Math.min(Math.max(bot.x, bot.radius + 5), MAP_WIDTH - bot.radius - 5);
        bot.y = Math.min(Math.max(bot.y, bot.radius + 5), MAP_HEIGHT - bot.radius - 5);
        
        for (let i = 0; i < orbs.length; i++) {
            const orb = orbs[i];
            const dx = bot.x - orb.x;
            const dy = bot.y - orb.y;
            if (dx * dx + dy * dy < (bot.radius + orb.radius) ** 2) {
                bot.score += orb.value;
                bot.radius = Math.min(100, 18 + Math.floor(bot.score / 70));
                orbs.splice(i, 1);
                i--;
            }
        }
    }
    io.emit('updateBots', bots);
}, 40);

// Bot vs player collisions
setInterval(() => {
    for (const botId in bots) {
        const bot = bots[botId];
        for (const playerId in players) {
            const player = players[playerId];
            const dx = bot.x - player.x;
            const dy = bot.y - player.y;
            const distSq = dx * dx + dy * dy;
            const radiusSum = bot.radius + player.radius;
            
            if (distSq < radiusSum * radiusSum) {
                if (bot.radius > player.radius && !player.isAdmin) {
                    const gain = Math.floor(player.score / 3) + 60;
                    bot.score += gain;
                    bot.radius = Math.min(100, 18 + Math.floor(bot.score / 70));
                    player.score = Math.max(0, Math.floor(player.score / 2) - 20);
                    player.radius = Math.max(20, 20 + Math.floor(player.score / 60));
                    player.x = Math.random() * (MAP_WIDTH - 200) + 100;
                    player.y = Math.random() * (MAP_HEIGHT - 200) + 100;
                    io.emit('playerMoved', player);
                    io.emit('chatMessage', { username: 'System', message: `🤖 ${bot.username} ate ${player.username}!`, isSystem: true });
                    updateLeaderboard();
                } else if (player.radius > bot.radius) {
                    const gain = Math.floor(bot.score / 2) + 50;
                    player.score += gain;
                    player.radius = Math.min(120, 20 + Math.floor(player.score / 60));
                    io.emit('chatMessage', { username: 'System', message: `🍽️ ${player.username} ate ${bot.username}! +${gain}`, isSystem: true });
                    delete bots[botId];
                    generateBot();
                    updateLeaderboard();
                    break;
                }
            }
        }
    }
}, 100);

io.on('connection', (socket) => {
    console.log(`Player connected: ${socket.id}`);

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
        socket.emit('currentBots', bots);
        socket.emit('adminConfirm', isAdmin);
        socket.broadcast.emit('newPlayer', players[socket.id]);
        updateLeaderboard();
        
        console.log(`${username} joined (Admin: ${isAdmin})`);
    });
    
    socket.on('playerMovement', (data) => {
        const player = players[socket.id];
        if (player) {
            player.x = data.x;
            player.y = data.y;
            socket.broadcast.emit('playerMoved', player);
        }
    });
    
    socket.on('collectOrb', (orbId) => {
        const player = players[socket.id];
        if (!player) return;
        
        for (let i = 0; i < orbs.length; i++) {
            if (orbs[i].id === orbId) {
                const orb = orbs[i];
                orbs.splice(i, 1);
                
                player.score += orb.value;
                player.radius = Math.min(120, 20 + Math.floor(player.score / 60));
                
                updateLeaderboard();
                io.emit('scoreUpdate', {
                    id: socket.id,
                    score: player.score,
                    radius: player.radius
                });
                io.emit('orbCollected', orbId);
                return;
            }
        }
        socket.emit('orbCollectionFailed', orbId);
    });
    
    socket.on('eatPlayer', (targetId) => {
        const eater = players[socket.id];
        const target = players[targetId];
        if (!eater || !target) return;
        
        if (eater.radius > target.radius && !target.isAdmin) {
            const gain = Math.floor(target.score / 2) + 50;
            eater.score += gain;
            eater.radius = Math.min(120, 20 + Math.floor(eater.score / 60));
            
            target.score = Math.max(0, Math.floor(target.score / 3));
            target.radius = Math.max(20, 20 + Math.floor(target.score / 60));
            target.x = Math.random() * (MAP_WIDTH - 400) + 200;
            target.y = Math.random() * (MAP_HEIGHT - 400) + 200;
            
            updateLeaderboard();
            io.emit('scoreUpdate', { id: socket.id, score: eater.score, radius: eater.radius });
            io.emit('scoreUpdate', { id: targetId, score: target.score, radius: target.radius });
            io.emit('playerMoved', target);
            io.emit('chatMessage', { username: 'System', message: `🍽️ ${eater.username} ate ${target.username}! +${gain}`, isSystem: true });
        }
    });
    
    socket.on('chatMessage', (data) => {
        const player = players[socket.id];
        if (!player) return;
        
        if (data.message.startsWith('/') && player.isAdmin) {
            const parts = data.message.trim().split(' ');
            const cmd = parts[0].toLowerCase();
            
            switch(cmd) {
                case '/help':
                    socket.emit('chatMessage', { username: 'System', message: 'Commands: /kick [name], /clear, /list, /orbs, /bots', isSystem: true });
                    break;
                case '/kick':
                    if (parts.length < 2) return;
                    const targetName = parts.slice(1).join(' ');
                    for (const id in players) {
                        if (players[id].username === targetName && !players[id].isAdmin) {
                            io.to(id).emit('kicked', 'Kicked by admin');
                            delete players[id];
                            io.emit('chatMessage', { username: 'System', message: `${targetName} was kicked`, isSystem: true });
                            updateLeaderboard();
                            break;
                        }
                    }
                    break;
                case '/clear':
                    for (const id in players) {
                        if (!players[id].isAdmin) {
                            io.to(id).emit('kicked', 'Server cleared by admin');
                            delete players[id];
                        }
                    }
                    io.emit('chatMessage', { username: 'System', message: 'All non-admin players cleared', isSystem: true });
                    updateLeaderboard();
                    break;
                case '/list':
                    const list = [];
                    for (const id in players) {
                        list.push(`${players[id].username}${players[id].isAdmin ? '👑' : ''} (${players[id].score})`);
                    }
                    socket.emit('chatMessage', { username: 'System', message: `Online: ${list.join(', ')}`, isSystem: true });
                    break;
                case '/orbs':
                    socket.emit('chatMessage', { username: 'System', message: `${orbs.length} orbs on map`, isSystem: true });
                    break;
                case '/bots':
                    socket.emit('chatMessage', { username: 'System', message: `${Object.keys(bots).length} bots active`, isSystem: true });
                    break;
                default:
                    socket.emit('chatMessage', { username: 'System', message: 'Type /help for commands', isSystem: true });
            }
        } else {
            io.emit('chatMessage', {
                username: player.username,
                message: data.message,
                isAdmin: player.isAdmin,
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
    const list = [];
    for (const id in players) {
        list.push({
            username: players[id].username,
            score: players[id].score,
            isAdmin: players[id].isAdmin
        });
    }
    for (const id in bots) {
        list.push({
            username: '🤖 ' + bots[id].username,
            score: bots[id].score,
            isAdmin: false
        });
    }
    list.sort((a, b) => b.score - a.score);
    io.emit('leaderboardUpdate', list.slice(0, 10));
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n✅ RYZZ.io INSTANT ORB server running!`);
    console.log(`🗺️ Map: ${MAP_WIDTH}x${MAP_HEIGHT}`);
    console.log(`🤖 Bots: ${Object.keys(bots).length}`);
    console.log(`🟡 Orbs: ${orbs.length} (respawn every 0.8s)`);
    console.log(`👑 Admin: ${ADMIN_NAME}\n`);
});
