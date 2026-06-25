import express from 'express';
import { createServer } from 'node:http';
import cors from 'cors';
import { Server } from 'socket.io';

const PORT = Number(process.env.PORT || 3001);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || '*';

const app = express();
app.use(cors({ origin: CLIENT_ORIGIN === '*' ? true : CLIENT_ORIGIN }));
app.get('/health', (_req, res) => res.json({ ok: true }));

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: CLIENT_ORIGIN === '*' ? true : CLIENT_ORIGIN, methods: ['GET', 'POST'] }
});

type MissionStage = 1 | 2 | 3 | 4 | 5;
type RoomInfo = {
  hostId: string;
  seed: number;
  players: Set<string>;
  started: boolean;
  missionStage: MissionStage;
  difficultyByPlayer: Map<string, number>;
  healthByPlayer: Map<string, number>;
};

const rooms = new Map<string, RoomInfo>();

function makeCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  do {
    code = Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function emitSharedDifficulty(roomCode: string, room: RoomInfo): void {
  const values = [...room.difficultyByPlayer.values()];
  const level = values.length ? Math.max(...values) : 0.5;
  io.to(roomCode).emit('shared-difficulty', { level });
}

function promoteLivingHost(roomCode: string, room: RoomInfo): void {
  const currentHealth = room.healthByPlayer.get(room.hostId) ?? 0;
  if (currentHealth > 0 && room.players.has(room.hostId)) return;

  const livingPlayer = [...room.players].find(
    (playerId) => (room.healthByPlayer.get(playerId) ?? 0) > 0
  );

  // Fall back to any connected player so authority is never left empty.
  const nextHostId = livingPlayer || [...room.players][0];
  if (!nextHostId || nextHostId === room.hostId) return;

  room.hostId = nextHostId;
  io.to(roomCode).emit('host-changed', { hostId: nextHostId });
}

io.on('connection', (socket) => {
  socket.on('create-room', () => {
    const roomCode = makeCode();
    const seed = Math.floor(Math.random() * 2_000_000_000);
    rooms.set(roomCode, {
      hostId: socket.id,
      seed,
      players: new Set([socket.id]),
      started: false,
      missionStage: 1,
      difficultyByPlayer: new Map([[socket.id, 0.5]]),
      healthByPlayer: new Map([[socket.id, 100]])
    });
    socket.join(roomCode);
    socket.data.roomCode = roomCode;
    socket.emit('room-created', { roomCode, seed, hostId: socket.id, playerId: socket.id });
  });

  socket.on('join-room', (rawCode: string) => {
    const roomCode = String(rawCode || '').toUpperCase();
    const room = rooms.get(roomCode);
    if (!room) return socket.emit('room-error', 'Room not found');
    if (room.players.size >= 2) return socket.emit('room-error', 'Room is full');

    room.players.add(socket.id);
    room.difficultyByPlayer.set(socket.id, 0.5);
    room.healthByPlayer.set(socket.id, 100);
    socket.join(roomCode);
    socket.data.roomCode = roomCode;
    socket.emit('room-joined', { roomCode, seed: room.seed, hostId: room.hostId, playerId: socket.id });
    socket.to(roomCode).emit('player-joined', socket.id);
  });

  socket.on('start-room', (ack?: (response: { ok: boolean; message?: string }) => void) => {
    const roomCode = socket.data.roomCode;
    const room = rooms.get(roomCode);
    if (!room) {
      ack?.({ ok: false, message: 'Room not found' });
      return socket.emit('room-error', 'Room not found');
    }
    if (socket.id !== room.hostId) {
      ack?.({ ok: false, message: 'Only the host can start the game' });
      return socket.emit('room-error', 'Only the host can start the game');
    }
    if (room.players.size < 2) {
      ack?.({ ok: false, message: 'Waiting for the second player' });
      return socket.emit('room-error', 'Waiting for the second player');
    }

    room.started = true;
    room.missionStage = 1;
    ack?.({ ok: true });

    for (const playerId of room.players) {
      io.to(playerId).emit('room-started', {
        roomCode,
        seed: room.seed,
        hostId: room.hostId,
        playerId
      });
    }

    io.to(roomCode).emit('mission-stage', { stage: room.missionStage });
    emitSharedDifficulty(roomCode, room);
  });

  socket.on('player-state', (state) => {
    const roomCode = socket.data.roomCode;
    const room = rooms.get(roomCode);
    if (!room || !room.players.has(socket.id)) return;

    const health = Math.max(0, Number(state?.health) || 0);
    room.healthByPlayer.set(socket.id, health);

    socket.to(roomCode).emit('player-state', { ...state, health, id: socket.id });

    if (health <= 0) promoteLivingHost(roomCode, room);
  });

  socket.on('shot', (data) => {
    const roomCode = socket.data.roomCode;
    if (roomCode) socket.to(roomCode).emit('remote-shot', { ...data, id: socket.id });
  });

  socket.on('player-damage', ({ targetId, amount }) => {
    const roomCode = socket.data.roomCode;
    const room = rooms.get(roomCode);
    if (!room || !room.players.has(targetId)) return;

    const safeAmount = Math.max(0, Number(amount) || 0);
    const previousHealth = room.healthByPlayer.get(targetId) ?? 100;
    const nextHealth = Math.max(0, previousHealth - safeAmount);
    room.healthByPlayer.set(targetId, nextHealth);

    // Deliver damage to the victim and publish their resulting health to the
    // teammate immediately. Host migration no longer depends on the victim's
    // browser successfully sending one more frame after death.
    io.to(targetId).emit('player-damage', {
      amount: safeAmount,
      attackerId: socket.id,
      health: nextHealth
    });
    socket.to(roomCode).emit('player-health', {
      id: targetId,
      health: nextHealth
    });

    if (nextHealth <= 0) promoteLivingHost(roomCode, room);
  });

  socket.on('zombie-hit', ({ index }) => {
    const roomCode = socket.data.roomCode;
    const room = rooms.get(roomCode);
    if (!room) return;
    io.to(room.hostId).emit('zombie-hit', { index, shooterId: socket.id });
  });

  socket.on('zombie-snapshot', (snapshot) => {
    const roomCode = socket.data.roomCode;
    const room = rooms.get(roomCode);
    if (!room || socket.id !== room.hostId) return;
    socket.to(roomCode).emit('zombie-snapshot', snapshot);
  });

  socket.on('difficulty-report', ({ level }) => {
    const roomCode = socket.data.roomCode;
    const room = rooms.get(roomCode);
    if (!room || !room.players.has(socket.id)) return;
    const safeLevel = Math.max(0.2, Math.min(1, Number(level) || 0.5));
    room.difficultyByPlayer.set(socket.id, safeLevel);
    emitSharedDifficulty(roomCode, room);
  });

  socket.on('mission-stage-request', ({ stage }) => {
    const roomCode = socket.data.roomCode;
    const room = rooms.get(roomCode);
    if (!room || !room.started) return;

    const requested = Number(stage) as MissionStage;
    if (![2, 3, 4, 5].includes(requested)) return;

    // Stage 2 and 4 come from the host after a shared zombie wave is cleared.
    if ((requested === 2 || requested === 4) && socket.id !== room.hostId) return;

    // Enforce strict order so nobody can skip the second wave or finish early.
    if (requested !== room.missionStage + 1) return;

    room.missionStage = requested;
    io.to(roomCode).emit('mission-stage', { stage: room.missionStage });
  });

  socket.on('disconnect', () => {
    const roomCode = socket.data.roomCode;
    if (!roomCode) return;
    const room = rooms.get(roomCode);
    if (!room) return;

    const disconnectedWasHost = socket.id === room.hostId;

    room.players.delete(socket.id);
    room.difficultyByPlayer.delete(socket.id);
    room.healthByPlayer.delete(socket.id);
    socket.to(roomCode).emit('player-left', socket.id);

    if (room.players.size === 0) {
      rooms.delete(roomCode);
      return;
    }

    if (disconnectedWasHost) {
      const nextHostId = [...room.players][0];
      room.hostId = nextHostId;
      io.to(roomCode).emit('host-changed', { hostId: nextHostId });
    }

    emitSharedDifficulty(roomCode, room);
  });
});

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Multiplayer server running on port ${PORT}`);
});
