# Shadow Strike: Adaptive Multiplayer Zombie FPS

![Game Screenshot](./public/image.webp)

A browser-based 3D two-player cooperative zombie shooter built with Three.js, TypeScript, Socket.IO, and Node.js. The game combines adaptive enemy difficulty, synchronized multiplayer combat, shared mission progression, host migration, and mission-based zombie waves.

---

## About the Game

Enter a hostile military sector overrun by infected enemies.

Two players must eliminate the first zombie wave, reach the electrical control point, restore power, survive a second wave entering from beyond the front gate, and return to the extraction point.

The current version is designed for **two-player online cooperative play** using a private room code.

---

## Mission Flow

1. Create or join a private multiplayer room.
2. The mission starts automatically when the second player joins.
3. Eliminate the first zombie wave.
4. Reach the electrical control point.
5. Restore power to the sector.
6. Fight the second wave spawning beyond the front gate.
7. Return to the extraction point.
8. Complete the mission together.

---

## Key Features

- Online two-player cooperative gameplay.
- Private rooms with five-character shareable room codes.
- Automatic mission start when the second player joins.
- Real-time player movement, shooting, health, and damage synchronization.
- Shared zombie state and mission-stage synchronization.
- Shared adaptive difficulty based on the stronger-performing player.
- Automatic host migration when the current host dies or disconnects.
- Continued gameplay when one player dies; the surviving teammate can continue the mission.
- A visible 3D soldier model for the second player.
- Zombies target the nearest living player.
- Simultaneous movement and shooting.
- Diagonal movement using combined W/A/S/D input.
- Automatic weapon reload and a reduced reload time of 1.6 seconds.
- First-person weapon animations, muzzle flash, recoil, and camera shake.
- Dynamic flashlight and street-light behavior.
- Environmental rain and spatial zombie audio.
- Mission checkpoints with shared progression.
- HUD for ammunition, health, enemy difficulty, and zombie eliminations.
- Zombie death behavior where enemies fall to the ground, remain briefly, and then disappear cleanly.
- Reduced zombie network update frequency and smoothed remote movement to limit lag and sudden position jumps.

---

## Adaptive Enemy AI

The adaptive difficulty system continuously evaluates player performance using:

- Shooting accuracy.
- Elimination rate.
- Remaining health.
- Damage received.

The server compares both players' difficulty reports and broadcasts the higher value to the room, ensuring that both players face the same shared enemy difficulty.

When performance is strong, zombies may:

- Move faster.
- Deal more damage.
- Detect players from greater distances.
- Flank more often.
- Maintain stronger separation while approaching.

When performance drops, enemy settings gradually become less demanding to keep combat balanced.

---

## Multiplayer System

The multiplayer system is implemented with Socket.IO and an Express/Node.js server.

### Create a Room

1. Select **Create Room**.
2. Copy the generated room code.
3. Send the code to the second player.
4. Wait for the second player to join.
5. The mission starts automatically for both players.

### Join a Room

1. Enter the room code.
2. Select **Join**.
3. The mission starts automatically after the connection is confirmed.

No additional host start button or second click is required.

### Multiplayer Reliability

- The server tracks each player's health.
- If the host dies, zombie simulation authority transfers to a living teammate.
- If the host disconnects, the remaining player is promoted instead of immediately ending the room.
- Dead players are removed as zombie targets.
- The render loop and multiplayer synchronization continue after local player death.

---

## Zombie Waves and Death Behavior

### First Wave

The first wave is distributed across the map at a safe distance from the initial player position.

### Second Wave

The second wave spawns beyond the front gate, ahead of the players rather than behind them. Spawn positions are distributed across multiple rows and columns to avoid a single straight line of enemies.

### Zombie Death

Each zombie:

1. Stops its walking animation after its health reaches zero.
2. Falls toward the ground.
3. Remains visible briefly.
4. Disappears cleanly with its shadow disabled.

