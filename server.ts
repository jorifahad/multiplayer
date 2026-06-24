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

type RoomInfo = { hostId: string; seed: number; players: Set<string>; started: boolean };
const rooms = new Map<string, RoomInfo>();

function makeCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  do {
    code = Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (rooms.has(code));
  return code;
}

io.on('connection', (socket) => {
  socket.on('create-room', () => {
    const roomCode = makeCode();
    const seed = Math.floor(Math.random() * 2_000_000_000);
    rooms.set(roomCode, { hostId: socket.id, seed, players: new Set([socket.id]), started: false });
    socket.join(roomCode);
    socket.data.roomCode = roomCode;
    socket.emit('room-created', { roomCode, seed, hostId: socket.id, playerId: socket.id });
  });

  socket.on('join-room', (rawCode: string) => {
    const roomCode = String(rawCode || '').toUpperCase();
    const room = rooms.get(roomCode);
    if (!room) return socket.emit('room-error', 'الغرفة غير موجودة');
    if (room.players.size >= 2) return socket.emit('room-error', 'الغرفة ممتلئة');
    room.players.add(socket.id);
    socket.join(roomCode);
    socket.data.roomCode = roomCode;
    socket.emit('room-joined', { roomCode, seed: room.seed, hostId: room.hostId, playerId: socket.id });
    socket.to(roomCode).emit('player-joined', socket.id);
  });

  socket.on('start-room', (ack?: (response: { ok: boolean; message?: string }) => void) => {
    const roomCode = socket.data.roomCode;
    const room = rooms.get(roomCode);
    if (!room) {
      ack?.({ ok: false, message: 'الغرفة غير موجودة' });
      return socket.emit('room-error', 'الغرفة غير موجودة');
    }
    if (socket.id !== room.hostId) {
      ack?.({ ok: false, message: 'فقط صاحب الغرفة يستطيع بدء اللعبة' });
      return socket.emit('room-error', 'فقط صاحب الغرفة يستطيع بدء اللعبة');
    }
    if (room.players.size < 2) {
      ack?.({ ok: false, message: 'بانتظار دخول اللاعب الثاني' });
      return socket.emit('room-error', 'بانتظار دخول اللاعب الثاني');
    }

    room.started = true;
    ack?.({ ok: true });

    // Send a separate start payload to every socket so both players always
    // receive their own player id and leave the waiting room together.
    for (const playerId of room.players) {
      io.to(playerId).emit('room-started', {
        roomCode,
        seed: room.seed,
        hostId: room.hostId,
        playerId
      });
    }
  });

  socket.on('player-state', (state) => {
    const roomCode = socket.data.roomCode;
    if (roomCode) socket.to(roomCode).emit('player-state', { ...state, id: socket.id });
  });

  socket.on('shot', (data) => {
    const roomCode = socket.data.roomCode;
    if (roomCode) socket.to(roomCode).emit('remote-shot', { ...data, id: socket.id });
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

  socket.on('disconnect', () => {
    const roomCode = socket.data.roomCode;
    if (!roomCode) return;
    const room = rooms.get(roomCode);
    if (!room) return;
    room.players.delete(socket.id);
    socket.to(roomCode).emit('player-left', socket.id);
    if (room.players.size === 0 || socket.id === room.hostId) {
      io.to(roomCode).emit('room-error', 'صاحب الغرفة خرج');
      rooms.delete(roomCode);
    }
  });
});

httpServer.listen(PORT, () => console.log(`Multiplayer server running on port ${PORT}`));
