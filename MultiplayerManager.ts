/// <reference types="vite/client" />
import { io, Socket } from 'socket.io-client';
import * as THREE from 'three';

export type PlayerNetState = {
  id: string;
  position: { x: number; y: number; z: number };
  rotationY: number;
  health: number;
};

export type ZombieSnapshot = {
  positions: Array<{ x: number; y: number; z: number; ry: number }>;
  states: Array<{ health: number; dead: boolean; dying: boolean }>;
};

type RoomReady = { roomCode: string; seed: number; hostId: string; playerId: string };

export class MultiplayerManager {
  private socket: Socket;
  private roomCode = '';
  private hostId = '';
  private seed = 1;
  private lastPlayerSend = 0;
  private lastZombieSend = 0;

  private playerStateHandler?: (state: PlayerNetState) => void;
  private playerLeftHandler?: (id: string) => void;
  private remoteShotHandler?: (data: any) => void;
  private zombieHitHandler?: (index: number) => void;
  private zombieSnapshotHandler?: (snapshot: ZombieSnapshot) => void;

  constructor(serverUrl?: string) {
    const configuredUrl = import.meta.env.VITE_SERVER_URL?.trim();
    const automaticLocalUrl = `${window.location.protocol}//${window.location.hostname}:3001`;
    const resolvedServerUrl = serverUrl || configuredUrl || automaticLocalUrl;

    this.socket = io(resolvedServerUrl, {
      transports: ['polling', 'websocket'],
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 500,
      timeout: 10000
    });

    this.socket.on('player-state', (state: PlayerNetState) => this.playerStateHandler?.(state));
    this.socket.on('player-left', (id: string) => this.playerLeftHandler?.(id));
    this.socket.on('remote-shot', (data: any) => this.remoteShotHandler?.(data));
    this.socket.on('zombie-hit', ({ index }: { index: number }) => this.zombieHitHandler?.(index));
    this.socket.on('zombie-snapshot', (snapshot: ZombieSnapshot) => this.zombieSnapshotHandler?.(snapshot));
  }

  public get playerId(): string { return this.socket.id || ''; }
  public get currentRoomCode(): string { return this.roomCode; }
  public get roomSeed(): number { return this.seed; }
  public get isHost(): boolean { return !!this.socket.id && this.socket.id === this.hostId; }

  public onPlayerState(handler: (state: PlayerNetState) => void): void { this.playerStateHandler = handler; }
  public onPlayerLeft(handler: (id: string) => void): void { this.playerLeftHandler = handler; }
  public onRemoteShot(handler: (data: any) => void): void { this.remoteShotHandler = handler; }
  public onZombieHit(handler: (index: number) => void): void { this.zombieHitHandler = handler; }
  public onZombieSnapshot(handler: (snapshot: ZombieSnapshot) => void): void { this.zombieSnapshotHandler = handler; }

