// Admin button handlers
socket.on('adminGivePoints', (points) => {
    const player = players[socket.id];
    if (player && player.isAdmin) {
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
            perks: player.perks,
            kills: player.kills
        });
        io.emit('chatMessage', { username: 'System', message: `👑 Admin gave themselves +${formatScore(points)} points!`, isSystem: true });
    }
});

socket.on('adminHeal', () => {
    const player = players[socket.id];
    if (player && player.isAdmin) {
        player.radius = Math.max(20, player.radius);
        io.emit('scoreUpdate', {
            id: socket.id,
            score: player.score,
            radius: player.radius,
            level: player.level,
            title: player.title,
            perks: player.perks,
            kills: player.kills
        });
        socket.emit('chatMessage', { username: 'System', message: `💚 Admin healed to size ${Math.floor(player.radius)}!`, isSystem: true });
    }
});

socket.on('adminMaxSize', () => {
    const player = players[socket.id];
    if (player && player.isAdmin) {
        player.radius = 120;
        io.emit('scoreUpdate', {
            id: socket.id,
            score: player.score,
            radius: player.radius,
            level: player.level,
            title: player.title,
            perks: player.perks,
            kills: player.kills
        });
        socket.emit('chatMessage', { username: 'System', message: `💪 Admin set size to MAX (120)!`, isSystem: true });
    }
});

socket.on('adminSpawnOrbs', () => {
    const player = players[socket.id];
    if (player && player.isAdmin) {
        generateOrbs(50);
        io.emit('chatMessage', { username: 'System', message: `🟡 Admin spawned 50 extra orbs on the map!`, isSystem: true });
    }
});