Material fading is intentionally avoided because shared transparent materials previously caused living zombies to become invisible while leaving their shadows visible.

---

## Controls

| Action | Control |
| --- | --- |
| Move forward | W |
| Move backward | S |
| Move left | A |
| Move right | D |
| Shoot | Left Mouse Button or Space |
| Reload | R |
| Toggle flashlight | F |
| Look around | Mouse |

Movement and shooting can be performed simultaneously.

---

## Technology Stack

- TypeScript
- Three.js
- Socket.IO
- Node.js
- Express
- Vite
- GLTF 3D models
- Web Audio API
- Pointer Lock API
- Adaptive difficulty system
- Real-time multiplayer synchronization

---

## Project Structure

```text
├── public/
├── AdaptiveDifficulty.ts
├── MultiplayerManager.ts
├── main.ts
├── server.ts
├── index.html
├── package.json
├── render.yaml
├── .env.example
└── README.md
```

---

## Local Development

### 1. Install dependencies

```bash
npm install
```

### 2. Configure the multiplayer server URL

Copy `.env.example` to `.env` and keep the local server URL:

```env
VITE_SERVER_URL=http://localhost:3001
```

### 3. Start the multiplayer server

```bash
npm run server
```

### 4. Start the game client

Open a second terminal and run:

```bash
npm run dev
```

Open the local Vite URL in two browser windows to test cooperative gameplay.

---

## Production Deployment

The repository includes a `render.yaml` configuration for the Node.js multiplayer server.

After deploying the server, set the game client's environment variable to the public HTTPS server URL:

```env
VITE_SERVER_URL=https://your-server.onrender.com
```

Then rebuild and redeploy the game client.

---

## Major Enhancements in This Version

- Adaptive enemy AI driven by player performance.
- Shared room difficulty based on the stronger player.
- Two-player room creation and room-code joining.
- Automatic game start when the second player joins.
- Real-time player, projectile, zombie, health, and mission synchronization.
- Host migration after host death or disconnection.
- Continued mission simulation after one player dies.
- Nearest-living-player zombie targeting.
- 3D teammate soldier representation.
- Full horizontal 360-degree camera rotation.
- Simultaneous movement and shooting.
- Faster weapon reload.
- Shared mission checkpoints and staged progression.
- Second-wave spawning beyond the front gate.
- Improved zombie fall-and-disappear behavior.
- Smoothed remote zombie movement and reduced network update load.
- English multiplayer lobby and status messages.
- Simplified start screen without the original promotional and credit sections.

---

## Development

### Enhanced and Extended By

**Jori Baaljahr** and **Jood Khamjan**

Implemented the adaptive enemy AI, player-performance tracking, multiplayer room system, automatic room start, real-time synchronization, host migration, shared mission progression, teammate representation, combat improvements, zombie-wave adjustments, and network optimizations included in this version.

---

## Original Project Foundation

This project is an extensively modified and expanded version of the original **Zeta Forces: Zombie Shooter** project.

Original development credits:

- **Rohan Vashisht** — original programming, map design, game design, and voice work.
- **Alok Nair** — original music and sound management, asset research, testing, and feedback.

Original repository:

```text
https://github.com/RohanVashisht1234/threejs-zombieshooter-game
```

---

## Third-Party Assets and Credits

The project contains third-party models, audio, and libraries that remain subject to their respective licenses and attribution requirements.

### Music

- Karl Casey — White Bat Audio

### Sound Effects

- Pixabay

### 3D Assets

- Zombie Hazmat
- FPS AK-74M with animations
- Fence
- Wall and Door
- Sandbags
- Low-poly police car
- Crashed abandoned car
- Electrical control box
- WWII air traffic control tower
- PSX-style brick wall

Detailed model sources and licenses should remain available in the repository documentation or a dedicated attribution file.

---

## Disclaimer

This repository combines original enhancements with modified third-party code and assets. Ownership of external libraries, models, audio, and original project components remains with their respective creators and license holders.
