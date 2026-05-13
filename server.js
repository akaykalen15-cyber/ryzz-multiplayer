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

let MAP_WIDTH = 4000;
let MAP_HEIGHT = 4000;
const MAX_MAP_SIZE = 20000;
const MIN_MAP_SIZE = 4000;

let orbs = [];

const orbColors = ['#fbbf24', '#22c55e', '#3b82f6', '#a855f7'];
const orbValues = [100, 200, 350, 500];

const botNames = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Echo', 'Zeta', 'Theta', 'Sigma', 'Omega', 'Nova', 'Rex', 'Luna', 'Orion', 'Atlas'];

function getLevel(score) {
    if (score < 1000) return 1;
    if (score < 2500) return 2;
    if (score < 5000) return 3;
    if (score < 10000) return 4;
    if (score < 20000) return 5;
    if (score < 35000) return 6;
    if (score < 55000) return 7;
    if (score < 80000) return 8;
    if (score < 110000) return 9;
    if (score < 250000) return Math.floor(10 + (score - 110000) / 20000);
    if (score < 500000) return Math.floor(15 + (score - 250000) / 30000);
    return Math.floor(20 + (score - 500000) / 50000);
}

function getLevelTitle(level) {
    if (level < 2) return '🍼 Newbie';
    if (level < 3) return '🌱 Rookie';
    if (level < 4) return '⚔️ Fighter';
    if (level < 5) return '🛡️ Warrior';
    if (level < 6) return '🏃 Runner';
    if (level < 7) return '💪 Gladiator';
    if (level < 8) return '👑 Champion';
    if (level < 9) return '🔥 Legend';
    if (level < 10) return '💀 Reaper';
    if (level < 15) return '🌟 Star';
    if (level < 20) return '⚡ God';
    return '👑 Supreme';
}

function getPerks(level) {
    let speedBonus = 0;
    let sizeBonus = 0;
    let scoreBonus = 0;
    let eatRangeBonus = 0;
    
    if (level >= 2) speedBonus += 5;
    if (level >= 3) sizeBonus += 10;
    if (level >= 4) eatRangeBonus += 10;
    if (level >= 5) speedBonus += 15;
    if (level >= 6) sizeBonus += 20;
    if (level >= 7) scoreBonus += 25;
    if (level >= 8) speedBonus += 30;
    if (level >= 9) scoreBonus += 10;
    if (level >= 10) {
        sizeBonus += 50;
        scoreBonus += 50;
    }
    if (level >= 11 && level < 15) {
        const extra = (level - 10) * 2;
        speedBonus += extra;
        sizeBonus += extra;
    }
    if (level >= 15) {
        speedBonus += 100;
        sizeBonus += 100;
        scoreBonus += 100;
        eatRangeBonus += 50;
    }
    if (level >= 16 && level < 20) {
        const extra = (level - 15) * 5;
        speedBonus += extra;
        sizeBonus += extra;
        scoreBonus += extra;
    }
    if (level >= 20) {
        speedBonus += 200;
        sizeBonus += 200;
        scoreBonus += 200;
        eatRangeBonus += 100;
    }
    
    return {
        speedMultiplier: 1 + (speedBonus / 100),
        sizeMultiplier: 1 + (sizeBonus / 100),
        scoreMultiplier: 1 + (scoreBonus / 100),
        eatRangeMultiplier: 1 + (eatRangeBonus / 100)
    };
}

function formatScore(score) {
    if (score >= 1_000_000_000) return (score / 1_000_000_000).toFixed(1) + 'B';
    if (score >= 1_000_000) return (score / 1_000_000).toFixed(1) + 'M';
    if (score >= 1_000) return (score / 1_000).toFixed(1) + 'K';
    return score.toString();
}

function getCellColor(level) {
    if (level >= 20) return 'rainbow';
    if (level >= 15) return '#a855f7';
    if (level >= 10) return '#f97316';
    if (level >= 7) return '#fbbf24';
    if (level >= 4) return '#60a5fa';
    return '#3b82f6';
}

