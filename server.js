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
    { type: 'speed', color: '#00ffff', name: '🚀 Speed', duration: 8000 },
    { type: 'shield', color: '#ffd700', name: '🛡️ Shield', duration: 8000 },
    { type: 'magnet', color: '#a855f7', name: '🧲 Magnet', duration: 10000 },
];

const orbTypes = [
    { color: '#fbbf24', value: 10, weight: 45 },
    { color: '#22c55e', value: 25, weight: 25 },
    { color: '#3b82f6', value: 50, weight: 18 },
    { color: '#a855f7', value: 100, weight: 12 }
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
            radius: 8,
            value: orbType.value,
            color: orbType.color,
        });
    }
}

function generatePowerup() {
    const type = powerupTypes[Math.floor(Math.random() * powerupTypes.length)];
    powerups.push({
        id: Math.random().toString(36).substr(2, 8),
        x: Math.random() * MAP_WIDTH,
        y: Math.random() * MAP_HEIGHT,
        radius: 12,
        ...type
    });
}

function generateBot() {
    const botNames = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Echo', 'Zeta', 'Theta', 'Sigma'];
    const name = botNames[Math.floor(Math.random() * botNames.length)] + Math.floor(Math.random() * 99);
    const botId = 'bot_' + Math.random().toString(36).substr(2, 8);
    bots[botId] = {
        id: botId,
        username: name,
        x: Math.random() * MAP_WIDTH,
        y: Math.random() * MAP_HEIGHT,
        radius: 18,
        score: 80,
        isBot: true,
    };
}

// Initialize game
generateOrbs(250);
for (let i = 0; i < 8; i++) generateBot();
for (let i = 0; i < 5; i++) generatePowerup();

// Orb respawn - FAST
setInterval(() => {
    const needed = Math.max(50, 200 - orbs.length);
    if (needed > 0) {
        generateOrbs(Math.min(30, needed));
        console.log(`Orbs: ${orbs.length}`);
    }
}, 1500);

// Powerup respawn
setInterval(() => {
    if (powerups.length < 6) generatePowerup();
}, 12000);

// Bot respawn
setInterval(() => {
    if (Object.keys(bots).length < 6) generateBot();
}, 10000);

// Bot AI movement
setInterval(() => {
    for (const id in bots) {
        const bot = bots[id];
        let moveX = 0, moveY = 0;
        
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
        
        // Find nearest player
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
        
        // Chase or run
        if (nearestPlayer && playerDist < 300) {
            if (bot.radius > nearestPlayer.radius + 10) {
                const dx = nearestPlayer.x - bot.x;
                const dy = nearestPlayer.y - bot.y;
                const len = Math.hypot(dx, dy);
                if (len > 0) {
                    moveX = (dx / len) * 5;
                    moveY = (dy / len) * 5;
                }
            } else if (nearestPlayer.radius > bot.radius + 10) {
                const dx = bot.x - nearestPlayer.x;
                const dy = bot.y - nearestPlayer.y;
                const len = Math.hypot(dx, dy);
                if (len > 0) {
                    moveX = (dx / len) * 6;
                    moveY = (dy / len) * 6;
                }
            }
        }
        
        // If no player action, go to orb
        if (moveX === 0 && moveY === 0 && nearestOrb) {
            const dx = nearestOrb.x - bot.x;
            const dy = nearestOrb.y - bot.y;
            const len = Math.hypot(dx, dy);
            if (len > 0) {
                moveX = (dx / len) * 4;
                moveY = (dy / len) * 4;
            }
        }
        
        // Random wandering
        moveX += (Math.random() - 0.5) * 2;
        moveY += (Math.random() - 0.5) * 2;
        
        bot.x += moveX;
        bot.y += moveY;
        bot.x = Math.min(Math.max(bot.x, bot.radius + 5), MAP_WIDTH - bot.radius - 5);
        bot.y = Math.min(Math.max(bot.y, bot.radius + 5), MAP_HEIGHT - bot.radius - 5);
        
        // Bot collects orbs
        for (let i = 0; i < orbs.length; i++) {
            const orb = orbs[i];
            if (Math.hypot(bot.x - orb.x, bot.y - orb.y) < bot.radius + orb.radius) {
                bot.score += orb.value;
                bot.radius = 18 + Math.floor(bot.score / 80);
                orbs.splice(i, 1);
                i--;
            }
        }
    }
    io.emit('updateBots', bots);
}, 60);

// Bot vs Player collisions
setInterval(() => {
    for (const botId in bots) {
        const bot = bots[botId];
        for (const playerId in players) {
            const player = players[playerId];
            const dist = Math.hypot(bot.x - player.x, bot.y - player.y);
            if (dist < bot.radius + player.radius) {
                const playerHasShield = player.activePowerup === 'shield' && Date.now() < player.powerupEndTime;
                if (bot.radius > player.radius && !player.isAdmin && !playerHasShield) {
                    // Bot eats player
                    const gain = Math.floor(player.score / 3) + 60;
                    bot.score += gain;
                    bot.radius = 18 + Math.floor(bot.score / 80);
                    player.score = Math.max(0, Math.floor(player.score / 2) - 20);
                    player.radius = Math.max(18, 20 + Math.floor(player.score / 50));
                    player.x = Math.random() * (MAP_WIDTH - 200) + 100;
                    player.y = Math.random() * (MAP_HEIGHT - 200) + 100;
                    io.emit('playerMoved', player);
                    io.emit('chatMessage', { username: 'System', message: `🤖 ${bot.username} ate ${player.username}!`, isSystem: true });
                    updateLeaderboard();
                } else if (player.radius > bot.radius && !playerHasShield) {
                    // Player eats bot
                    const gain = Math.floor(bot.score / 2) + 50;
                    player.score += gain;
                    player.radius = 20 + Math.floor(player.score / 50);
                    io.emit('chatMessage', { username: 'System', message: `🍽️ ${player.username} ate ${bot.username}! +${gain}`, isSystem: true });
                    delete bots[botId];
                    generateBot();
                    updateLeaderboard();
                    break;
                } else {
                    // Same size bounce
                    const angle = Math.atan2(player.y - bot.y, player.x - bot.x);
                    player.x += Math.cos(angle) * 20;
                    player.y += Math.sin(angle) * 20;
                }
            }
        }
    }
}, 60);

