const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);

// 🔧 PERFORMANCE OPTIMIZATIONS
app.set('trust proxy', 1);
app.enable('view cache');

// Socket.IO with performance settings
const io = socketIO(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    // Performance settings
    pingTimeout: 60000,
    pingInterval: 25000,
    upgradeTimeout: 10000,
    allowUpgrades: true,
    cookie: false,
    serveClient: false,
    // Reduce packet size
    perMessageDeflate: {
        threshold: 1024 // Only compress messages > 1KB
    },
    transports: ['websocket', 'polling'], // WebSocket first for speed
    allowEIO3: true
});

// Increase server timeout for slow connections
server.timeout = 120000;
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;

app.use(express.static(path.join(__dirname, 'public'), {
    maxAge: '1d', // Cache static files
    etag: true,
    lastModified: true
}));

const ADMIN_NAME = 'RYZZ';
const ADMIN_PASSWORD = 'ryzzking2024';

let players = {};
let bots = {};

const MAP_WIDTH = 4000;
const MAP_HEIGHT = 4000;

let orbs = [];

const botNames = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Echo', 'Zeta', 'Theta', 'Sigma', 'Omega', 'Nova', 'Rex', 'Luna', 'Orion', 'Atlas'];

// Pre-allocate arrays for better performance
const orbColors = ['#fbbf24', '#22c55e', '#3b82f6', '#a855f7'];
const orbValues = [10, 25, 50, 100];

// Cache for leaderboard to reduce broadcasts
let cachedLeaderboard = [];
let lastLeaderboardUpdate = 0;
const LEADERBOARD_CACHE_MS = 500;

function generateOrbs(count) {
    const newOrbs = [];
    for (let i = 0; i < count; i++) {
        const idx = Math.floor(Math.random() * orbColors.length);
        newOrbs.push({
            id: Math.random().toString(36).substr(2, 8),
            x: Math.random() * MAP_WIDTH,
            y: Math.random() * MAP_HEIGHT,
            radius: 8,
            value: orbValues[idx],
            color: orbColors[idx]
        });
    }
    orbs.push(...newOrbs);
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

// Initialize game
generateOrbs(400);
for (let i = 0; i < 10; i++) {
    generateBot();
}

// Optimized orb respawn - less frequent but more orbs
setInterval(() => {
    if (orbs.length < 250) {
        generateOrbs(80);
        console.log(`Low on orbs (${orbs.length}), generated 80 more`);
    } else if (orbs.length < 350) {
        generateOrbs(30);
    }
}, 2500);

// Bot respawn
setInterval(() => {
    const botCount = Object.keys(bots).length;
    if (botCount < 8) {
        generateBot();
        console.log(`Low bots (${botCount}), spawned new one`);
    }
}, 15000);

// Optimized bot AI - fewer calculations, smoother movement
let lastBotMove = 0;
const BOT_MOVE_INTERVAL = 50; // 50ms = 20fps for bots

function updateBots() {
    const now = Date.now();
    if (now - lastBotMove < BOT_MOVE_INTERVAL) return;
    lastBotMove = now;
    
    const playersList = Object.values(players);
    const orbsList = orbs;
    
    for (const id in bots) {
        const bot = bots[id];
        
        // Find nearest orb (optimized)
        let nearestOrb = null;
        let nearestDist = Infinity;
        for (let i = 0; i < orbsList.length; i++) {
            const orb = orbsList[i];
            const dx = bot.x - orb.x;
            const dy = bot.y - orb.y;
            const dist = dx * dx + dy * dy;
            if (dist < nearestDist) {
                nearestDist = dist;
                nearestOrb = orb;
            }
        }
        
        // Find nearest player
        let nearestPlayer = null;
        let playerDist = Infinity;
        for (let i = 0; i < playersList.length; i++) {
            const p = playersList[i];
            const dx = bot.x - p.x;
            const dy = bot.y - p.y;
            const dist = dx * dx + dy * dy;
            if (dist < playerDist) {
                playerDist = dist;
                nearestPlayer = p;
            }
        }
        
        let moveX = 0, moveY = 0;
        
        if (nearestPlayer && playerDist < 122500) { // 350^2
            const dist = Math.sqrt(playerDist);
            if (bot.radius > nearestPlayer.radius + 10) {
                const dx = nearestPlayer.x - bot.x;
                const dy = nearestPlayer.y - bot.y;
                const len = dist;
                if (len > 0) {
                    moveX = (dx / len) * 4.5;
                    moveY = (dy / len) * 4.5;
                }
            } else if (nearestPlayer.radius > bot.radius + 10) {
                const dx = bot.x - nearestPlayer.x;
                const dy = bot.y - nearestPlayer.y;
                const len = dist;
                if (len > 0) {
                    moveX = (dx / len) * 6;
                    moveY = (dy / len) * 6;
                }
            }
        }
        
        if (moveX === 0 && moveY === 0 && nearestOrb) {
            const dx = nearestOrb.x - bot.x;
            const dy = nearestOrb.y - bot.y;
            const len = Math.hypot(dx, dy);
            if (len > 0) {
                moveX = (dx / len) * 3.5;
                moveY = (dy / len) * 3.5;
            }
        }
        
        moveX += (Math.random() - 0.5) * 1.5;
        moveY += (Math.random() - 0.5) * 1.5;
        
        bot.x += moveX;
        bot.y += moveY;
        bot.x = Math.min(Math.max(bot.x, bot.radius + 5), MAP_WIDTH - bot.radius - 5);
        bot.y = Math.min(Math.max(bot.y, bot.radius + 5), MAP_HEIGHT - bot.radius - 5);
        
        // Bot collects orbs (optimized with backwards loop)
        for (let i = orbsList.length - 1; i >= 0; i--) {
            const orb = orbsList[i];
            const dx = bot.x - orb.x;
            const dy = bot.y - orb.y;
            if (dx * dx + dy * dy < (bot.radius + orb.radius) ** 2) {
                bot.score += orb.value;
                bot.radius = Math.min(100, 18 + Math.floor(bot.score / 70));
                orbs.splice(i, 1);
            }
        }
    }
    io.emit('updateBots', bots);
}

// Bot vs player collisions (optimized)
function checkBotCollisions() {
    const playersList = Object.values(players);
    const botsList = Object.values(bots);
    
    for (const bot of botsList) {
        for (const player of playersList) {
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
                    delete bots[bot.id];
                    generateBot();
                    updateLeaderboard();
                    break;
                }
            }
        }
    }
}