function updateMapSize() {
    let highestScore = 0;
    for (const id in players) {
        if (players[id].score > highestScore) {
            highestScore = players[id].score;
        }
    }
    for (const id in bots) {
        if (bots[id].score > highestScore) {
            highestScore = bots[id].score;
        }
    }
    
    let newSize = Math.min(MAX_MAP_SIZE, MIN_MAP_SIZE + Math.floor(highestScore / 100));
    if (newSize !== MAP_WIDTH) {
        MAP_WIDTH = newSize;
        MAP_HEIGHT = newSize;
        console.log(`🗺️ Map expanded to ${MAP_WIDTH}x${MAP_HEIGHT}`);
        io.emit('mapSizeUpdate', { width: MAP_WIDTH, height: MAP_HEIGHT });
    }
}

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
}

function generateBot() {
    const name = botNames[Math.floor(Math.random() * botNames.length)] + Math.floor(Math.random() * 99);
    const botId = 'bot_' + Math.random().toString(36).substr(2, 8);
    const startScore = 500;
    const level = getLevel(startScore);
    bots[botId] = {
        id: botId,
        username: name,
        x: Math.random() * MAP_WIDTH,
        y: Math.random() * MAP_HEIGHT,
        radius: 18,
        score: startScore,
        level: level,
        title: getLevelTitle(level),
        perks: getPerks(level),
        isBot: true
    };
}

generateOrbs(600);
for (let i = 0; i < 12; i++) {
    generateBot();
}

setInterval(() => {
    updateMapSize();
}, 1000);

setInterval(() => {
    if (orbs.length < 500) {
        generateOrbs(80);
    } else {
        generateOrbs(25);
    }
}, 800);

setInterval(() => {
    const botCount = Object.keys(bots).length;
    if (botCount < 10) {
        generateBot();
    }
}, 10000);

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
        const botSpeed = 5 * (bot.perks?.speedMultiplier || 1);
        
        if (nearestPlayer && playerDist < 122500) {
            const dist = Math.sqrt(playerDist);
            if (bot.radius > nearestPlayer.radius + 10) {
                const dx = nearestPlayer.x - bot.x;
                const dy = nearestPlayer.y - bot.y;
                const len = dist;
                if (len > 0) {
                    moveX = (dx / len) * botSpeed;
                    moveY = (dy / len) * botSpeed;
                }
            } else if (nearestPlayer.radius > bot.radius + 10) {
                const dx = bot.x - nearestPlayer.x;
                const dy = bot.y - nearestPlayer.y;
                const len = dist;
                if (len > 0) {
                    moveX = (dx / len) * (botSpeed * 1.2);
                    moveY = (dy / len) * (botSpeed * 1.2);
                }
            }
        }
        
        if (moveX === 0 && moveY === 0 && nearestOrb) {
            const dx = nearestOrb.x - bot.x;
            const dy = nearestOrb.y - bot.y;
            const len = Math.hypot(dx, dy);
            if (len > 0) {
                moveX = (dx / len) * 4;
                moveY = (dy / len) * 4;
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
            const eatRange = 8 * (bot.perks?.eatRangeMultiplier || 1);
            if (dx * dx + dy * dy < (bot.radius + eatRange) ** 2) {
                const points = Math.floor(orb.value * (bot.perks?.scoreMultiplier || 1));
                bot.score += points;
                bot.radius = Math.min(100, 18 + Math.floor(bot.score / 500));
                orbs.splice(i, 1);
                i--;
            }
        }
        
        const newLevel = getLevel(bot.score);
        if (newLevel !== bot.level) {
            bot.level = newLevel;
            bot.title = getLevelTitle(newLevel);
            bot.perks = getPerks(newLevel);
        }
    }
    io.emit('updateBots', bots);
}, 40);

