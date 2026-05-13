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
let powerups = [];

const powerupTypes = [
    { type: 'speed', color: '#00ffff', value: 'speed', name: '🚀 Speed Boost', duration: 8000 },
    { type: 'shield', color: '#ffd700', value: 'shield', name: '🛡️ Shield', duration: 8000 },
    { type: 'magnet', color: '#a855f7', value: 'magnet', name: '🧲 Magnet', duration: 10000 },
    { type: 'vision', color: '#22c55e', value: 'vision', name: '👁️ Vision', duration: 5000 },
    { type: 'split', color: '#f97316', value: 'split', name: '💥 Split', duration: 0 }
];

const orbTypes = [
    { color: '#fbbf24', value: 10, name: 'yellow', weight: 45 },
    { color: '#22c55e', value: 25, name: 'green', weight: 25 },
    { color: '#3b82f6', value: 50, name: 'blue', weight: 18 },
    { color: '#a855f7', value: 100, name: 'purple', weight: 12 }
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

// Generate MORE orbs
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

function generatePowerup() {
    const powerupType = powerupTypes[Math.floor(Math.random() * powerupTypes.length)];
    powerups.push({
        id: Math.random().toString(36).substr(2, 8),
        x: Math.random() * MAP_WIDTH,
        y: Math.random() * MAP_HEIGHT,
        radius: 10,
        ...powerupType
    });
}

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
        isAdmin: false,
        activePowerup: null,
        powerupEndTime: 0
    };
}

