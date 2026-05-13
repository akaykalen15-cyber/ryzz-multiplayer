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
let bots = {};

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

// 🤖 Generate a new bot
function generateBot() {
    const botNames = ['BotAlpha', 'BotBeta', 'BotGamma', 'BotDelta', 'BotEcho', 'BotZeta', 'BotTheta', 'BotSigma'];
    const name = botNames[Math.floor(Math.random() * botNames.length)] + Math.floor(Math.random() * 99);
    
    const botId = 'bot_' + Math.random().toString(36).substr(2, 8);
    bots[botId] = {
        id: botId,
        username: name,
        x: Math.random() * MAP_WIDTH,
        y: Math.random() * MAP_HEIGHT,
        radius: 15,
        score: 100,
        isBot: true,
        isAdmin: false
    };
}

// Move bots intelligently
function moveBots() {
    for (const id in bots) {
        const bot = bots[id];
        
        // Find nearest orb
        let nearestOrb = null;
        let nearestDist = Infinity;
        for (const orb of orbs) {
            const dist = Math.hypot(bot.x - orb.x, bot.y - orb.y);
            if (dist < nearestDist) {
                nearestDist = dist;
                nearestOrb = orb;
            }
        }
        
        // Find nearby players (to chase or avoid)
        let nearestPlayer = null;
        let playerDist = Infinity;
        for (const pid in players) {
            const p = players[pid];
            const dist = Math.hypot(bot.x - p.x, bot.y - p.y);
            if (dist < playerDist) {
                playerDist = dist;
                nearestPlayer = p;
            }
        }
        
        // Decision making
        let moveX = 0, moveY = 0;
        
        if (nearestPlayer && playerDist < 200) {
            if (bot.radius > nearestPlayer.radius + 10) {
                // Chase smaller player
                const dx = nearestPlayer.x - bot.x;
                const dy = nearestPlayer.y - bot.y;
                const dist = Math.hypot(dx, dy);
                if (dist > 0) {
                    moveX = (dx / dist) * 3;
                    moveY = (dy / dist) * 3;
                }
            } else if (nearestPlayer.radius > bot.radius + 10) {
                // Run away from bigger player
                const dx = bot.x - nearestPlayer.x;
                const dy = bot.y - nearestPlayer.y;
                const dist = Math.hypot(dx, dy);
                if (dist > 0) {
                    moveX = (dx / dist) * 4;
                    moveY = (dy / dist) * 4;
                }
            }
        }
        
        // If no player decision, go towards nearest orb
        if (moveX === 0 && moveY === 0 && nearestOrb) {
            const dx = nearestOrb.x - bot.x;
            const dy = nearestOrb.y - bot.y;
            const dist = Math.hypot(dx, dy);
            if (dist > 0) {
                moveX = (dx / dist) * 2.5;
                moveY = (dy / dist) * 2.5;
            }
        }
        
        // Add random wandering
        moveX += (Math.random() - 0.5) * 1.5;
        moveY += (Math.random() - 0.5) * 1.5;
        
        // Apply movement
        bot.x += moveX;
        bot.y += moveY;
        bot.x = Math.min(Math.max(bot.x, bot.radius + 5), MAP_WIDTH - bot.radius - 5);
        bot.y = Math.min(Math.max(bot.y, bot.radius + 5), MAP_HEIGHT - bot.radius - 5);
        
        // Bot collects orbs
        for (let i = 0; i < orbs.length; i++) {
            const orb = orbs[i];
            const dist = Math.hypot(bot.x - orb.x, bot.y - orb.y);
            if (dist < bot.radius + orb.radius) {
                orbs.splice(i, 1);
                bot.score += orb.value;
                bot.radius = Math.min(80, 15 + Math.floor(bot.score / 100));
                i--;
            }
        }
    }
}