// Start optimized intervals
setInterval(() => {
    updateBots();
}, BOT_MOVE_INTERVAL);

setInterval(() => {
    checkBotCollisions();
}, 100);

io.on('connection', (socket) => {
    console.log(`[CONNECT] ${socket.id} from ${socket.handshake.address}`);
    
    // Send initial data immediately
    socket.emit('currentOrbs', orbs);
    socket.emit('currentPlayers', players);
    socket.emit('currentBots', bots);

    socket.on('joinGame', (data) => {
        const username = data.username;
        const password = data.password || '';
        const isAdmin = (username === ADMIN_NAME && password === ADMIN_PASSWORD);
        
        // Quick duplicate check
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
        
        socket.emit('adminConfirm', isAdmin);
        socket.broadcast.emit('newPlayer', players[socket.id]);
        updateLeaderboard();
        
        console.log(`[JOIN] ${username} (Admin: ${isAdmin})`);
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
        
        // Fast orb lookup
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
        // Orb not found
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
                    socket.emit('chatMessage', { username: 'System', message: `Unknown command. Type /help`, isSystem: true });
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
            console.log(`[DISCONNECT] ${socket.id}`);
        }
    });
});

function updateLeaderboard() {
    const now = Date.now();
    if (now - lastLeaderboardUpdate < LEADERBOARD_CACHE_MS && cachedLeaderboard.length > 0) {
        io.emit('leaderboardUpdate', cachedLeaderboard);
        return;
    }
    
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
    cachedLeaderboard = list.slice(0, 10);
    lastLeaderboardUpdate = now;
    io.emit('leaderboardUpdate', cachedLeaderboard);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n✅ RYZZ.io HIGH PERFORMANCE server running!`);
    console.log(`📡 Port: ${PORT}`);
    console.log(`🗺️ Map: ${MAP_WIDTH}x${MAP_HEIGHT}`);
    console.log(`🤖 Bots: ${Object.keys(bots).length}`);
    console.log(`🟡 Orbs: ${orbs.length}`);
    console.log(`👑 Admin: ${ADMIN_NAME}`);
    console.log(`\n⚡ Performance optimizations enabled:`);
    console.log(`   • WebSocket first transport`);
    console.log(`   • Leaderboard caching (${LEADERBOARD_CACHE_MS}ms)`);
    console.log(`   • Optimized bot AI (${BOT_MOVE_INTERVAL}ms interval)`);
    console.log(`   • Static file caching (1d max age)`);
    console.log(`   • Increased timeouts for slow connections\n`);
});
