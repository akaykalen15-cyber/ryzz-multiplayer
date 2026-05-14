const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');
const fs = require('fs');

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

// 🎮 GAME MODES
const GAME_MODES = {
    CLASSIC: 'classic',
    SPEED: 'speed',
    HARDCORE: 'hardcore',
    SHIELD: 'shield',
    ARENA: 'arena',
    BOSS_RUSH: 'boss_rush'
};

let currentGameMode = GAME_MODES.CLASSIC;
let arenaShrinkCount = 0;
let lastModeChange = Date.now();
const MODE_CHANGE_INTERVAL = 300000; // Change mode every 5 minutes

let players = {};
let bots = {};
let bossBot = null;
let bossHealth = 0;
let bossSpawnTime = 0;
const BOSS_SPAWN_INTERVAL = 600000;

let MAP_WIDTH = 4000;
let MAP_HEIGHT = 4000;
const MAX_MAP_SIZE = 20000;
const MIN_MAP_SIZE = 4000;
let ARENA_MIN_SIZE = 4000;

let orbs = [];
let powerups = [];
let bannedPlayers = new Set();

const orbColors = ['#fbbf24', '#22c55e', '#3b82f6', '#a855f7'];
const orbValues = [100, 200, 350, 500];

const powerupTypes = [
    { type: 'speed', color: '#00ffff', name: '🚀 Speed Boost', duration: 8000, icon: '⚡' },
    { type: 'shield', color: '#ffd700', name: '🛡️ Shield', duration: 6000, icon: '🛡️' },
    { type: 'magnet', color: '#a855f7', name: '🧲 Magnet', duration: 10000, icon: '🧲' },
    { type: 'double', color: '#f97316', name: '💥 Double Points', duration: 8000, icon: '💥' },
    { type: 'vision', color: '#22c55e', name: '👁️ Vision', duration: 5000, icon: '👁️' }
];

const botNames = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Echo', 'Zeta', 'Theta', 'Sigma', 'Nova', 'Rex'];
const bossNames = ['👑 TITAN', '👑 COLOSSUS', '👑 BEHEMOTH', '👑 LEVIATHAN', '👑 KRAKEN', '👑 GODZILLA'];

let allTimeTop10 = [];
const LEADERBOARD_FILE = path.join(__dirname, 'top10.json');

if (fs.existsSync(LEADERBOARD_FILE)) {
    try {
        const data = fs.readFileSync(LEADERBOARD_FILE, 'utf8');
        allTimeTop10 = JSON.parse(data);
    } catch (e) {
        allTimeTop10 = [];
    }
}

function saveTop10() {
    fs.writeFileSync(LEADERBOARD_FILE, JSON.stringify(allTimeTop10, null, 2));
}

function updateAllTimeLeaderboard(username, score) {
    const existingIndex = allTimeTop10.findIndex(entry => entry.username === username);
    if (existingIndex !== -1) {
        if (score > allTimeTop10[existingIndex].score) {
            allTimeTop10[existingIndex].score = score;
        }
    } else {
        allTimeTop10.push({ username: username, score: score, date: new Date().toISOString() });
    }
    allTimeTop10.sort((a, b) => b.score - a.score);
    allTimeTop10 = allTimeTop10.slice(0, 10);
    saveTop10();
    io.emit('allTimeLeaderboard', allTimeTop10);
}

function getPersonalBest(username) {
    const record = allTimeTop10.find(entry => entry.username === username);
    return record ? record.score : 0;
}

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
    if (score < 150000) return 10;
    if (score < 200000) return 11;
    if (score < 260000) return 12;
    if (score < 330000) return 13;
    if (score < 410000) return 14;
    if (score < 500000) return 15;
    if (score < 600000) return 16;
    if (score < 710000) return 17;
    if (score < 830000) return 18;
    if (score < 960000) return 19;
    if (score < 1100000) return 20;
    
    let baseScore = 1100000;
    let baseLevel = 20;
    let increment = 50000;
    let additionalLevels = Math.floor((score - baseScore) / increment);
    return baseLevel + additionalLevels;
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
    if (level < 11) return '🌟 Star';
    if (level < 12) return '⚡ God';
    if (level < 13) return '👑 Supreme';
    if (level < 14) return '💎 Legendary';
    if (level < 15) return '🐉 Dragon';
    if (level < 16) return '👑 Immortal';
    if (level < 17) return '🌌 Cosmic';
    if (level < 18) return '💫 Celestial';
    if (level < 19) return '👁️ Omni';
    if (level < 20) return '🌀 Void';
    if (level < 25) return '⭐ Star Lord';
    if (level < 30) return '🌠 Nebula';
    if (level < 40) return '🔥 Phoenix';
    if (level < 50) return '⚡ Thunder God';
    if (level < 75) return '🌊 Leviathan';
    if (level < 100) return '👑 Overlord';
    if (level < 150) return '💀 Deathbringer';
    if (level < 200) return '🐉 World Eater';
    if (level < 300) return '🌟 Galaxy Guardian';
    if (level < 500) return '🌀 Universe Master';
    if (level < 1000) return '👑 God Emperor';
    if (level < 2000) return '∞ Eternal';
    if (level < 5000) return '🌌 Cosmic God';
    return '∞ Infinity';
}

