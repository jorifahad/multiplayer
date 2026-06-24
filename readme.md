# Shadow Strike: Adaptive Multiplayer Zombie FPS

![Game Screenshot](./public/image.webp)

A browser-based 3D cooperative zombie shooter built with Three.js, featuring adaptive enemy intelligence, online multiplayer rooms, synchronized gameplay, and mission-based progression.

---

## About the Game

Enter a hostile military sector overrun by infected enemies.

Your team must survive the outbreak, eliminate the remaining zombies, restore power to the sector, and return safely to the extraction point.

The game can be played solo or cooperatively with another player through a private room code.

---

## Mission Objectives

* Enter the infected sector.
* Eliminate all hostile zombies.
* Restore power using the electrical control box.
* Survive the second enemy wave.
* Return to the extraction point.
* Complete the mission with your teammate.

---

## Key Features

* Online two-player cooperative gameplay.
* Private multiplayer rooms using shareable room codes.
* Real-time player movement synchronization.
* Shared mission progress between players.
* Synchronized zombie elimination.
* Adaptive enemy behavior based on player performance.
* Enemy difficulty changes according to:

  * Shooting accuracy.
  * Elimination speed.
  * Player health.
  * Damage received.
* Simultaneous movement and shooting.
* Automatic weapon reload.
* First-person weapon animations.
* Dynamic lighting and flashlight mechanics.
* Environmental rain and spatial zombie audio.
* Mission checkpoints with success and failure states.
* Responsive HUD for ammunition, health, and mission progress.

---

## Adaptive Enemy AI

The game includes a dynamic difficulty system that continuously evaluates player performance.

When the player performs well, enemies may:

* Move faster.
* Become more aggressive.
* Cause increased damage.
* Detect the player from greater distances.
* Apply greater pressure during combat.

When the player is struggling, the system gradually reduces enemy difficulty to maintain balanced gameplay.

This creates a different experience depending on the skill and performance of each player.

---

## Multiplayer System

Players can create or join private cooperative rooms.

### Create a Room

1. Select **Create Room**.
2. Copy the generated room code.
3. Share the code with the second player.
4. Wait for the second player to join.
5. Start the mission.

### Join a Room

1. Select **Join Room**.
2. Enter the room code.
3. Wait for the room host to start the game.

The multiplayer system is implemented using Socket.IO and a Node.js server.

---

## Controls

| Action            | Control           |
| ----------------- | ----------------- |
| Move forward      | W                 |
| Move backward     | S                 |
| Move left         | A                 |
| Move right        | D                 |
| Shoot             | Left Mouse Button |
| Reload            | R                 |
| Toggle flashlight | F                 |
| Look around       | Mouse             |

Movement and shooting can be performed simultaneously.

---

## Technology Stack

* TypeScript
* Three.js
* Socket.IO
* Node.js
* Express
* Vite
* GLTF 3D Models
* Web Audio API
* Adaptive Difficulty System
* Real-Time Multiplayer Synchronization

---

## Project Enhancements

This version introduces substantial gameplay and technical improvements, including:

* Adaptive enemy artificial intelligence.
* Player-performance tracking.
* Dynamic enemy speed, damage, and aggression.
* Two-player online cooperative mode.
* Room creation and room-code joining.
* Multiplayer waiting room.
* Host-controlled game start.
* Real-time position and combat synchronization.
* Multiplayer server connectivity handling.
* Improved simultaneous movement and shooting.
* Expanded mission and user-interface systems.

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
└── render.yaml
```

## Development

### Enhanced and Extended By

**Jori Baaljahr** , **Jood Khamjan**

Implemented the adaptive enemy AI, multiplayer room system, real-time synchronization, waiting-room flow, network connectivity improvements, and gameplay enhancements included in this version.

---

## Original Project Foundation

This project is an extensively modified and expanded version of the original **Zeta Forces: Zombie Shooter** project.

Original development credits:

* **Rohan Vashisht** — original programming, map design, game design, and voice work.
* **Alok Nair** — original music and sound management, asset research, testing, and feedback.

Original repository:

```text
https://github.com/RohanVashisht1234/threejs-zombieshooter-game
```

---

## Third-Party Assets and Credits

The project contains third-party models, audio, and libraries that remain subject to their respective licenses and attribution requirements.

### Music

* Karl Casey — White Bat Audio

### Sound Effects

* Pixabay

### 3D Assets

* Zombie Hazmat
* FPS AK-74M with animations
* Fence
* Wall and Door
* Sandbags
* Low-poly police car
* Crashed abandoned car
* Electrical control box
* WWII air traffic control tower
* PSX-style brick wall

Detailed model sources and licenses should be retained in the project documentation or asset attribution file.

---

## Disclaimer

This repository contains original enhancements together with modified third-party code and assets. Ownership of external libraries, models, sounds, and original project components remains with their respective creators.