function moveBots() {
    for (const id in bots) {
        const bot = bots[id];
        
        let nearestOrb = null;
        let nearestDist = Infinity;
        for (const orb of orbs) {
            const dist = Math.hypot(bot.x - orb.x, bot.y - orb.y);
            if (dist < nearestDist) {
                nearestDist = dist;
                nearestOrb = orb;
            }
        }
        
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
        
        let moveX = 0, moveY = 0;
        
        if (nearestPlayer && playerDist < 250) {
            if (bot.radius > nearestPlayer.radius + 10) {
                const dx = nearestPlayer.x - bot.x;
                const dy = nearestPlayer.y - bot.y;
                const dist = Math.hypot(dx, dy);
                if (dist > 0) {
                    moveX = (dx / dist) * 4;
                    moveY = (dy / dist) * 4;
                }
            } else if (nearestPlayer.radius > bot.radius + 10) {
                const dx = bot.x - nearestPlayer.x;
                const dy = bot.y - nearestPlayer.y;
                const dist = Math.hypot(dx, dy);
                if (dist > 0) {
                    moveX = (dx / dist) * 5;
                    moveY = (dy / dist) * 5;
                }
            }
        }
        
        if (moveX === 0 && moveY === 0 && nearestOrb) {
            const dx = nearestOrb.x - bot.x;
            const dy = nearestOrb.y - bot.y;
            const dist = Math.hypot(dx, dy);
            if (dist > 0) {
                moveX = (dx / dist) * 3;
                moveY = (dy / dist) * 3;
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

function checkBotPlayerCollisions() {
    for (const botId in bots) {
        const bot = bots[botId];
        for (const playerId in players) {
            const player = players[playerId];
            const dist = Math.hypot(bot.x - player.x, bot.y - player.y);
            const combinedRadius = bot.radius + player.radius;
            
            if (dist < combinedRadius) {
                const botHasShield = bot.activePowerup === 'shield' && Date.now() < bot.powerupEndTime;
                const playerHasShield = player.activePowerup === 'shield' && Date.now() < player.powerupEndTime;
                
                if (bot.radius > player.radius && !player.isAdmin && !playerHasShield) {
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
                } else if (player.radius > bot.radius && !botHasShield) {
                    const pointsGained = Math.floor(bot.score / 2) + 50;
                    player.score += pointsGained;
                    player.radius = Math.min(80, 20 + Math.floor(player.score / 50));
                    delete bots[botId];
                    generateBot();
                    io.emit('chatMessage', { username: 'System', message: `🍽️ ${player.username} ate bot ${bot.username}!`, isSystem: true });
                    updateLeaderboard();
                    break;
                }
            }
        }
    }
}

// START WITH MORE ORBS
generateOrbs(200);

// START WITH 6 BOTS
for (let i = 0; i < 6; i++) {
    generateBot();
}

// START WITH 4 POWERUPS
for (let i = 0; i < 4; i++) {
    generatePowerup();
}

// FASTER BOT MOVEMENT UPDATE
setInterval(() => {
    moveBots();
    checkBotPlayerCollisions();
    io.emit('updateBots', bots);
}, 50);  // 50ms = faster bot movement

// FASTER ORB RESPAWN
setInterval(() => {
    if (orbs.length < 150) {
        generateOrbs(40);
        console.log(`Low on orbs (${orbs.length}), generated 40 more`);
    } else {
        generateOrbs(15);
    }
}, 1000);  // Every 1 second instead of 2

// POWER-UP RESPAWN
setInterval(() => {
    if (powerups.length < 5) {
        generatePowerup();
    }
}, 10000);  // Every 10 seconds

// BOT RESPAWN
setInterval(() => {
    const botCount = Object.keys(bots).length;
    if (botCount < 4) {
        generateBot();
        console.log(`Low bots (${botCount}), spawned new one`);
    }
}, 8000);

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
            godMode: false,
            activePowerup: null,
            powerupEndTime: 0,
            speedMultiplier: 1
        };

        socket.emit('currentOrbs', orbs);
        socket.emit('currentPowerups', powerups);
        socket.emit('currentPlayers', players);
        socket.emit('currentBots', bots);
        socket.broadcast.emit('newPlayer', players[socket.id]);
        updateLeaderboard();
        
        if (isAdmin) {
            socket.emit('adminConfirm', '👑 You are ADMIN! Type /help for commands');
        }
        
        console.log(`${username} joined, orbs: ${orbs.length}, bots: ${Object.keys(bots).length}`);
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

    socket.on('collectPowerup', (powerupId) => {
        if (!players[socket.id]) return;
        
        const powerupIndex = powerups.findIndex(p => p.id === powerupId);
        if (powerupIndex !== -1) {
            const powerup = powerups[powerupIndex];
            powerups.splice(powerupIndex, 1);
            
            const player = players[socket.id];
            player.activePowerup = powerup.type;
            player.powerupEndTime = Date.now() + powerup.duration;
            
            if (powerup.type === 'speed') {
                player.speedMultiplier = 2;
                setTimeout(() => {
                    if (players[socket.id]) {
                        players[socket.id].speedMultiplier = 1;
                        players[socket.id].activePowerup = null;
                    }
                }, powerup.duration);
            } else if (powerup.type === 'split') {
                player.score += 50;
                player.radius = Math.min(80, player.radius + 5);
                updateLeaderboard();
                io.emit('scoreUpdate', { id: socket.id, score: player.score, radius: player.radius });
            } else {
                setTimeout(() => {
                    if (players[socket.id]) {
                        players[socket.id].activePowerup = null;
                    }
                }, powerup.duration);
            }
            
            io.emit('powerupCollected', powerupId);
            io.emit('chatMessage', {
                username: 'System',
                message: `⚡ ${player.username} got ${powerup.name}!`,
                isSystem: true
            });
            updateLeaderboard();
        }
    });

    socket.on('eatPlayer', (targetId) => {
        if (!players[socket.id] || !players[targetId]) return;
        
        const eater = players[socket.id];
        const target = players[targetId];
        
        const targetHasShield = target.activePowerup === 'shield' && Date.now() < target.powerupEndTime;
        
        if (eater.radius > target.radius && !target.isAdmin && !targetHasShield) {
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
            socket.emit('chatMessage', { username: 'System', message: 'Commands: /kick, /clear, /god, /list, /orbs, /bots, /powerups', isSystem: true });
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
            socket.emit('chatMessage', { username: 'System', message: `${orbs.length} orbs on map`, isSystem: true });
            break;
        case '/bots':
            socket.emit('chatMessage', { username: 'System', message: `${Object.keys(bots).length} bots active`, isSystem: true });
            break;
        case '/powerups':
            socket.emit('chatMessage', { username: 'System', message: `${powerups.length} power-ups on map`, isSystem: true });
            break;
        default:
            socket.emit('chatMessage', { username: 'System', message: `Unknown command: ${cmd}. Type /help`, isSystem: true });
    }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ RYZZ.io server running on port ${PORT}`);
    console.log(`⚡ Power-ups enabled | 🚀 Fast mode enabled`);
});