function getPerks(level) {
    let speedBonus = Math.min(Math.floor(level * 1.5), 500);
    let sizeBonus = Math.min(Math.floor(level * 1.2), 500);
    let scoreBonus = Math.min(Math.floor(level * 1), 500);
    let eatRangeBonus = Math.min(Math.floor(level * 0.8), 300);
    
    // Apply game mode modifiers
    if (currentGameMode === GAME_MODES.SPEED) {
        speedBonus += 50;
    }
    if (currentGameMode === GAME_MODES.HARDCORE) {
        speedBonus += 20;
        sizeBonus = Math.max(0, sizeBonus - 30);
    }
    if (currentGameMode === GAME_MODES.SHIELD) {
        speedBonus -= 20;
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

function updateMapSize() {
    let highestScore = 0;
    for (const id in players) if (players[id].score > highestScore) highestScore = players[id].score;
    for (const id in bots) if (bots[id].score > highestScore) highestScore = bots[id].score;
    if (bossBot && bossBot.score > highestScore) highestScore = bossBot.score;
    
    let newSize = Math.min(MAX_MAP_SIZE, MIN_MAP_SIZE + Math.floor(highestScore / 100));
    
    // ARENA MODE: Shrinking map
    if (currentGameMode === GAME_MODES.ARENA && arenaShrinkCount > 0) {
        newSize = Math.max(ARENA_MIN_SIZE, newSize * 0.95);
    }
    
    if (newSize !== MAP_WIDTH) {
        MAP_WIDTH = newSize;
        MAP_HEIGHT = newSize;
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
    const name = botNames[Math.floor(Math.random() * botNames.length)] + Math.floor(Math.random() * 99);
    const botId = 'bot_' + Math.random().toString(36).substr(2, 8);
    let startScore = 200;
    
    // Hardcore mode: bots start stronger
    if (currentGameMode === GAME_MODES.HARDCORE) {
        startScore = 500;
    }
    
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
        isBot: true, 
        kills: 0
    };
}

function spawnBossBot() {
    if (bossBot) return;
    
    const bossName = bossNames[Math.floor(Math.random() * bossNames.length)];
    let bossLevel = 40;
    let bossScore = 100000;
    
    // Boss Rush mode: stronger bosses
    if (currentGameMode === GAME_MODES.BOSS_RUSH) {
        bossLevel = 60;
        bossScore = 200000;
    }
    
    bossHealth = 100;
    
    bossBot = {
        id: 'boss_' + Math.random().toString(36).substr(2, 8),
        username: bossName,
        x: Math.random() * MAP_WIDTH,
        y: Math.random() * MAP_HEIGHT,
        radius: 100,
        score: bossScore,
        level: bossLevel,
        title: '👑 BOSS',
        perks: getPerks(bossLevel),
        isBot: true,
        isBoss: true,
        kills: 0,
        health: 100,
        maxHealth: 100
    };
    
    bossSpawnTime = Date.now();
    
    io.emit('bossSpawned', bossBot);
    io.emit('bossHealthUpdate', { health: 100, maxHealth: 100 });
    io.emit('chatMessage', { username: 'System', message: `⚠️⚠️⚠️ ${bossName} (Level ${bossLevel}) HAS APPEARED! ⚠️⚠️⚠️`, isSystem: true });
    io.emit('chatMessage', { username: 'System', message: `👑 Requires LEVEL 15 to damage! Boss has 100 HP!`, isSystem: true });
    io.emit('chatMessage', { username: 'System', message: `💀 Defeat the boss for 10,000,000 points!`, isSystem: true });
}

function moveBossBot() {
    if (!bossBot) return;
    
    let nearestPlayer = null;
    let playerDist = Infinity;
    for (const pid in players) {
        const dist = Math.hypot(bossBot.x - players[pid].x, bossBot.y - players[pid].y);
        if (dist < playerDist) {
            playerDist = dist;
            nearestPlayer = players[pid];
        }
    }
    
    let moveX = 0, moveY = 0;
    let bossSpeed = 2.5;
    
    // Speed mode: boss faster
    if (currentGameMode === GAME_MODES.SPEED) {
        bossSpeed = 3.5;
    }
    
    if (nearestPlayer && playerDist < 400) {
        const dx = nearestPlayer.x - bossBot.x;
        const dy = nearestPlayer.y - bossBot.y;
        const len = playerDist;
        if (len > 0) {
            moveX = (dx / len) * bossSpeed;
            moveY = (dy / len) * bossSpeed;
        }
    }
    
    if (moveX === 0 && moveY === 0) {
        moveX = (Math.random() - 0.5) * 2;
        moveY = (Math.random() - 0.5) * 2;
    }
    
    bossBot.x += moveX;
    bossBot.y += moveY;
    bossBot.x = Math.min(Math.max(bossBot.x, bossBot.radius + 5), MAP_WIDTH - bossBot.radius - 5);
    bossBot.y = Math.min(Math.max(bossBot.y, bossBot.radius + 5), MAP_HEIGHT - bossBot.radius - 5);
    
    for (let i = 0; i < orbs.length; i++) {
        const orb = orbs[i];
        if (Math.hypot(bossBot.x - orb.x, bossBot.y - orb.y) < bossBot.radius + orb.radius) {
            bossBot.score += orb.value;
            bossBot.radius = Math.min(180, 100 + Math.floor(bossBot.score / 1000));
            orbs.splice(i, 1);
            i--;
        }
    }
    
    io.emit('updateBoss', bossBot);
}

function damageBoss(playerId, damage) {
    if (!bossBot) return false;
    
    const player = players[playerId];
    if (!player) return false;
    
    if (player.level < 15) {
        io.emit('chatMessage', { username: 'System', message: `🛡️ ${player.username} needs LEVEL 15 to damage the boss!`, isSystem: true });
        return false;
    }
    
    bossHealth -= damage;
    if (bossHealth < 0) bossHealth = 0;
    
    io.emit('bossHealthUpdate', { health: bossHealth, maxHealth: 100 });
    io.emit('chatMessage', { username: 'System', message: `💥 ${player.username} dealt ${damage} damage to ${bossBot.username}! (${bossHealth}/100 HP)`, isSystem: true });
    
    if (bossHealth <= 0) {
        let gain = 10000000;
        
        // Boss Rush mode: double reward
        if (currentGameMode === GAME_MODES.BOSS_RUSH) {
            gain = 20000000;
        }
        
        player.score += gain;
        player.radius = Math.min(200, 20 + Math.floor(player.score / 50));
        player.kills = (player.kills || 0) + 1;
        
        const newLevel = getLevel(player.score);
        player.level = newLevel;
        player.title = getLevelTitle(newLevel);
        player.perks = getPerks(newLevel);
        
        updateAllTimeLeaderboard(player.username, player.score);
        
        io.emit('chatMessage', { username: 'System', message: `🎉🎉🎉 ${player.username} DEFEATED THE BOSS ${bossBot.username}! +${formatScore(gain)} points! 🎉🎉🎉`, isSystem: true });
        io.emit('chatMessage', { username: 'System', message: `👑 ${player.username} earned the title "BOSS SLAYER"!`, isSystem: true });
        
        generateOrbs(100);
        
        // Boss Rush mode: spawn next boss sooner
        if (currentGameMode === GAME_MODES.BOSS_RUSH) {
            setTimeout(() => spawnBossBot(), 30000);
        }
        
        bossBot = null;
        updateLeaderboard();
        return true;
    }
    return false;
}

function checkBossCollisions() {
    if (!bossBot) return;
    
    for (const playerId in players) {
        const player = players[playerId];
        const dist = Math.hypot(bossBot.x - player.x, bossBot.y - player.y);
        
        if (dist < bossBot.radius + player.radius) {
            if (bossBot.radius > player.radius && !player.isAdmin) {
                let lossPercent = 0.8;
                if (currentGameMode === GAME_MODES.HARDCORE) {
                    lossPercent = 0.95;
                } else if (currentGameMode === GAME_MODES.SHIELD) {
                    lossPercent = 0.6;
                }
                
                player.score = Math.floor(player.score * (1 - lossPercent));
                player.radius = Math.min(200, 20 + Math.floor(player.score / 50));
                player.x = Math.random() * MAP_WIDTH;
                player.y = Math.random() * MAP_HEIGHT;
                const newLevel = getLevel(player.score);
                player.level = newLevel;
                player.title = getLevelTitle(newLevel);
                player.perks = getPerks(newLevel);
                io.emit('playerMoved', player);
                io.emit('deathMessage', { victimId: playerId, killerName: bossBot.username });
                io.emit('chatMessage', { username: 'System', message: `💀 ${bossBot.username} crushed ${player.username}!`, isSystem: true });
                updateLeaderboard();
            } else {
                const damage = Math.floor(10 + (player.radius / 20));
                damageBoss(playerId, Math.min(damage, 25));
                
                const angle = Math.atan2(player.y - bossBot.y, player.x - bossBot.x);
                player.x += Math.cos(angle) * 40;
                player.y += Math.sin(angle) * 40;
                bossBot.x -= Math.cos(angle) * 20;
                bossBot.y -= Math.sin(angle) * 20;
                io.emit('playerMoved', player);
                io.emit('updateBoss', bossBot);
                break;
            }
        }
    }
}

// 🎮 CHANGE GAME MODE
function changeGameMode() {
    const modes = Object.values(GAME_MODES);
    let newMode = modes[Math.floor(Math.random() * modes.length)];
    
    // Don't repeat the same mode
    while (newMode === currentGameMode && modes.length > 1) {
        newMode = modes[Math.floor(Math.random() * modes.length)];
    }
    
    currentGameMode = newMode;
    lastModeChange = Date.now();
    arenaShrinkCount = 0;
    ARENA_MIN_SIZE = 4000;
    
    let modeMessage = '';
    switch(currentGameMode) {
        case GAME_MODES.CLASSIC:
            modeMessage = '🍽️ CLASSIC MODE - Normal gameplay';
            break;
        case GAME_MODES.SPEED:
            modeMessage = '🏃 SPEED MODE - All players move 50% faster!';
            break;
        case GAME_MODES.HARDCORE:
            modeMessage = '💀 HARDCORE MODE - Die faster, bots stronger!';
            break;
        case GAME_MODES.SHIELD:
            modeMessage = '🛡️ SHIELD MODE - Everyone starts with shield!';
            break;
        case GAME_MODES.ARENA:
            modeMessage = '🎯 ARENA MODE - The map shrinks over time!';
            break;
        case GAME_MODES.BOSS_RUSH:
            modeMessage = '🐉 BOSS RUSH MODE - Bosses spawn every 3 minutes!';
            break;
    }
    
    io.emit('gameModeChange', { mode: currentGameMode, message: modeMessage });
    io.emit('chatMessage', { username: 'System', message: `🎮 GAME MODE CHANGED: ${modeMessage}`, isSystem: true });
    
    // Arena mode: reset map size
    if (currentGameMode === GAME_MODES.ARENA) {
        MAP_WIDTH = 4000;
        MAP_HEIGHT = 4000;
        io.emit('mapSizeUpdate', { width: MAP_WIDTH, height: MAP_HEIGHT });
    }
    
    // Boss Rush mode: spawn boss immediately
    if (currentGameMode === GAME_MODES.BOSS_RUSH && !bossBot) {
        spawnBossBot();
    }
}

// Change mode every 5 minutes
setInterval(() => {
    changeGameMode();
}, MODE_CHANGE_INTERVAL);

// Arena mode shrink effect
setInterval(() => {
    if (currentGameMode === GAME_MODES.ARENA && arenaShrinkCount < 20) {
        arenaShrinkCount++;
        MAP_WIDTH = Math.max(500, MAP_WIDTH * 0.95);
        MAP_HEIGHT = Math.max(500, MAP_HEIGHT * 0.95);
        io.emit('mapSizeUpdate', { width: MAP_WIDTH, height: MAP_HEIGHT });
        io.emit('chatMessage', { username: 'System', message: `🎯 Arena is shrinking! Map size: ${Math.floor(MAP_WIDTH)}x${Math.floor(MAP_HEIGHT)}`, isSystem: true });
    }
}, 30000);

// Initialize game
generateOrbs(600);
for (let i = 0; i < 8; i++) generateBot();
for (let i = 0; i < 3; i++) generatePowerup();

// Spawn first boss after 3 minutes
setTimeout(() => {
    if (!bossBot) spawnBossBot();
}, 180000);

// Boss spawn interval
setInterval(() => {
    if (!bossBot) {
        if (currentGameMode === GAME_MODES.BOSS_RUSH) {
            spawnBossBot();
        } else {
            spawnBossBot();
        }
    }
}, BOSS_SPAWN_INTERVAL);

// Boss despawn after 5 minutes
setInterval(() => {
    if (bossBot && Date.now() - bossSpawnTime > 300000) {
        io.emit('chatMessage', { username: 'System', message: `⏰ The boss ${bossBot.username} has retreated!`, isSystem: true });
        bossBot = null;
    }
}, 10000);

// Orb respawn
setInterval(() => {
    if (orbs.length < 400) {
        generateOrbs(80);
    } else {
        generateOrbs(20);
    }
}, 800);

// Power-up respawn
setInterval(() => {
    if (powerups.length < 5) {
        generatePowerup();
    }
}, 15000);

// Bot respawn
setInterval(() => {
    if (Object.keys(bots).length < 6) {
        generateBot();
    }
}, 15000);

// Map size update
setInterval(() => updateMapSize(), 1000);

// Bot AI movement
setInterval(() => {
    for (const id in bots) {
        const bot = bots[id];
        
        let nearestOrb = null, nearestDist = Infinity;
        for (const orb of orbs) {
            const dist = Math.hypot(bot.x - orb.x, bot.y - orb.y);
            if (dist < nearestDist) { nearestDist = dist; nearestOrb = orb; }
        }
        
        let nearestPlayer = null, playerDist = Infinity;
        for (const pid in players) {
            const dist = Math.hypot(bot.x - players[pid].x, bot.y - players[pid].y);
            if (dist < playerDist) { playerDist = dist; nearestPlayer = players[pid]; }
        }
        
        let moveX = 0, moveY = 0;
        let botSpeed = 3.5 * (bot.perks?.speedMultiplier || 1);
        
        if (currentGameMode === GAME_MODES.SPEED) {
            botSpeed *= 1.3;
        }
        
        if (nearestPlayer && playerDist < 350) {
            if (bot.radius > nearestPlayer.radius + 10) {
                const dx = nearestPlayer.x - bot.x, dy = nearestPlayer.y - bot.y, len = playerDist;
                if (len > 0) { moveX = (dx / len) * botSpeed; moveY = (dy / len) * botSpeed; }
            } else if (nearestPlayer.radius > bot.radius + 10) {
                const dx = bot.x - nearestPlayer.x, dy = bot.y - nearestPlayer.y, len = playerDist;
                if (len > 0) { moveX = (dx / len) * 5; moveY = (dy / len) * 5; }
            }
        }
        
        if (moveX === 0 && moveY === 0 && nearestOrb) {
            const dx = nearestOrb.x - bot.x, dy = nearestOrb.y - bot.y, len = Math.hypot(dx, dy);
            if (len > 0) { moveX = (dx / len) * 3; moveY = (dy / len) * 3; }
        }
        
        moveX += (Math.random() - 0.5) * 1.5;
        moveY += (Math.random() - 0.5) * 1.5;
        
        bot.x += moveX; bot.y += moveY;
        bot.x = Math.min(Math.max(bot.x, bot.radius + 5), MAP_WIDTH - bot.radius - 5);
        bot.y = Math.min(Math.max(bot.y, bot.radius + 5), MAP_HEIGHT - bot.radius - 5);
        
        for (let i = 0; i < orbs.length; i++) {
            const orb = orbs[i];
            if (Math.hypot(bot.x - orb.x, bot.y - orb.y) < bot.radius + orb.radius) {
                bot.score += orb.value;
                bot.radius = Math.min(100, 18 + Math.floor(bot.score / 100));
                orbs.splice(i, 1); i--;
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
    
    if (bossBot) {
        moveBossBot();
        checkBossCollisions();
    }
}, 40);

// Regular bot vs player collisions
setInterval(() => {
    for (const botId in bots) {
        const bot = bots[botId];
        for (const playerId in players) {
            const player = players[playerId];
            if (Math.hypot(bot.x - player.x, bot.y - player.y) < bot.radius + player.radius) {
                if (bot.radius > player.radius && !player.isAdmin) {
                    let gain = Math.floor((player.score / 3) + 100);
                    let lossPercent = 0.8;
                    
                    if (currentGameMode === GAME_MODES.HARDCORE) {
                        lossPercent = 0.95;
                        gain *= 1.5;
                    } else if (currentGameMode === GAME_MODES.SHIELD) {
                        lossPercent = 0.6;
                    }
                    
                    bot.score += gain;
                    bot.radius = Math.min(100, 18 + Math.floor(bot.score / 100));
                    player.score = Math.floor(player.score * (1 - lossPercent));
                    player.radius = Math.min(200, 20 + Math.floor(player.score / 50));
                    player.x = Math.random() * MAP_WIDTH;
                    player.y = Math.random() * MAP_HEIGHT;
                    const newLevel = getLevel(player.score);
                    player.level = newLevel;
                    player.title = getLevelTitle(newLevel);
                    player.perks = getPerks(newLevel);
                    io.emit('playerMoved', player);
                    io.emit('deathMessage', { victimId: playerId, killerName: bot.username });
                    updateLeaderboard();
                } else if (player.radius > bot.radius) {
                    let gain = Math.floor((bot.score / 2) + 100) * (player.perks?.scoreMultiplier || 1);
                    if (currentGameMode === GAME_MODES.HARDCORE) {
                        gain *= 1.5;
                    }
                    player.score += gain;
                    player.radius = Math.min(200, 20 + Math.floor(player.score / 50));
                    const newLevel = getLevel(player.score);
                    player.level = newLevel;
                    player.title = getLevelTitle(newLevel);
                    player.perks = getPerks(newLevel);
                    updateAllTimeLeaderboard(player.username, player.score);
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
    socket.emit('gameModeChange', { mode: currentGameMode, message: `Current mode: ${currentGameMode}` });
    socket.emit('allTimeLeaderboard', allTimeTop10);
    if (bossBot) {
        socket.emit('bossSpawned', bossBot);
        socket.emit('bossHealthUpdate', { health: bossHealth, maxHealth: 100 });
    }

    socket.on('joinGame', (data) => {
        const username = data.username, password = data.password || '';
        const skin = data.skin || 'classic';
        
        if (bannedPlayers.has(username)) {
            socket.emit('nameRejected', 'You are banned from this server!');
            return;
        }
        
        const isAdmin = (username === ADMIN_NAME && password === ADMIN_PASSWORD);
        
        if (username === ADMIN_NAME && !isAdmin) {
            socket.emit('nameRejected', 'Username "RYZZ" is reserved for the admin!');
            return;
        }
        
        let existingPlayerId = null;
        for (let id in players) {
            if (players[id].username === username) {
                existingPlayerId = id;
                break;
            }
        }
        
        if (existingPlayerId) {
            const oldSocket = io.sockets.sockets.get(existingPlayerId);
            if (oldSocket) oldSocket.disconnect();
            delete players[existingPlayerId];
        }
        
        const personalBest = getPersonalBest(username);
        
        // Shield mode: start with shield active
        let hasShield = false;
        let shieldEndTime = 0;
        if (currentGameMode === GAME_MODES.SHIELD) {
            hasShield = true;
            shieldEndTime = Date.now() + 10000; // 10 second shield
        }
        
        players[socket.id] = {
            id: socket.id, username: username, x: Math.random() * MAP_WIDTH, y: Math.random() * MAP_HEIGHT,
            radius: 20, score: 0, level: 1, title: '🍼 Newbie', perks: getPerks(1),
            isAdmin: isAdmin, kills: 0, activePowerup: hasShield ? 'shield' : null, 
            powerupEndTime: shieldEndTime, personalBest: personalBest, skin: skin
        };
        
        socket.emit('currentOrbs', orbs);
        socket.emit('currentPowerups', powerups);
        socket.emit('currentPlayers', players);
        socket.emit('currentBots', bots);
        socket.emit('mapSizeUpdate', { width: MAP_WIDTH, height: MAP_HEIGHT });
        socket.emit('adminConfirm', isAdmin);
        socket.emit('personalBestUpdate', personalBest);
        socket.broadcast.emit('newPlayer', players[socket.id]);
        updateLeaderboard();
    });

    socket.on('playerMovement', (data) => {
        const player = players[socket.id];
        if (player) { player.x = data.x; player.y = data.y; socket.broadcast.emit('playerMoved', player); }
    });

    socket.on('collectOrb', (orbId) => {
        const player = players[socket.id];
        if (!player) return;
        const orbIndex = orbs.findIndex(o => o.id === orbId);
        if (orbIndex === -1) return;
        const orb = orbs[orbIndex];
        orbs.splice(orbIndex, 1);
        
        let multiplier = 1;
        if (player.activePowerup === 'double' && Date.now() < player.powerupEndTime) multiplier = 2;
        
        let points = Math.floor(orb.value * multiplier * (player.perks?.scoreMultiplier || 1));
        
        // Hardcore mode: double points
        if (currentGameMode === GAME_MODES.HARDCORE) {
            points *= 2;
        }
        
        player.score += points;
        player.radius = Math.min(200, 20 + Math.floor(player.score / 50));
        
        const newLevel = getLevel(player.score);
        if (newLevel !== player.level) {
            player.level = newLevel;
            player.title = getLevelTitle(newLevel);
            player.perks = getPerks(newLevel);
            io.emit('chatMessage', { username: 'System', message: `🎉 ${player.username} reached ${player.title} (Level ${player.level})!`, isSystem: true });
        }
        
        updateAllTimeLeaderboard(player.username, player.score);
        if (player.score > player.personalBest) {
            player.personalBest = player.score;
            socket.emit('personalBestUpdate', player.personalBest);
        }
        
        updateLeaderboard();
        io.emit('scoreUpdate', {
            id: socket.id, score: player.score, radius: player.radius,
            level: player.level, title: player.title, perks: player.perks, kills: player.kills,
            activePowerup: player.activePowerup, powerupEndTime: player.powerupEndTime,
            skin: player.skin
        });
        io.emit('orbCollected', orbId);
    });

    socket.on('collectPowerup', (powerupId) => {
        const player = players[socket.id];
        if (!player) return;
        const powerupIndex = powerups.findIndex(p => p.id === powerupId);
        if (powerupIndex === -1) return;
        const powerup = powerups[powerupIndex];
        powerups.splice(powerupIndex, 1);
        
        player.activePowerup = powerup.type;
        player.powerupEndTime = Date.now() + powerup.duration;
        
        setTimeout(() => {
            if (players[socket.id] && players[socket.id].activePowerup === powerup.type) {
                players[socket.id].activePowerup = null;
                players[socket.id].powerupEndTime = 0;
                io.emit('scoreUpdate', {
                    id: socket.id, score: player.score, radius: player.radius,
                    level: player.level, title: player.title, perks: player.perks, kills: player.kills,
                    activePowerup: null, powerupEndTime: 0,
                    skin: player.skin
                });
                io.emit('chatMessage', { username: 'System', message: `⏰ ${powerup.name} wore off!`, isSystem: true });
            }
        }, powerup.duration);
        
        io.emit('powerupCollected', powerupId);
        io.emit('scoreUpdate', {
            id: socket.id, score: player.score, radius: player.radius,
            level: player.level, title: player.title, perks: player.perks, kills: player.kills,
            activePowerup: player.activePowerup, powerupEndTime: player.powerupEndTime,
            skin: player.skin
        });
        io.emit('chatMessage', { username: 'System', message: `⚡ ${player.username} got ${powerup.name}!`, isSystem: true });
    });

    socket.on('eatPlayer', (targetId) => {
        const eater = players[socket.id], target = players[targetId];
        if (!eater || !target) return;
        
        if (eater.level < target.level) {
            io.emit('chatMessage', { username: 'System', message: `🛡️ ${target.username} (Lvl ${target.level}) is too high level for ${eater.username} (Lvl ${eater.level}) to eat!`, isSystem: true });
            const angle = Math.atan2(eater.y - target.y, eater.x - target.x);
            eater.x += Math.cos(angle) * 30;
            eater.y += Math.sin(angle) * 30;
            target.x -= Math.cos(angle) * 30;
            target.y -= Math.sin(angle) * 30;
            io.emit('playerMoved', eater);
            io.emit('playerMoved', target);
            return;
        }
        
        const targetHasShield = (target.activePowerup === 'shield' && Date.now() < target.powerupEndTime);
        
        if (eater.radius > target.radius && !target.isAdmin && !targetHasShield) {
            let multiplier = 1;
            if (eater.activePowerup === 'double' && Date.now() < eater.powerupEndTime) multiplier = 2;
            
            const levelDiff = eater.level - target.level;
            const levelBonusPoints = Math.max(0, levelDiff * 50);
            
            let gain = Math.floor((target.score / 2) + 100 + levelBonusPoints) * multiplier * (eater.perks?.scoreMultiplier || 1);
            
            // Hardcore mode: bonus points
            if (currentGameMode === GAME_MODES.HARDCORE) {
                gain *= 1.5;
            }
            
            eater.score += gain;
            eater.radius = Math.min(200, 20 + Math.floor(eater.score / 50));
            eater.kills = (eater.kills || 0) + 1;
            
            const newEaterLevel = getLevel(eater.score);
            if (newEaterLevel !== eater.level) {
                eater.level = newEaterLevel;
                eater.title = getLevelTitle(newEaterLevel);
                eater.perks = getPerks(newEaterLevel);
                io.emit('chatMessage', { username: 'System', message: `🎉 ${eater.username} reached ${eater.title} (Level ${eater.level})!`, isSystem: true });
            }
            
            updateAllTimeLeaderboard(eater.username, eater.score);
            if (eater.score > eater.personalBest) {
                eater.personalBest = eater.score;
                socket.emit('personalBestUpdate', eater.personalBest);
            }
            
            let lossPercent = 0.8;
            if (currentGameMode === GAME_MODES.HARDCORE) {
                lossPercent = 0.95;
            } else if (currentGameMode === GAME_MODES.SHIELD) {
                lossPercent = 0.6;
            }
            
            target.score = Math.floor(target.score * (1 - lossPercent));
            target.radius = Math.min(200, 20 + Math.floor(target.score / 50));
            target.x = Math.random() * MAP_WIDTH;
            target.y = Math.random() * MAP_HEIGHT;
            
            const newTargetLevel = getLevel(target.score);
            if (newTargetLevel !== target.level) {
                target.level = newTargetLevel;
                target.title = getLevelTitle(newTargetLevel);
                target.perks = getPerks(newTargetLevel);
            }
            
            updateLeaderboard();
            io.emit('scoreUpdate', { id: socket.id, score: eater.score, radius: eater.radius, level: eater.level, title: eater.title, perks: eater.perks, kills: eater.kills, activePowerup: eater.activePowerup, powerupEndTime: eater.powerupEndTime, skin: eater.skin });
            io.emit('scoreUpdate', { id: targetId, score: target.score, radius: target.radius, level: target.level, title: target.title, perks: target.perks, kills: target.kills, activePowerup: target.activePowerup, powerupEndTime: target.powerupEndTime, skin: target.skin });
            io.emit('playerMoved', target);
            io.emit('deathMessage', { victimId: targetId, killerName: eater.username });
            io.emit('chatMessage', { username: 'System', message: `🍽️ ${eater.username} (Lvl ${eater.level}) ate ${target.username}! +${formatScore(gain)}`, isSystem: true });
        } else if (targetHasShield) {
            io.emit('chatMessage', { username: 'System', message: `🛡️ ${target.username}'s shield blocked the attack!`, isSystem: true });
        } else {
            const angle = Math.atan2(eater.y - target.y, eater.x - target.x);
            eater.x += Math.cos(angle) * 20;
            eater.y += Math.sin(angle) * 20;
            target.x -= Math.cos(angle) * 20;
            target.y -= Math.sin(angle) * 20;
            io.emit('playerMoved', eater);
            io.emit('playerMoved', target);
        }
    });

    // Admin handlers
    socket.on('adminGivePoints', (points) => {
        const player = players[socket.id];
        if (player && player.isAdmin) {
            player.score += points;
            player.radius = Math.min(200, 20 + Math.floor(player.score / 50));
            const newLevel = getLevel(player.score);
            if (newLevel !== player.level) {
                player.level = newLevel;
                player.title = getLevelTitle(newLevel);
                player.perks = getPerks(newLevel);
            }
            updateAllTimeLeaderboard(player.username, player.score);
            if (player.score > player.personalBest) {
                player.personalBest = player.score;
                socket.emit('personalBestUpdate', player.personalBest);
            }
            updateLeaderboard();
            io.emit('scoreUpdate', { id: socket.id, score: player.score, radius: player.radius, level: player.level, title: player.title, perks: player.perks, kills: player.kills, activePowerup: player.activePowerup, powerupEndTime: player.powerupEndTime, skin: player.skin });
            socket.emit('chatMessage', { username: 'System', message: `👑 Admin added +${formatScore(points)} points!`, isSystem: true });
        }
    });

    socket.on('adminHeal', () => {
        const player = players[socket.id];
        if (player && player.isAdmin) {
            player.radius = Math.min(200, 20 + Math.floor(player.score / 50));
            io.emit('scoreUpdate', { id: socket.id, score: player.score, radius: player.radius, level: player.level, title: player.title, perks: player.perks, kills: player.kills, activePowerup: player.activePowerup, powerupEndTime: player.powerupEndTime, skin: player.skin });
            socket.emit('chatMessage', { username: 'System', message: `💚 Admin healed! Size: ${Math.floor(player.radius)}`, isSystem: true });
        }
    });

    socket.on('adminMaxSize', () => {
        const player = players[socket.id];
        if (player && player.isAdmin) {
            player.radius = 200;
            io.emit('scoreUpdate', { id: socket.id, score: player.score, radius: player.radius, level: player.level, title: player.title, perks: player.perks, kills: player.kills, activePowerup: player.activePowerup, powerupEndTime: player.powerupEndTime, skin: player.skin });
            socket.emit('chatMessage', { username: 'System', message: `💪 Admin set to MAX SIZE (200)!`, isSystem: true });
        }
    });

    socket.on('adminSpawnOrbs', () => {
        const player = players[socket.id];
        if (player && player.isAdmin) {
            generateOrbs(50);
            io.emit('chatMessage', { username: 'System', message: `🟡 Admin spawned 50 extra orbs! Total: ${orbs.length}`, isSystem: true });
        }
    });

    socket.on('adminKickPlayer', (targetUsername) => {
        const admin = players[socket.id];
        if (!admin || !admin.isAdmin) return;
        for (const id in players) {
            if (players[id].username === targetUsername && !players[id].isAdmin) {
                io.to(id).emit('kicked', `Kicked by admin ${admin.username}`);
                const targetSocket = io.sockets.sockets.get(id);
                if (targetSocket) targetSocket.disconnect();
                delete players[id];
                io.emit('chatMessage', { username: 'System', message: `${targetUsername} was kicked`, isSystem: true });
                updateLeaderboard();
                break;
            }
        }
    });

    socket.on('adminBanPlayer', (targetUsername) => {
        const admin = players[socket.id];
        if (!admin || !admin.isAdmin) return;
        bannedPlayers.add(targetUsername);
        for (const id in players) {
            if (players[id].username === targetUsername && !players[id].isAdmin) {
                io.to(id).emit('banned', `Banned by admin ${admin.username}`);
                const targetSocket = io.sockets.sockets.get(id);
                if (targetSocket) targetSocket.disconnect();
                delete players[id];
                io.emit('chatMessage', { username: 'System', message: `${targetUsername} was banned`, isSystem: true });
                updateLeaderboard();
                break;
            }
        }
    });

    socket.on('adminSetGameMode', (mode) => {
        const admin = players[socket.id];
        if (!admin || !admin.isAdmin) return;
        if (GAME_MODES[mode.toUpperCase()]) {
            currentGameMode = GAME_MODES[mode.toUpperCase()];
            io.emit('gameModeChange', { mode: currentGameMode, message: `Admin set mode to ${currentGameMode}` });
            io.emit('chatMessage', { username: 'System', message: `👑 Admin changed game mode to ${currentGameMode.toUpperCase()}!`, isSystem: true });
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
                    socket.emit('chatMessage', { username: 'System', message: 'Commands: /kick, /clear, /list, /orbs, /bots, /map, /perks, /top10, /mode [classic/speed/hardcore/shield/arena/boss_rush]', isSystem: true });
                    break;
                case '/mode':
                    if (parts.length < 2) {
                        socket.emit('chatMessage', { username: 'System', message: 'Usage: /mode [classic/speed/hardcore/shield/arena/boss_rush]', isSystem: true });
                        return;
                    }
                    const modeName = parts[1].toLowerCase();
                    if (GAME_MODES[modeName.toUpperCase()]) {
                        currentGameMode = GAME_MODES[modeName.toUpperCase()];
                        io.emit('gameModeChange', { mode: currentGameMode, message: `Admin set mode to ${currentGameMode}` });
                        io.emit('chatMessage', { username: 'System', message: `👑 Admin changed game mode to ${currentGameMode.toUpperCase()}!`, isSystem: true });
                    } else {
                        socket.emit('chatMessage', { username: 'System', message: `Unknown mode: ${modeName}. Available: classic, speed, hardcore, shield, arena, boss_rush`, isSystem: true });
                    }
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
                    for (const id in players) if (!players[id].isAdmin) delete players[id];
                    io.emit('chatMessage', { username: 'System', message: 'All non-admin players cleared', isSystem: true });
                    updateLeaderboard();
                    break;
                case '/list':
                    const list = [];
                    for (const id in players) list.push(`${players[id].username}${players[id].isAdmin ? '👑' : ''} (Lvl ${players[id].level} - ${formatScore(players[id].score)} - ${players[id].kills || 0} kills)`);
                    socket.emit('chatMessage', { username: 'System', message: `Online: ${list.join(', ')}`, isSystem: true });
                    break;
                case '/top10':
                    let msg = '🏆 ALL-TIME TOP 10 🏆\n';
                    allTimeTop10.forEach((entry, i) => { msg += `${i+1}. ${entry.username} - ${formatScore(entry.score)}\n`; });
                    socket.emit('chatMessage', { username: 'System', message: msg, isSystem: true });
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
                case '/perks':
                    const perks = player.perks;
                    socket.emit('chatMessage', { username: 'System', message: `Your perks: ⚡${(perks.speedMultiplier*100).toFixed(0)}% Speed | 💪${(perks.sizeMultiplier*100).toFixed(0)}% Size | 💰${(perks.scoreMultiplier*100).toFixed(0)}% Score | 🎯${(perks.eatRangeMultiplier*100).toFixed(0)}% Range | ⚔️ ${player.kills || 0} kills`, isSystem: true });
                    break;
                default:
                    socket.emit('chatMessage', { username: 'System', message: 'Type /help for commands', isSystem: true });
            }
        } else {
            io.emit('chatMessage', { username: player.username, message: data.message, isAdmin: player.isAdmin, isSystem: false });
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
    const list = [];
    for (const id in players) list.push({ username: players[id].username, score: players[id].score, level: players[id].level, title: players[id].title, isAdmin: players[id].isAdmin, kills: players[id].kills || 0 });
    for (const id in bots) list.push({ username: '🤖 ' + bots[id].username, score: bots[id].score, level: bots[id].level, title: bots[id].title, isAdmin: false, kills: bots[id].kills || 0 });
    if (bossBot) list.push({ username: '👑 ' + bossBot.username, score: bossBot.score, level: bossBot.level, title: 'BOSS', isAdmin: false, kills: 0 });
    list.sort((a, b) => b.score - a.score);
    io.emit('leaderboardUpdate', list.slice(0, 10));
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n✅ RYZZ.io GAME MODES server running!`);
    console.log(`🎮 Game modes: Classic, Speed, Hardcore, Shield, Arena, Boss Rush`);
    console.log(`🎲 Mode changes every 5 minutes automatically!`);
    console.log(`👑 Admin can change mode with /mode [name]`);
    console.log(`🟡 Orbs: ${orbs.length} - Respawning constantly`);
    console.log(`👑 Boss bot spawns regularly!`);
    console.log(`🛡️ Low level players CANNOT eat higher level players!`);
    console.log(`👑 Admin: ${ADMIN_NAME}\n`);
});