io.on('connection', (socket) => {
    console.log('Player connected:', socket.id);

    socket.on('joinGame', (data) => {
        const username = data.username;
        const password = data.password || '';
        const isAdmin = (username === ADMIN_NAME && password === ADMIN_PASSWORD);
        
        if (username === ADMIN_NAME && !isAdmin) {
            socket.emit('nameRejected', 'Invalid admin credentials!');
            return;
        }
        
        // Check duplicate name
        for (let id in players) {
            if (players[id].username === username) {
                socket.emit('nameRejected', 'Username taken!');
                return;
            }
        }
        
        const newPlayer = {
            id: socket.id,
            username: username,
            x: Math.random() * (MAP_WIDTH - 400) + 200,
            y: Math.random() * (MAP_HEIGHT - 400) + 200,
            radius: 20,
            score: 0,
            isAdmin: isAdmin,
            activePowerup: null,
            powerupEndTime: 0,
            speedMultiplier: 1
        };
        
        players[socket.id] = newPlayer;
        
        socket.emit('currentOrbs', orbs);
        socket.emit('currentPowerups', powerups);
        socket.emit('currentPlayers', players);
        socket.emit('currentBots', bots);
        socket.broadcast.emit('newPlayer', newPlayer);
        updateLeaderboard();
        
        if (isAdmin) {
            socket.emit('adminConfirm', '👑 You are ADMIN! Type /help');
        }
        
        console.log(`${username} joined (${isAdmin ? 'ADMIN' : 'player'})`);
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
            orbs.splice(orbIndex, 1);
            
            players[socket.id].score += orb.value;
            players[socket.id].radius = 20 + Math.floor(players[socket.id].score / 50);
            
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
        const index = powerups.findIndex(p => p.id === powerupId);
        if (index !== -1) {
            const powerup = powerups[index];
            powerups.splice(index, 1);
            
            const player = players[socket.id];
            player.activePowerup = powerup.type;
            player.powerupEndTime = Date.now() + powerup.duration;
            
            if (powerup.type === 'speed') {
                player.speedMultiplier = 2;
                setTimeout(() => {
                    if (players[socket.id]) players[socket.id].speedMultiplier = 1;
                }, powerup.duration);
            }
            
            io.emit('powerupCollected', powerupId);
            io.emit('chatMessage', { username: 'System', message: `⚡ ${player.username} got ${powerup.name}!`, isSystem: true });
            updateLeaderboard();
        }
    });

    socket.on('eatPlayer', (targetId) => {
        if (!players[socket.id] || !players[targetId]) return;
        const eater = players[socket.id];
        const target = players[targetId];
        
        const targetHasShield = target.activePowerup === 'shield' && Date.now() < target.powerupEndTime;
        
        if (eater.radius > target.radius && !target.isAdmin && !targetHasShield) {
            const gain = Math.floor(target.score / 2) + 50;
            eater.score += gain;
            eater.radius = 20 + Math.floor(eater.score / 50);
            
            target.score = Math.max(0, Math.floor(target.score / 3) - 20);
            target.radius = Math.max(18, 20 + Math.floor(target.score / 50));
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
    const list = [];
    for (const id in players) list.push({ username: players[id].username, score: players[id].score, isAdmin: players[id].isAdmin });
    for (const id in bots) list.push({ username: '🤖 ' + bots[id].username, score: bots[id].score, isAdmin: false });
    list.sort((a, b) => b.score - a.score);
    io.emit('leaderboardUpdate', list.slice(0, 10));
}

function processAdminCommand(socket, command) {
    const parts = command.trim().split(' ');
    const cmd = parts[0].toLowerCase();
    
    switch(cmd) {
        case '/help':
            socket.emit('chatMessage', { username: 'System', message: 'Commands: /kick [name], /clear, /god, /list, /orbs, /bots', isSystem: true });
            break;
        case '/kick':
            if (parts.length < 2) return;
            const target = parts.slice(1).join(' ');
            for (const id in players) {
                if (players[id].username === target && !players[id].isAdmin) {
                    io.to(id).emit('kicked', 'Kicked by admin');
                    delete players[id];
                    io.emit('chatMessage', { username: 'System', message: `${target} was kicked`, isSystem: true });
                    updateLeaderboard();
                    break;
                }
            }
            break;
        case '/clear':
            for (const id in players) {
                if (!players[id].isAdmin) delete players[id];
            }
            io.emit('chatMessage', { username: 'System', message: 'All non-admin players cleared', isSystem: true });
            updateLeaderboard();
            break;
        case '/god':
            players[socket.id].godMode = !players[socket.id].godMode;
            socket.emit('chatMessage', { username: 'System', message: `God mode ${players[socket.id].godMode ? 'ON' : 'OFF'}`, isSystem: true });
            break;
        case '/list':
            const list = [];
            for (const id in players) list.push(`${players[id].username}${players[id].isAdmin ? '👑' : ''} (${players[id].score})`);
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
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ RYZZ.io server running on port ${PORT}`);
    console.log(`👑 Admin: ${ADMIN_NAME}`);
    console.log(`🎯 Orbs: ${orbs.length} | Bots: ${Object.keys(bots).length}`);
});