setInterval(() => {
    for (const botId in bots) {
        const bot = bots[botId];
        for (const playerId in players) {
            const player = players[playerId];
            const dx = bot.x - player.x;
            const dy = bot.y - player.y;
            const eatRange = (bot.radius + player.radius) * (bot.perks?.eatRangeMultiplier || 1);
            const distSq = dx * dx + dy * dy;
            
            if (distSq < eatRange ** 2) {
                if (bot.radius > player.radius && !player.isAdmin) {
                    const gain = Math.floor((player.score / 3) + 200) * (bot.perks?.scoreMultiplier || 1);
                    bot.score += gain;
                    bot.radius = Math.min(100, 18 + Math.floor(bot.score / 500));
                    
                    // 🔥 PLAYER LOSES 80% OF SCORE ON DEATH
                    player.score = Math.floor(player.score / 5);
                    player.radius = Math.max(20, 15 + Math.floor(player.score / 500));
                    player.x = Math.random() * MAP_WIDTH;
                    player.y = Math.random() * MAP_HEIGHT;
                    
                    const newPlayerLevel = getLevel(player.score);
                    player.level = newPlayerLevel;
                    player.title = getLevelTitle(newPlayerLevel);
                    player.perks = getPerks(newPlayerLevel);
                    
                    io.emit('playerMoved', player);
                    io.emit('chatMessage', { username: 'System', message: `🤖 ${bot.username} (Lvl ${bot.level}) ate ${player.username}!`, isSystem: true });
                    updateLeaderboard();
                } else if (player.radius > bot.radius) {
                    const gain = Math.floor((bot.score / 2) + 200) * (player.perks?.scoreMultiplier || 1);
                    player.score += gain;
                    player.radius = Math.min(120, 20 + Math.floor(player.score / 500));
                    
                    const newPlayerLevel = getLevel(player.score);
                    player.level = newPlayerLevel;
                    player.title = getLevelTitle(newPlayerLevel);
                    player.perks = getPerks(newPlayerLevel);
                    
                    io.emit('chatMessage', { username: 'System', message: `🍽️ ${player.username} ate ${bot.username}! +${formatScore(gain)}`, isSystem: true });
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
        
        const startScore = 0;
        const level = getLevel(startScore);
        
        players[socket.id] = {
            id: socket.id,
            username: username,
            x: Math.random() * MAP_WIDTH,
            y: Math.random() * MAP_HEIGHT,
            radius: 20,
            score: startScore,
            level: level,
            title: getLevelTitle(level),
            perks: getPerks(level),
            isAdmin: isAdmin
        };
        
        socket.emit('currentOrbs', orbs);
        socket.emit('currentPlayers', players);
        socket.emit('currentBots', bots);
        socket.emit('mapSizeUpdate', { width: MAP_WIDTH, height: MAP_HEIGHT });
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
                
                const points = Math.floor(orb.value * (player.perks?.scoreMultiplier || 1));
                player.score += points;
                player.radius = Math.min(120, 20 + Math.floor(player.score / 500));
                
                const newLevel = getLevel(player.score);
                if (newLevel !== player.level) {
                    player.level = newLevel;
                    player.title = getLevelTitle(newLevel);
                    player.perks = getPerks(newLevel);
                    io.emit('chatMessage', { username: 'System', message: `🎉 ${player.username} reached ${player.title} (Level ${player.level})!`, isSystem: true });
                }
                
                updateLeaderboard();
                io.emit('scoreUpdate', {
                    id: socket.id,
                    score: player.score,
                    radius: player.radius,
                    level: player.level,
                    title: player.title,
                    perks: player.perks
                });
                io.emit('orbCollected', orbId);
                return;
            }
        }
        socket.emit('orbCollectionFailed', orbId);
    });
    
    // 🔥 UPDATED EAT PLAYER WITH 80% SCORE LOSS
    socket.on('eatPlayer', (targetId) => {
        const eater = players[socket.id];
        const target = players[targetId];
        if (!eater || !target) return;
        
        if (eater.radius > target.radius && !target.isAdmin) {
            const gain = Math.floor((target.score / 2) + 200) * (eater.perks?.scoreMultiplier || 1);
            eater.score += gain;
            eater.radius = Math.min(120, 20 + Math.floor(eater.score / 500));
            
            const newEaterLevel = getLevel(eater.score);
            if (newEaterLevel !== eater.level) {
                eater.level = newEaterLevel;
                eater.title = getLevelTitle(newEaterLevel);
                eater.perks = getPerks(newEaterLevel);
                io.emit('chatMessage', { username: 'System', message: `🎉 ${eater.username} reached ${eater.title} (Level ${eater.level})!`, isSystem: true });
            }
            
            // 🔥 PLAYER LOSES 80% OF SCORE ON DEATH (keeps 20%)
            target.score = Math.floor(target.score / 5);
            target.radius = Math.max(20, 15 + Math.floor(target.score / 500));
            target.x = Math.random() * MAP_WIDTH;
            target.y = Math.random() * MAP_HEIGHT;
            
            const newTargetLevel = getLevel(target.score);
            if (newTargetLevel !== target.level) {
                target.level = newTargetLevel;
                target.title = getLevelTitle(newTargetLevel);
                target.perks = getPerks(newTargetLevel);
            }
            
            updateLeaderboard();
            io.emit('scoreUpdate', { id: socket.id, score: eater.score, radius: eater.radius, level: eater.level, title: eater.title, perks: eater.perks });
            io.emit('scoreUpdate', { id: targetId, score: target.score, radius: target.radius, level: target.level, title: target.title, perks: target.perks });
            io.emit('playerMoved', target);
            io.emit('chatMessage', { username: 'System', message: `🍽️ ${eater.username} (Lvl ${eater.level}) ate ${target.username}! +${formatScore(gain)}`, isSystem: true });
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
                    socket.emit('chatMessage', { username: 'System', message: 'Commands: /kick, /clear, /list, /orbs, /bots, /map, /perks', isSystem: true });
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
                        list.push(`${players[id].username}${players[id].isAdmin ? '👑' : ''} (Lvl ${players[id].level} - ${formatScore(players[id].score)})`);
                    }
                    socket.emit('chatMessage', { username: 'System', message: `Online: ${list.join(', ')}`, isSystem: true });
                    break;
                case '/perks':
                    const perks = player.perks;
                    socket.emit('chatMessage', { username: 'System', message: `Your perks: ⚡${(perks.speedMultiplier*100).toFixed(0)}% Speed | 💪${(perks.sizeMultiplier*100).toFixed(0)}% Size | 💰${(perks.scoreMultiplier*100).toFixed(0)}% Score | 🎯${(perks.eatRangeMultiplier*100).toFixed(0)}% Range`, isSystem: true });
                    break;
                case '/orbs':
                    socket.emit('chatMessage', { username: 'System', message: `${orbs.length} orbs on map`, isSystem: true });
                    break;
                case '/bots':
                    socket.emit('chatMessage', { username: 'System', message: `${Object.keys(bots).length} bots active`, isSystem: true });
                    break;
                case '/map':
                    socket.emit('chatMessage', { username: 'System', message: `Map size: ${formatScore(MAP_WIDTH)}x${formatScore(MAP_HEIGHT)}`, isSystem: true });
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
            level: players[id].level,
            title: players[id].title,
            isAdmin: players[id].isAdmin
        });
    }
    for (const id in bots) {
        list.push({
            username: '🤖 ' + bots[id].username,
            score: bots[id].score,
            level: bots[id].level,
            title: bots[id].title,
            isAdmin: false
        });
    }
    list.sort((a, b) => b.score - a.score);
    io.emit('leaderboardUpdate', list.slice(0, 10));
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n✅ RYZZ.io DEATH PENALTY server running!`);
    console.log(`💀 Death penalty: Lose 80% of score (keep 20%)`);
    console.log(`💎 Orb values: 100, 200, 350, 500`);
    console.log(`🎯 Level perks enabled!`);
    console.log(`🗺️ Map: ${MAP_WIDTH}x${MAP_HEIGHT}`);
    console.log(`🤖 Bots: ${Object.keys(bots).length}\n`);
});