  public async showLobby(): Promise<RoomReady> {
    await this.waitForConnection();

    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.id = 'multiplayer-lobby';
      overlay.style.cssText = 'position:fixed;inset:0;background:#090b10;color:white;z-index:1000;display:flex;align-items:center;justify-content:center;font-family:Arial';
      overlay.innerHTML = `
        <div style="width:min(460px,90vw);padding:28px;background:#151922;border:1px solid #394150;border-radius:16px;text-align:center">
          <h1 style="margin-top:0">Zeta Forces Co-op</h1>
          <p>أنشئي غرفة أو أدخلي رمز صديقتك</p>

          <div id="lobby-actions">
            <button id="create-room" style="width:100%;padding:13px;margin:8px 0;font-size:17px;cursor:pointer">Create Room</button>
            <div style="display:flex;gap:8px;margin-top:10px">
              <input id="room-code-input" maxlength="5" placeholder="ROOM CODE" style="flex:1;padding:13px;text-transform:uppercase;font-size:17px" />
              <button id="join-room" style="padding:13px 18px;cursor:pointer">Join</button>
            </div>
          </div>

          <div id="host-room-panel" style="display:none;margin-top:14px">
            <div style="font-size:14px;color:#aab6c8;margin-bottom:8px">ROOM CODE</div>
            <div id="host-room-code" style="font-size:38px;font-weight:800;letter-spacing:8px;color:#8ee7ff;margin:8px 0 16px"></div>
            <button id="copy-room-code" style="width:100%;padding:12px;margin-bottom:10px;cursor:pointer">Copy Code</button>
            <button id="start-room" disabled style="width:100%;padding:13px;font-size:17px;cursor:not-allowed;opacity:.5">Waiting for teammate...</button>
          </div>

          <div id="room-status" style="margin-top:18px;min-height:24px;color:#8ee7ff"></div>
        </div>`;
      document.body.appendChild(overlay);

      const actions = overlay.querySelector('#lobby-actions') as HTMLDivElement;
      const hostPanel = overlay.querySelector('#host-room-panel') as HTMLDivElement;
      const hostCode = overlay.querySelector('#host-room-code') as HTMLDivElement;
      const copyButton = overlay.querySelector('#copy-room-code') as HTMLButtonElement;
      const startButton = overlay.querySelector('#start-room') as HTMLButtonElement;
      const status = overlay.querySelector('#room-status') as HTMLDivElement;
      const input = overlay.querySelector('#room-code-input') as HTMLInputElement;

      let pendingRoom: RoomReady | null = null;
      let isHost = false;
      let teammateJoined = false;

      const cleanup = () => {
        this.socket.off('room-created', onRoomCreated);
        this.socket.off('room-joined', onRoomJoined);
        this.socket.off('player-joined', onPlayerJoined);
        this.socket.off('room-started', onRoomStarted);
        this.socket.off('room-error', onRoomError);
      };

      let finished = false;
      const finish = (data: RoomReady) => {
        if (finished) return;
        finished = true;
        this.roomCode = data.roomCode;
        this.seed = data.seed;
        this.hostId = data.hostId;
        cleanup();
        status.textContent = 'تم بدء المهمة. جاري تحميل اللعبة...';
        window.setTimeout(() => {
          overlay.remove();
          resolve(data);
        }, 250);
      };

      const onRoomCreated = (data: RoomReady) => {
        pendingRoom = data;
        isHost = true;
        this.roomCode = data.roomCode;
        this.seed = data.seed;
        this.hostId = data.hostId;

        actions.style.display = 'none';
        hostPanel.style.display = 'block';
        hostCode.textContent = data.roomCode;
        status.textContent = 'انسخي الرمز وأرسليه لصديقتك. اللعبة لن تبدأ حتى يدخل اللاعب الثاني.';
      };

      const onRoomJoined = (data: RoomReady) => {
        pendingRoom = data;
        isHost = false;
        this.roomCode = data.roomCode;
        this.seed = data.seed;
        this.hostId = data.hostId;

        actions.style.display = 'none';
        status.textContent = `تم دخول الغرفة ${data.roomCode}. بانتظار صاحب الغرفة لبدء اللعبة...`;
      };

      const onPlayerJoined = () => {
        if (!isHost) return;
        teammateJoined = true;
        startButton.disabled = false;
        startButton.style.cursor = 'pointer';
        startButton.style.opacity = '1';
        startButton.textContent = 'Start Game';
        status.textContent = 'دخل اللاعب الثاني. اضغطي Start Game عندما تكونان مستعدين.';
      };

      const onRoomStarted = (data?: Partial<RoomReady>) => {
        const room = pendingRoom;
        if (!room) {
          status.textContent = 'بدأت الغرفة، لكن بياناتها غير مكتملة. أعيدي الدخول.';
          return;
        }
        finish({
          roomCode: data?.roomCode || room.roomCode,
          seed: data?.seed ?? room.seed,
          hostId: data?.hostId || room.hostId,
          playerId: data?.playerId || this.socket.id || room.playerId
        });
      };

      const onRoomError = (message: string) => {
        status.textContent = message;
      };

      this.socket.on('room-created', onRoomCreated);
      this.socket.on('room-joined', onRoomJoined);
      this.socket.on('player-joined', onPlayerJoined);
      this.socket.on('room-started', onRoomStarted);
      this.socket.on('room-error', onRoomError);

      (overlay.querySelector('#create-room') as HTMLButtonElement).onclick = () => {
        status.textContent = 'Creating room...';
        this.socket.emit('create-room');
      };

      (overlay.querySelector('#join-room') as HTMLButtonElement).onclick = () => {
        const code = input.value.trim().toUpperCase();
        if (!code) { status.textContent = 'اكتبي رمز الغرفة'; return; }
        status.textContent = 'Joining room...';
        this.socket.emit('join-room', code);
      };

      copyButton.onclick = async () => {
        if (!pendingRoom) return;
        try {
          await navigator.clipboard.writeText(pendingRoom.roomCode);
          copyButton.textContent = 'Copied!';
        } catch {
          const temp = document.createElement('textarea');
          temp.value = pendingRoom.roomCode;
          document.body.appendChild(temp);
          temp.select();
          document.execCommand('copy');
          temp.remove();
          copyButton.textContent = 'Copied!';
        }
        window.setTimeout(() => { copyButton.textContent = 'Copy Code'; }, 1500);
      };

      startButton.onclick = () => {
        if (!isHost || !teammateJoined || !pendingRoom) return;
        startButton.disabled = true;
        startButton.textContent = 'Starting...';
        status.textContent = 'Starting game for both players...';

        const fallback = window.setTimeout(() => {
          if (finished) return;
          startButton.disabled = false;
          startButton.textContent = 'Start Game';
          status.textContent = 'لم يصل تأكيد البدء. اضغطي Start Game مرة أخرى.';
        }, 7000);

        this.socket.emit('start-room', (response?: { ok: boolean; message?: string }) => {
          if (response?.ok) return;
          window.clearTimeout(fallback);
          startButton.disabled = false;
          startButton.textContent = 'Start Game';
          status.textContent = response?.message || 'تعذر بدء الغرفة.';
        });
      };
    });
  }

  private waitForConnection(): Promise<void> {
    if (this.socket.connected) return Promise.resolve();

    return new Promise((resolve, reject) => {
      let lastError = '';

      const cleanup = () => {
        window.clearTimeout(timer);
        this.socket.off('connect', onConnect);
        this.socket.off('connect_error', onConnectError);
      };

      const onConnect = () => {
        cleanup();
        resolve();
      };

      // لا نفشل من أول محاولة؛ Socket.IO قد يفشل WebSocket ثم ينجح عبر polling.
      const onConnectError = (error: Error) => {
        lastError = error.message;
        console.warn('Multiplayer connection attempt failed:', error.message);
      };

      const timer = window.setTimeout(() => {
        cleanup();
        reject(new Error(
          lastError
            ? `Multiplayer server is not reachable: ${lastError}`
            : 'Multiplayer server is not reachable'
        ));
      }, 12000);

      this.socket.on('connect', onConnect);
      this.socket.on('connect_error', onConnectError);
      this.socket.connect();
    });
  }

  public sendPlayerState(camera: THREE.PerspectiveCamera, health: number): void {
    const now = performance.now();
    if (now - this.lastPlayerSend < 50 || !this.roomCode) return;
    this.lastPlayerSend = now;
    this.socket.emit('player-state', {
      position: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
      rotationY: camera.rotation.y,
      health
    });
  }

  public sendShot(origin: THREE.Vector3, direction: THREE.Vector3): void {
    if (!this.roomCode) return;
    this.socket.emit('shot', {
      origin: { x: origin.x, y: origin.y, z: origin.z },
      direction: { x: direction.x, y: direction.y, z: direction.z }
    });
  }

  public sendZombieHit(index: number): void {
    if (!this.roomCode) return;
    this.socket.emit('zombie-hit', { index });
  }

  public sendZombieSnapshot(snapshot: ZombieSnapshot): void {
    const now = performance.now();
    if (!this.isHost || now - this.lastZombieSend < 100) return;
    this.lastZombieSend = now;
    this.socket.emit('zombie-snapshot', snapshot);
  }
}
