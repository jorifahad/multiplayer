# Shadow Strike: Adaptive Multiplayer Zombie FPS

![Game Screenshot](./public/image.webp)

**Play the game:** https://multiplayer-game-m7lx.onrender.com

A browser-based 3D cooperative zombie shooter for two players, featuring private rooms, real-time synchronization, adaptive enemy intelligence, and shared mission progression.

---

## About the Game

Two players enter a hostile military sector overrun by infected enemies.

They must eliminate the first zombie wave, reach the electrical control box, restore power, survive the second wave, and return to the extraction point.

The match starts automatically as soon as the second player joins using the private room code.

---

## Features

* Online two-player cooperative gameplay.
* Private rooms with shareable room codes.
* Automatic match start when the second player joins.
* Synchronized player movement, zombies, combat, and mission progress.
* Adaptive enemy difficulty based on player performance.
* Continued gameplay if one player dies or the host disconnects.
* Simultaneous movement and shooting.
* Visual and audio effects with a HUD for health, ammunition, and mission progress.

---

## Adaptive Enemy AI

The system evaluates player performance using shooting accuracy, successful hits, elimination speed, player health, and damage received.

Based on performance, zombie speed, damage, detection range, and aggression are adjusted to maintain a balanced level of difficulty.

---

## Multiplayer

### Create a Room

1. Select **Create Room**.
2. Copy the room code.
3. Share it with the second player.
4. The match starts automatically when they join.

### Join a Room

1. Select **Join Room**.
2. Enter the room code.
3. Select **Join**.
4. The match starts automatically.

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

---

## Development

This version was redesigned and developed by:

**Jori Baaljahr** and **Jood Khamjan**

The multiplayer system, private rooms, synchronization, adaptive enemy AI, mission progression, zombie behavior, host transfer, and performance improvements were developed or substantially rewritten for this version.

---

## Original Project Reference

The original **Zeta Forces: Zombie Shooter** project was used as a visual and audio foundation, including parts of the general appearance, music, and external assets.

The multiplayer architecture, adaptive difficulty system, synchronization, room system, mission flow, and updated player and zombie behavior were developed or substantially rewritten for the current version.

### Original Project Credits

* **Rohan Vashisht** — original programming, map design, game design, and voice work.
* **Alok Nair** — music and sound management, asset research, testing, and feedback.

Original repository:

```text
https://github.com/RohanVashisht1234/threejs-zombieshooter-game
```

---

## Third-Party Assets

### Music

* Karl Casey — White Bat Audio

### Sound Effects

* Pixabay

### 3D Models

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

All third-party music, sound effects, models, libraries, and external assets remain the property of their respective creators and license holders.