// Bot vs player eating
function checkBotPlayerCollisions() {
    for (const botId in bots) {
        const bot = bots[botId];
        for (const playerId in players) {
            const player = players[playerId];
            const dist = Math.hypot(bot.x - player.x, bot.y - player.y);
            const combinedRadius = bot.radius + player.radius;
            
            if (dist < combinedRadius) {
                if (bot.radius > player.radius && !player.isAdmin) {
                    // Bot eats player
                    const pointsGained = Math.floor(player.score / 2) + 50;
                    bot.score += pointsGained;
                    bot.radius = Math.min(80, 15 + Math.floor(bot.score / 100));
                    player.score = Math.floor(player.score / 3);
                    player.radius = Math.max(20, 20 + Math.floor(player.score / 50));
                    player.x = Math.random() * MAP_WIDTH;
                    player.y = Math.random() * MAP_HEIGHT;
                    io.emit('playerMoved', player);
                    io.emit('chatMessage', { username: 'System', message: `🤖 ${bot.username} ate ${player.username}!`, isSystem: true });
                    updateLeaderboard();
                } else if (player.radius > bot.radius) {
                    // Player eats bot
                    const pointsGained = Math.floor(bot.score / 2) + 50;
                    player.score += pointsGained;
                    player.radius = Math.min(80, 20 + Math.floor(player.score / 50));
                    delete bots[botId];
                    generateBot(); // Spawn new bot
                    io.emit('chatMessage', { username: 'System', message: `🍽️ ${player.username} ate bot ${bot.username}!`, isSystem: true });
                    updateLeaderboard();
                    break;
                }
            }
        }
    }
}

// Initial setup
generateOrbs(150);
for (let i = 0; i < 5; i++) {
    generateBot();
}

// Bot movement interval
setInterval(() => {
    moveBots();
    checkBotPlayerCollisions();
    io.emit('updateBots', bots);
}, 100);

// Orb respawn
setInterval(() => {
    if (orbs.length < 100) {
        generateOrbs(25);
    } else {
        generateOrbs(5);
    }
}, 2000);

// Respawn bots if too few
setInterval(() => {
    const botCount = Object.keys(bots).length;
    if (botCount < 3) {
        generateBot();
        console.log(`Low bots (${botCount}), spawned new one`);
    }
}, 10000);

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
        socket.emit('currentBots', bots);
        socket.broadcast.emit('newPlayer', players[socket.id]);
        updateLeaderboard();
        
        if (isAdmin) {
            socket.emit('adminConfirm', '👑 You are ADMIN! Type /help for commands');
        }
        
        console.log(`${username} joined${isAdmin ? ' as ADMIN' : ''}, bots: ${Object.keys(bots).length}`);
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
        }
    });

    socket.on('eatPlayer', (targetId) => {
        if (!players[socket.id] || !players[targetId]) return;
        
        const eater = players[socket.id];
        const target = players[targetId];
        
        if (eater.radius > target.radius && !target.isAdmin) {
            const pointsGained = Math.floor(target.score / 2) + 50;
            eater.score += pointsGained;
            eater.radius = Math.min(80, 20 + Math.floor(eater.score / 50));
            
            target.score = Math.floor(target.score / 3);
            target.radius = Math.max(20, 20 + Math.floor(target.score / 50));
            target.x = Math.random() * MAP_WIDTH;
            target.y = Math.random() * MAP_HEIGHT;
            
            updateLeaderboard();
            io.emit('scoreUpdate', { id: socket.id, score: eater.score, radius: eater.radius });
            io.emit('scoreUpdate', { id: targetId, score: target.score, radius: target.radius });
            io.emit('playerMoved', target);
            io.emit('chatMessage', { username: 'System', message: `🍽️ ${eater.username} ate ${target.username}!`, isSystem: true });
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
    for (let id in bots) {
        list.push({
            username: '🤖 ' + bots[id].username,
            score: bots[id].score,
            isAdmin: false
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
            socket.emit('chatMessage', { username: 'System', message: 'Commands: /kick [name], /clear, /god, /list, /orbs, /bots', isSystem: true });
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
        case '/bots':
            socket.emit('chatMessage', { username: 'System', message: `${Object.keys(bots).length} bots active`, isSystem: true });
            break;
        default:
            socket.emit('chatMessage', { username: 'System', message: `Unknown command: ${cmd}. Type /help`, isSystem: true });
    }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ RYZZ.io server running on port ${PORT}`);
    console.log(`👑 Admin name: ${ADMIN_NAME}`);
    console.log(`🤖 Bots are active!`);
});
