import * as THREE from 'three';
import { AdaptiveDifficulty } from "./AdaptiveDifficulty";
import { MultiplayerManager, ZombieSnapshot, MissionStage } from "./MultiplayerManager";
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { GammaCorrectionShader } from 'three/examples/jsm/shaders/GammaCorrectionShader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

const CONFIG = {
  CAMERA: { FOV: 55, NEAR: 0.1, FAR: 1000, INITIAL_POSITION: { x: 0, y: 2, z: 10 } },
  RENDERER: { PIXEL_RATIO_MAX: 1.5 },
  MOVEMENT: { SPEED: 10 },
  WEAPON: { MAX_AMMO: 40, SHOOT_COOLDOWN: 0.15, RELOAD_TIME: 1.6, MUZZLE_FLASH_DURATION: 50 },
  ZOMBIE: { SPEED: 5, DAMAGE_RATE: 20, MIN_DISTANCE: 1.5, COUNT: 50 },
  RAIN: { COUNT: 500, FALL_SPEED_MIN: 0.3, FALL_SPEED_MAX: 0.8, SPAWN_RANGE: 25, HEIGHT_MIN: 60, HEIGHT_MAX: 100 },
  BULLET: { SPEED: 10, MAX_DISTANCE: 1000 },
  PLAYER: { INITIAL_HEALTH: 100 }
};

const GAME_BOUNDS = { minX: -10.46, maxX: 34.43, minZ: -422.50, maxZ: 17.26 };

function clamp(val: number, min: number, max: number) {
  return Math.max(min, Math.min(max, val));
}

class GameState {
  public ammo = CONFIG.WEAPON.MAX_AMMO;
  public health = CONFIG.PLAYER.INITIAL_HEALTH;
  public shootTimer = 0;
  public reloadTimer = 0;
  public isReloading = false;
  public isShooting = false;
  public flashlightOn = true;
  public currentGunAction = -1;
  public keysPressed: Record<string, boolean> = {};
}

class SceneManager {
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer;

  constructor() {
    const { FOV, NEAR, FAR, INITIAL_POSITION } = CONFIG.CAMERA;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(FOV, window.innerWidth / window.innerHeight, NEAR, FAR);
    this.camera.position.copy(INITIAL_POSITION);
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', precision: 'highp' });
    this.renderer.shadowMap.enabled = true;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, CONFIG.RENDERER.PIXEL_RATIO_MAX));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.8;
    document.getElementById('container')?.appendChild(this.renderer.domElement);
  }
}

class LightingManager {
  public flashlight: THREE.SpotLight;
  public muzzleFlash: THREE.PointLight;

  constructor(private scene: THREE.Scene, private camera: THREE.PerspectiveCamera) {
    this.flashlight = new THREE.SpotLight(0xffffff, 100, 50, Math.PI / 6, 0.3, 1.5);
    this.flashlight.shadow.normalBias = 1;
    this.flashlight.castShadow = true;
    this.camera.add(this.flashlight);
    this.muzzleFlash = new THREE.PointLight(0xffaa33, 7, 100);
    this.muzzleFlash.visible = false;
    this.muzzleFlash.shadow.normalBias = 1;
    this.camera.add(this.muzzleFlash);
    this.setupLights();
  }

  private setupLights(): void {
    const moonLight = new THREE.DirectionalLight(0x8888ff, 0.5);
    moonLight.position.set(20, 100, 50);
    moonLight.castShadow = true;
    this.scene.add(moonLight);
    this.flashlight.visible = true;
  }

  public updateFlashlight(): void {
    this.camera.getWorldDirection(this.flashlight.target.position);
    this.flashlight.target.position.addVectors(this.camera.position, this.flashlight.target.position);
    if (!this.scene.children.includes(this.flashlight.target)) {
      this.scene.add(this.flashlight.target);
    }
    this.flashlight.position.set(0, 0, 0);
  }

  public toggleFlashlight(): void {
    this.flashlight.visible = !this.flashlight.visible;
  }

  public showMuzzleFlash(): void {
    this.muzzleFlash.visible = true;
    setTimeout(() => { this.muzzleFlash.visible = false; }, CONFIG.WEAPON.MUZZLE_FLASH_DURATION);
  }
}

type ZombieState = { health: number; dead: boolean; dying: boolean; deathTimer: number; fadeTimer?: number; };

class ModelManager {
  public zombieMixers: THREE.AnimationMixer[] = [];
  public zombies: THREE.Object3D[] = [];
  public fpsGun?: THREE.Object3D;
  public gunMixer?: THREE.AnimationMixer;
  public gunActions: THREE.AnimationAction[] = [];
  public zombieStates: ZombieState[] = [];
  public zombieGLTF: any;
  private loader: GLTFLoader;

  constructor(private scene: THREE.Scene, private camera: THREE.PerspectiveCamera, loadingManager: THREE.LoadingManager) {
    this.loader = new GLTFLoader(loadingManager);
    this.loader.setMeshoptDecoder(MeshoptDecoder);
    this.loadModels();
  }

  private loadModels(): void {
    this.loadMap();
    this.loadZombie();
    this.loadFPSGun();
  }

  private loadMap(): void {
    this.loader.load('/map.glb', (gltf) => {
      gltf.scene.traverse((o: any) => {
        o.castShadow = o.receiveShadow = true;
        if ((o as THREE.PointLight).isLight) {
          (o as THREE.PointLight).shadow.bias = -0.0009;
          o.visible = false;
          if (o.intensity !== undefined) o.intensity = 0;
        }
      });
      gltf.scene.position.y = -0.2;
      this.scene.add(gltf.scene);
    });
  }

  private loadZombie(): void {
    this.loader.load('/zombie_hazmat.glb', (gltf) => {
      this.zombieGLTF = gltf;
      const bounds = GAME_BOUNDS;
      const camPos = CONFIG.CAMERA.INITIAL_POSITION;

      for (let i = 0; i < CONFIG.ZOMBIE.COUNT; i++) {
        const model = SkeletonUtils.clone(gltf.scene);
        model.scale.set(1.5, 1.5, 1.5);
        let x = 0, z = 0, attempts = 0;
        const minSpawnDistance = 180;

        do {
          x = THREE.MathUtils.randFloat(bounds.minX, bounds.maxX);
          z = THREE.MathUtils.randFloat(bounds.minZ, bounds.maxZ);
          const distToPlayer = Math.hypot(x - camPos.x, z - camPos.z);
          const tooCloseToOther = this.zombies.some(zb => zb.position.distanceTo(new THREE.Vector3(x, 0.05, z)) < 2);
          if (distToPlayer >= minSpawnDistance && !tooCloseToOther) break;
        } while (++attempts < 20);

        model.position.set(x, 0.05, z);
        model.traverse((child: any) => {
          if (!child.isMesh) return;
          if (Array.isArray(child.material)) {
            child.material = child.material.map((material: THREE.Material) => material.clone());
          } else if (child.material) {
            child.material = child.material.clone();
          }
          child.castShadow = true;
          child.receiveShadow = true;
        });
        const mixer = new THREE.AnimationMixer(model);
        const action = mixer.clipAction(gltf.animations[3]);
        action.play();
        action.timeScale = 2;
        action.time = Math.random() * action.getClip().duration;

        this.zombieMixers.push(mixer);
        this.zombies.push(model);
        this.zombieStates.push({ health: 3, dead: false, dying: false, deathTimer: 0 });
        this.scene.add(model);
      }
    });
  }

  private loadFPSGun(): void {
    this.loader.load('/fps_gun_person_view.glb', (gltf) => {
      this.fpsGun = gltf.scene;
      this.fpsGun.scale.set(0.8, 0.8, 0.8);
      this.fpsGun.position.set(0.2, -0.5, -0.3);
      this.fpsGun.rotation.y = THREE.MathUtils.degToRad(-180);
      this.fpsGun.traverse(child => child.castShadow = child.receiveShadow = true);
      this.gunMixer = new THREE.AnimationMixer(this.fpsGun);
      this.gunActions = gltf.animations.map(a => this.gunMixer!.clipAction(a));
      this.camera.add(this.fpsGun);
    });
  }
}

class WeatherManager {
  private rainGroup: THREE.InstancedMesh;
  private splashGroup: THREE.InstancedMesh;
  private rainPos: Float32Array;
  private rainVel: Float32Array;
  private splashTimers: Float32Array;
  private tempMatrix = new THREE.Matrix4();
  private tempSplashMatrix = new THREE.Matrix4();
  private bounds = GAME_BOUNDS;

  constructor(scene: THREE.Scene) {
    const rainMat = new THREE.MeshStandardMaterial({ color: 0xaaaaee, transparent: true, opacity: 0.3, metalness: 0.4, roughness: 0.85, side: THREE.DoubleSide });
    this.rainGroup = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.02, 0.4), rainMat, CONFIG.RAIN.COUNT);
    const splashMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, transparent: true, opacity: 0.5, metalness: 0.4, side: THREE.FrontSide });
    this.splashGroup = new THREE.InstancedMesh(new THREE.CircleGeometry(0.05, 20), splashMat, CONFIG.RAIN.COUNT);
    this.rainPos = new Float32Array(CONFIG.RAIN.COUNT * 3);
    this.rainVel = new Float32Array(CONFIG.RAIN.COUNT);
    this.splashTimers = new Float32Array(CONFIG.RAIN.COUNT);
    this.initializeRainDrops();
    scene.add(this.rainGroup, this.splashGroup);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(500, 500), new THREE.MeshStandardMaterial({ color: 0x111122, metalness: 0.8, roughness: 0.3, opacity: 0.1, transparent: true }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
  }

  private initializeRainDrops(): void {
    const { minX, maxX, minZ, maxZ } = this.bounds;
    const { HEIGHT_MIN, HEIGHT_MAX, FALL_SPEED_MIN, FALL_SPEED_MAX } = CONFIG.RAIN;

    for (let i = 0, idx = 0; i < CONFIG.RAIN.COUNT; i++) {
      this.rainPos[idx] = THREE.MathUtils.randFloat(minX, maxX);
      this.rainPos[idx + 1] = THREE.MathUtils.randFloat(HEIGHT_MIN, HEIGHT_MAX);
      this.rainPos[idx + 2] = THREE.MathUtils.randFloat(minZ, maxZ);
      this.rainVel[i] = THREE.MathUtils.randFloat(FALL_SPEED_MIN, FALL_SPEED_MAX);
      this.tempMatrix.setPosition(this.rainPos[idx], this.rainPos[idx + 1], this.rainPos[idx + 2]);
      this.rainGroup.setMatrixAt(i, this.tempMatrix);
      idx += 3;
    }
  }

  public updateRain(): void {
    const { minX, maxX, minZ, maxZ } = this.bounds;
    const { HEIGHT_MIN, HEIGHT_MAX } = CONFIG.RAIN;

    for (let i = 0, idx = 0; i < CONFIG.RAIN.COUNT; i++, idx += 3) {
      this.rainPos[idx + 1] -= this.rainVel[i];
      if (this.rainPos[idx + 1] < 0) {
        this.splashTimers[i] = 0.3;
        this.rainPos[idx] = THREE.MathUtils.randFloat(minX, maxX);
        this.rainPos[idx + 1] = THREE.MathUtils.randFloat(HEIGHT_MIN, HEIGHT_MAX);
        this.rainPos[idx + 2] = THREE.MathUtils.randFloat(minZ, maxZ);
      }
      this.tempMatrix.setPosition(this.rainPos[idx], this.rainPos[idx + 1], this.rainPos[idx + 2]);
      this.rainGroup.setMatrixAt(i, this.tempMatrix);
      if (this.splashTimers[i] > 0) {
        this.splashTimers[i] -= 0.016;
        this.tempSplashMatrix.makeRotationX(-Math.PI / 2);
        this.tempSplashMatrix.setPosition(this.rainPos[idx], 0.01, this.rainPos[idx + 2]);
        this.splashGroup.setMatrixAt(i, this.tempSplashMatrix);
      } else {
        this.tempSplashMatrix.makeScale(0, 0, 0);
        this.splashGroup.setMatrixAt(i, this.tempSplashMatrix);
      }
    }
    this.rainGroup.instanceMatrix.needsUpdate = true;
    this.splashGroup.instanceMatrix.needsUpdate = true;
  }
}

class WeaponManager {
  private bullets: THREE.Mesh[] = [];
  private bulletGeometry: THREE.SphereGeometry;
  private bulletMaterial: THREE.MeshBasicMaterial;
  private tempVector = new THREE.Vector3();
  private shakeOffset = new THREE.Vector3();
  private shakeIntensity = 100;
  private shakeStartTime = 0;
  private shakeDuration = 200;

  constructor(
    private scene: THREE.Scene,
    private camera: THREE.PerspectiveCamera,
    private gameState: GameState,
    private modelManager: ModelManager,
    private lightingManager: LightingManager,
    private adaptiveDifficulty: AdaptiveDifficulty,
    private multiplayer: MultiplayerManager
  ) {
    this.bulletGeometry = new THREE.SphereGeometry(0.05, 4, 4);
    this.bulletMaterial = new THREE.MeshBasicMaterial({ color: 0xfff000 });
  }

  public playGunAction(idx: number): void {
    if (!this.modelManager.gunActions.length || idx === this.gameState.currentGunAction) return;
    this.modelManager.gunActions.forEach(a => a.stop());
    this.modelManager.gunActions[idx].reset().play();
    this.gameState.currentGunAction = idx;
    if (idx === 4) {
      this.gameState.shootTimer = 0.1;
    } else if (idx === 7) {
      this.gameState.reloadTimer = CONFIG.WEAPON.RELOAD_TIME;
      this.gameState.isReloading = true;
      playReloadSound();
      setTimeout(() => {
        this.gameState.ammo = CONFIG.WEAPON.MAX_AMMO;
        this.gameState.isReloading = false;
      }, CONFIG.WEAPON.RELOAD_TIME * 1000);
    }
  }

  private startCameraShake(): void {
    this.shakeIntensity = 0.1;
    this.shakeStartTime = Date.now();
  }

  private updateCameraShake(): void {
    if (this.shakeIntensity > 0.001) {
      const elapsed = Date.now() - this.shakeStartTime;
      const progress = Math.min(elapsed / this.shakeDuration, 1);

      const intensity = this.shakeIntensity * (1 - progress * progress);

      const previousShake = this.shakeOffset.clone();
      this.shakeOffset.set(
        (Math.random() - 0.5) * intensity,
        0,
        (Math.random() - 0.5) * intensity
      );

      this.camera.position.sub(previousShake).add(this.shakeOffset);

      if (progress >= 1) {
        this.shakeIntensity = 0;
        this.camera.position.sub(this.shakeOffset);
        this.shakeOffset.set(0, 0, 0);
      }
    }
  }

  public shoot(): void {
    this.adaptiveDifficulty.recordShot();
    this.playGunAction(4);
    this.startCameraShake();
    this.gameState.ammo--;

    // 🔥 auto reload when ammo is empty
    if (this.gameState.ammo <= 0 && this.canReload()) {
      this.playGunAction(7);
      return;
    }

    const bullet = new THREE.Mesh(this.bulletGeometry, this.bulletMaterial);
    bullet.position.copy(this.camera.getWorldPosition(this.tempVector));
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    this.multiplayer.sendShot(bullet.position.clone(), dir.clone());
    bullet.userData.velocity = dir.multiplyScalar(CONFIG.BULLET.SPEED);
    this.bullets.push(bullet);
    this.scene.add(bullet);
    this.lightingManager.showMuzzleFlash();
    playShotSound();
  }


  public updateBullets(delta: number): void {
    this.updateCameraShake();

    if (this.gameState.isShooting && this.gameState.ammo <= 0 && this.canReload()) {
      this.playGunAction(7);
    }

    const speedDelta = delta * CONFIG.BULLET.SPEED;
    const box = new THREE.Box3();
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const bullet = this.bullets[i];
      bullet.position.addScaledVector(bullet.userData.velocity, speedDelta);
      if (bullet.position.length() > CONFIG.BULLET.MAX_DISTANCE) {
        this.scene.remove(bullet);
        this.bullets.splice(i, 1);
        continue;
      }
      for (let j = 0; j < this.modelManager.zombies.length; j++) {
        const zombie = this.modelManager.zombies[j];
        const state = this.modelManager.zombieStates[j];
        if (state.dead || state.dying) continue;
        box.setFromObject(zombie);
        if (box.containsPoint(bullet.position)) {
          this.adaptiveDifficulty.recordHit();
          if (this.multiplayer.isHost) {
            this.applyZombieDamage(j);
          } else {
            this.multiplayer.sendZombieHit(j);
          }
          this.scene.remove(bullet);
          this.bullets.splice(i, 1);
          break;
        }
      }
    }
  }

  public applyZombieDamage(index: number): void {
    const state = this.modelManager.zombieStates[index];
    if (!state || state.dead || state.dying) return;
    state.health -= 1;
    if (state.health <= 0) {
      state.health = 0;
      state.dying = true;
      state.deathTimer = 0.9;
      state.fadeTimer = 0;
      state['deathAnimStarted'] = false;
      this.adaptiveDifficulty.recordKill();
      this.modelManager.zombieMixers[index]?.stopAllAction();
    }
  }

  public canShoot(): boolean {
    return this.gameState.shootTimer <= 0 && !this.gameState.isReloading && this.gameState.ammo > 0;
  }

  public canReload(): boolean {
    return this.gameState.shootTimer <= 0 && !this.gameState.isReloading && this.gameState.ammo < CONFIG.WEAPON.MAX_AMMO;
  }
}

class EnemyManager {
  private zombieSoundStarted = false;
  private tempVec = new THREE.Vector3();
  private avoidVec = new THREE.Vector3();
  private moveVec = new THREE.Vector3();
  private flankVec = new THREE.Vector3();
  private attackCooldowns = new Map<number, number>();

  constructor(
    private gameState: GameState,
    private modelManager: ModelManager,
    private camera: THREE.PerspectiveCamera,
    private adaptiveDifficulty: AdaptiveDifficulty,
    private multiplayer: MultiplayerManager,
    private remotePlayers: Map<string, THREE.Object3D>
  ) { }

  public updateZombie(delta: number): void {
    const zombies = this.modelManager.zombies;
    if (!zombies.length) return;

    const settings = this.adaptiveDifficulty.getEnemySettings();
    const zombieSpeed = CONFIG.ZOMBIE.SPEED * settings.movementSpeedMultiplier;
    const damageRate = CONFIG.ZOMBIE.DAMAGE_RATE * settings.attackDamageMultiplier;
    const avoidRadius = Math.max(1.8, 1.35 * settings.separationMultiplier);
    const states = this.modelManager.zombieStates;
    let firstAliveZombieIdx = zombies.findIndex((_, i) => !states[i].dead && !states[i].dying);
    this.manageSounds(firstAliveZombieIdx !== -1 ? zombies[firstAliveZombieIdx] : null);

    for (let i = 0; i < zombies.length; i++) {
      const zombie = zombies[i];
      const state = states[i];
      if (state.dying) {
        this.processDyingZombie(zombie, state, delta);
        continue;
      }
      if (state.dead) continue;

      const targets: Array<{ id: string; position: THREE.Vector3; health: number; local: boolean }> = [
        { id: this.multiplayer.playerId, position: this.camera.position, health: this.gameState.health, local: true }
      ];
      for (const [id, player] of this.remotePlayers) {
        const health = Number(player.userData.health ?? 100);
        if (health > 0) targets.push({ id, position: player.position, health, local: false });
      }
      const livingTargets = targets.filter(target => target.health > 0);
      if (!livingTargets.length) continue;
      // Compare players using horizontal X/Z distance only. Camera and soldier
      // models have different Y heights, so 3D distance can prevent attacks.
      const horizontalDistanceTo = (position: THREE.Vector3): number => {
        const dx = position.x - zombie.position.x;
        const dz = position.z - zombie.position.z;
        return Math.hypot(dx, dz);
      };

      let target = livingTargets[0];
      let distance = horizontalDistanceTo(target.position);
      for (let targetIndex = 1; targetIndex < livingTargets.length; targetIndex++) {
        const candidate = livingTargets[targetIndex];
        const candidateDistance = horizontalDistanceTo(candidate.position);
        if (candidateDistance < distance) {
          target = candidate;
          distance = candidateDistance;
        }
      }

      // Give every zombie a stable side lane while approaching. This keeps
      // large waves from collapsing into one straight queue behind each other.
      const directToTarget = new THREE.Vector3().subVectors(target.position, zombie.position);
      directToTarget.y = 0;
      const laneOffset = ((i % 9) - 4) * 0.75;
      const approachPoint = target.position.clone();
      if (directToTarget.lengthSq() > 0.0001 && distance > 4) {
        const side = new THREE.Vector3(-directToTarget.z, 0, directToTarget.x).normalize();
        approachPoint.addScaledVector(side, laneOffset);
      }

      this.tempVec.subVectors(approachPoint, zombie.position);
      this.tempVec.y = 0;
      this.avoidVec.set(0, 0, 0);
      const remainingCooldown = Math.max(0, (this.attackCooldowns.get(i) || 0) - delta);
      this.attackCooldowns.set(i, remainingCooldown);

      for (let j = 0; j < zombies.length; j++) {
        if (i === j || states[j].dead || states[j].dying) continue;
        const d = zombie.position.distanceTo(zombies[j].position);
        if (d < avoidRadius && d > 0) {
          this.tempVec.subVectors(zombie.position, zombies[j].position)
            .normalize()
            .multiplyScalar((avoidRadius - d) / avoidRadius);
          this.avoidVec.add(this.tempVec);
        }
      }

      // Zombies only engage when the player enters the adaptive detection range.
      if (distance <= settings.detectionRange) {
        this.moveVec.copy(this.tempVec.normalize()).multiplyScalar(zombieSpeed * delta);

        if (this.avoidVec.lengthSq() > 0) {
          this.avoidVec.normalize().multiplyScalar(zombieSpeed * delta * 0.7);
          this.moveVec.add(this.avoidVec);
        }

        // Strong players make zombies more likely to flank instead of charging in a straight line.
        if (Math.random() < settings.flankChance * delta) {
          this.flankVec.set(-this.tempVec.z, 0, this.tempVec.x).normalize();
          if (i % 2 === 0) this.flankVec.multiplyScalar(-1);
          this.moveVec.addScaledVector(this.flankVec, zombieSpeed * delta * 0.8);
        }

        // A slightly wider melee radius makes attacks reliable for both the
        // first-person camera and the teammate soldier model.
        const attackDistance = Math.max(1.15, CONFIG.ZOMBIE.MIN_DISTANCE);
        if (distance > attackDistance) {
          zombie.position.add(this.moveVec);
          zombie.lookAt(target.position.x, zombie.position.y, target.position.z);
        } else if (remainingCooldown <= 0) {
          const damage = Math.max(1, damageRate);
          this.attackCooldowns.set(i, 0.8);
          if (target.local) {
            this.gameState.health = Math.max(0, this.gameState.health - damage);
            this.adaptiveDifficulty.recordDamage(damage, this.gameState.health);
          } else {
            this.multiplayer.sendPlayerDamage(target.id, damage);
          }
        }
      }

      zombie.position.x = clamp(zombie.position.x, GAME_BOUNDS.minX, GAME_BOUNDS.maxX);
      zombie.position.z = clamp(zombie.position.z, GAME_BOUNDS.minZ, GAME_BOUNDS.maxZ);
    }
  }

  private manageSounds(aliveZombie: THREE.Object3D | null): void {
    if (aliveZombie) {
      if (!this.zombieSoundStarted && typeof zombieAudioBuffer !== "undefined" && zombieAudioBuffer) {
        playZombieSoundAt(aliveZombie.position, this.camera);
        this.zombieSoundStarted = true;
      }
      if (this.zombieSoundStarted) {
        updateZombieSoundPosition(aliveZombie, this.camera);
      }
    } else if (this.zombieSoundStarted) {
      if (zombieSource) {
        zombieSource.stop();
        zombieSource.disconnect();
        zombieSource = null;
      }
      if (zombiePanner) {
        zombiePanner.disconnect();
        zombiePanner = null;
      }
      this.zombieSoundStarted = false;
    }
  }

  private processDyingZombie(zombie: THREE.Object3D, state: any, delta: number): void {
    if (!state['deathAnimStarted']) {
      const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(zombie.quaternion);
      const right = new THREE.Vector3()
        .crossVectors(new THREE.Vector3(0, 1, 0), forward)
        .normalize();

      state['fallAxis'] = right;
      state['fallRot'] = 0;
      state['fallTarget'] = THREE.MathUtils.degToRad(THREE.MathUtils.randInt(70, 90));
      state['fallDirection'] = 1;
      state['deathAnimStarted'] = true;

      const index = this.modelManager.zombies.indexOf(zombie);
      this.modelManager.zombieMixers[index]?.stopAllAction();
    }

    if (state['fallRot'] < state['fallTarget']) {
      const fallSpeed = THREE.MathUtils.degToRad(120) * delta;
      const remaining = state['fallTarget'] - state['fallRot'];
      const rotateAmount = Math.min(fallSpeed, remaining);

      zombie.rotateOnWorldAxis(state['fallAxis'], rotateAmount * state['fallDirection']);
      state['fallRot'] += rotateAmount;
      zombie.position.y = Math.max(-0.12, zombie.position.y - delta * 0.22);
      return;
    }

    // Stay on the ground briefly, then disappear cleanly.
    // We do not fade materials because shared/transparent materials caused
    // living zombies to become invisible while their shadows remained.
    state.deathTimer = Math.max(0, Number(state.deathTimer || 0) - delta);
    if (state.deathTimer > 0) return;

    state.dying = false;
    state.dead = true;
    zombie.visible = false;
    zombie.traverse((child: any) => {
      if (child.isMesh) child.castShadow = false;
    });
  }
}

class UIManager {
  private ammoDisplay: HTMLElement;
  private healthFill: HTMLElement;
  private zombieProgressBar: HTMLElement;
  private zombieProgressFill: HTMLElement;
  private zombieProgressText: HTMLElement;
  private difficultyDisplay: HTMLElement;
  private totalZombies: number;
  private maxAmmo: number;

  constructor(
    private gameState: GameState,
    private adaptiveDifficulty: AdaptiveDifficulty
  ) {
    this.totalZombies = CONFIG.ZOMBIE.COUNT;
    this.maxAmmo = CONFIG.WEAPON.MAX_AMMO;
    this.createUI();
  }

  private createUI(): void {
    document.body.insertAdjacentHTML('beforeend', `
      <div style="position:fixed;top:20px;right:20px;color:#fff;font-family:sans-serif;font-size:16px;text-align:right;z-index:20">
        <div id="ammoDisplay">Ammo: ${this.maxAmmo} / ${this.maxAmmo}</div>
        <div id="difficultyDisplay" style="margin-top:6px">Enemy AI: Normal</div>
        <div id="healthBar" style="margin-top:8px;width:120px;height:16px;border:1px solid #fff">
          <div id="healthFill" style="background:#f00;width:100%;height:100%"></div>
        </div>
      </div>
      <div id="zombieProgressBar" style="position:fixed;top:20px;left:50%;transform:translateX(-50%);width:320px;height:22px;background:#222;border:2px solid #fff;border-radius:12px;z-index:30;box-shadow:0 2px 12px #000a;overflow:hidden;display:flex;align-items:center;">
        <div id="zombieProgressFill" style="background:#3cff3c;height:100%;width:0%;transition:width 0.2s;"></div>
        <span id="zombieProgressText" style="position:absolute;width:100%;text-align:center;color:#fff;font-weight:bold;letter-spacing:0.04em;font-size:15px;pointer-events:none;">0 / ${this.totalZombies} Zombies Killed</span>
      </div>
      <div style="position:fixed;top:50%;left:50%;width:8px;height:8px;background:#f00;border-radius:50%;transform:translate(-50%,-50%);pointer-events:none;z-index:10"></div>
    `);
    this.ammoDisplay = document.getElementById('ammoDisplay')!;
    this.difficultyDisplay = document.getElementById('difficultyDisplay')!;
    this.healthFill = document.getElementById('healthFill')!;
    this.zombieProgressBar = document.getElementById('zombieProgressBar')!;
    this.zombieProgressFill = document.getElementById('zombieProgressFill')!;
    this.zombieProgressText = document.getElementById('zombieProgressText')!;
  }

  public updateUI(modelManager?: ModelManager): void {
    this.ammoDisplay.textContent = `Ammo: ${this.gameState.ammo} / ${this.maxAmmo}`;
    this.healthFill.style.width = `${Math.max(0, this.gameState.health)}%`;

    const difficulty = this.adaptiveDifficulty.getDifficultyLevel();
    const difficultyLabel =
      difficulty < 0.38 ? 'Easy' :
      difficulty < 0.68 ? 'Normal' : 'Hard';
    this.difficultyDisplay.textContent = `Enemy AI: ${difficultyLabel} (${Math.round(difficulty * 100)}%)`;

    if (modelManager) {
      const killed = modelManager.zombieStates.filter(z => z.dead).length;
      const percent = Math.round((killed / this.totalZombies) * 100);
      this.zombieProgressFill.style.width = `${percent}%`;
      this.zombieProgressText.textContent = `${killed} / ${this.totalZombies} Zombies Killed`;
      this.zombieProgressBar.style.display = killed >= this.totalZombies ? 'none' : 'flex';
    }
  }

  public showZombieBar(): void {
    this.zombieProgressBar.style.display = 'flex';
  }
}

class InputManager {
  constructor(private gameState: GameState, private weaponManager: WeaponManager, private lightingManager: LightingManager, private controls: PointerLockControls) {
    // Keyboard and mouse are handled independently so movement and firing can happen together.
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('blur', this.resetInput);
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
    document.body.addEventListener('click', this.onClick);
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    this.gameState.keysPressed[e.code] = true;

    if (['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code)) {
      e.preventDefault();
    }

    // Space can be held to fire while W/A/S/D remain pressed.
    if (e.code === 'Space') {
      e.preventDefault();
      this.gameState.isShooting = true;
      return;
    }

    if (e.code === 'KeyR' && this.weaponManager.canReload()) {
      this.weaponManager.playGunAction(7);
    } else if (e.code === 'KeyF' && !e.repeat) {
      this.gameState.flashlightOn = !this.gameState.flashlightOn;
      this.lightingManager.toggleFlashlight();
    }
  }

  private onKeyUp = (e: KeyboardEvent): void => {
    this.gameState.keysPressed[e.code] = false;
    if (e.code === 'Space') {
      e.preventDefault();
      this.gameState.isShooting = false;
    }
  }

  private onPointerDown = (e: PointerEvent): void => {
    if (e.button !== 0) return;

    // First click locks the mouse. Following clicks shoot, including while W/A/S/D are held.
    if (!this.controls.isLocked) {
      this.controls.lock();
      return;
    }

    e.preventDefault();
    this.gameState.isShooting = true;
  }

  private onPointerUp = (e: PointerEvent): void => {
    if (e.button === 0) {
      this.gameState.isShooting = false;
    }
  }

  private onClick = (): void => {
    if (!this.controls.isLocked) this.controls.lock();
  }

  private onPointerLockChange = (): void => {
    if (!this.controls.isLocked) {
      this.gameState.isShooting = false;
    }
  }

  private resetInput = (): void => {
    this.gameState.isShooting = false;
    this.gameState.keysPressed = {};
  }

  public isWalking(): boolean {
    const { keysPressed } = this.gameState;
    return Boolean(keysPressed['KeyW'] || keysPressed['KeyA'] || keysPressed['KeyS'] || keysPressed['KeyD']);
  }
}

class GameLoadingManager {
  public manager: THREE.LoadingManager;
  private loadingScreen: HTMLElement;
  private loadingBar: HTMLElement;

  constructor(onLoad: () => void) {
    this.loadingScreen = document.getElementById('loading-screen')!;
    this.loadingBar = document.getElementById('loading-bar')!;
    this.manager = new THREE.LoadingManager();
    this.manager.onStart = () => { this.show(); this.setProgress(0); };
    this.manager.onProgress = (_url, itemsLoaded, itemsTotal) => { this.setProgress((itemsLoaded / itemsTotal) * 100); };
    this.manager.onLoad = () => {
      this.setProgress(100);
      setTimeout(() => { this.hide(); onLoad(); }, 400);
    };
    this.manager.onError = () => { this.hide(); onLoad(); };
  }

  public show() {
    if (this.loadingScreen) this.loadingScreen.style.display = 'flex';
  }

  public hide() {
    if (this.loadingScreen) this.loadingScreen.style.display = 'none';
  }

  private setProgress(percent: number) {
    if (this.loadingBar) this.loadingBar.style.width = `${percent}%`;
  }
}

class Game {
  private checkpoint: THREE.Object3D | null = null;
  private checkpointBox: THREE.Box3 | null = null;
  private checkpointMixer: THREE.AnimationMixer | null = null;
  private checkpointTriggered = false;
  private checkpoint2Active = false;
  private checkpoint2Triggered = false;
  private checkpoint3Active = false;
  private checkpoint3Triggered = false;
  private originalZombieCount = CONFIG.ZOMBIE.COUNT;
  private clock = new THREE.Clock();
  private localDeathHandled = false;

  private breathingAmplitude = 0.02;
  private breathingSpeed = 3;
  private breathingOffset = 0;

  private bobbingAmplitude = 0.08;
  private bobbingSpeed = 12;
  private bobbingOffset = 0;

  private missionStage: MissionStage = 1;
  private appliedMissionStage: MissionStage = 1;
  private lastDifficultyReport = 0;
  private lastZombieSnapshotSent = 0;

  private sceneManager: SceneManager;
  private gameState: GameState;
  private adaptiveDifficulty: AdaptiveDifficulty;
  private remotePlayers = new Map<string, THREE.Object3D>();
  private remoteBulletGeometry = new THREE.SphereGeometry(0.06, 6, 6);
  private remoteBulletMaterial = new THREE.MeshBasicMaterial({ color: 0x44ccff });
  private lightingManager: LightingManager;
  private modelManager: ModelManager;
  private weatherManager: WeatherManager;
  private weaponManager: WeaponManager;
  private enemyManager: EnemyManager;
  private uiManager: UIManager;
  private inputManager: InputManager;
  private controls: PointerLockControls;
  private composer: EffectComposer;

  private direction = new THREE.Vector3();
  private velocity = new THREE.Vector3();

  constructor(private loadingManager: GameLoadingManager, private multiplayer: MultiplayerManager) {
    this.initialize();
  }

  private initialize(): void {
    this.sceneManager = new SceneManager();
    this.gameState = new GameState();
    this.adaptiveDifficulty = new AdaptiveDifficulty();
    this.lightingManager = new LightingManager(this.sceneManager.scene, this.sceneManager.camera);
    this.modelManager = new ModelManager(this.sceneManager.scene, this.sceneManager.camera, this.loadingManager.manager);
    this.weatherManager = new WeatherManager(this.sceneManager.scene);
    this.weaponManager = new WeaponManager(
      this.sceneManager.scene,
      this.sceneManager.camera,
      this.gameState,
      this.modelManager,
      this.lightingManager,
      this.adaptiveDifficulty,
      this.multiplayer
    );
    this.enemyManager = new EnemyManager(
      this.gameState,
      this.modelManager,
      this.sceneManager.camera,
      this.adaptiveDifficulty,
      this.multiplayer,
      this.remotePlayers
    );
    this.uiManager = new UIManager(this.gameState, this.adaptiveDifficulty);
    this.setupMultiplayerEvents();
    this.setupPostProcessing();
    this.setupWindowEvents();
    this.loadCheckpoint();
  }

  private setupMultiplayerEvents(): void {
    this.multiplayer.onPlayerState((state) => {
      const health = Math.max(0, Number(state.health) || 0);
      let mesh = this.remotePlayers.get(state.id);

      // A dead teammate disappears completely instead of remaining frozen as
      // a standing soldier. Removing it from the map also prevents zombies
      // from considering the dead player as a target.
      if (health <= 0) {
        if (mesh) this.sceneManager.scene.remove(mesh);
        this.remotePlayers.delete(state.id);
        return;
      }

      if (!mesh) {
        mesh = this.createRemotePlayer();
        this.remotePlayers.set(state.id, mesh);
        this.sceneManager.scene.add(mesh);
      }
      mesh.visible = true;
      mesh.position.set(state.position.x, state.position.y - 1, state.position.z);
      mesh.rotation.y = state.rotationY;
      mesh.userData.health = health;
    });

    this.multiplayer.onPlayerLeft((id) => {
      const mesh = this.remotePlayers.get(id);
      if (mesh) this.sceneManager.scene.remove(mesh);
      this.remotePlayers.delete(id);
    });

    this.multiplayer.onRemoteShot((data) => this.showRemoteShot(data));

    this.multiplayer.onPlayerDamage((amount) => {
      if (this.gameState.health <= 0) return;
      this.gameState.health = Math.max(0, this.gameState.health - amount);
      this.adaptiveDifficulty.recordDamage(amount, this.gameState.health);

      // Publish lethal damage immediately so the host stops targeting the
      // dead teammate without waiting for the next regular state interval.
      this.multiplayer.sendPlayerState(this.sceneManager.camera, this.gameState.health, true);
    });

    this.multiplayer.onZombieHit((index) => {
      if (this.multiplayer.isHost) this.weaponManager.applyZombieDamage(index);
    });

    this.multiplayer.onZombieSnapshot((snapshot) => {
      if (!this.multiplayer.isHost) this.applyZombieSnapshot(snapshot);
    });

    this.multiplayer.onSharedDifficulty((level) => {
      this.adaptiveDifficulty.setSharedDifficultyLevel(level);
    });

    this.multiplayer.onPlayerHealth((id, health) => {
      if (health > 0) return;
      const mesh = this.remotePlayers.get(id);
      if (mesh) this.sceneManager.scene.remove(mesh);
      this.remotePlayers.delete(id);
    });

    this.multiplayer.onHostChanged(() => {
      // Clear any accumulated frame time and immediately resume the zombie
      // simulation on whichever player is now authoritative.
      this.clock.getDelta();
    });

    this.multiplayer.onMissionStage((stage) => {
      this.missionStage = stage;
      this.applyMissionStage(stage);
    });
  }

  private createRemotePlayer(): THREE.Object3D {
    // Lightweight procedural soldier so the teammate looks like a combat character
    // without requiring an additional external model file.
    const soldier = new THREE.Group();
    const uniform = new THREE.MeshStandardMaterial({ color: 0x3f5f3b, roughness: 0.8 });
    const vest = new THREE.MeshStandardMaterial({ color: 0x232a22, roughness: 0.9 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xc98f68, roughness: 0.8 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x151718, roughness: 0.7 });

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.9, 0.38), uniform);
    torso.position.y = 1.25;
    soldier.add(torso);

    const chestVest = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.55, 0.44), vest);
    chestVest.position.set(0, 1.3, -0.02);
    soldier.add(chestVest);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 14, 10), skin);
    head.position.y = 1.95;
    soldier.add(head);

    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.58), dark);
    helmet.position.y = 2.03;
    soldier.add(helmet);

    const makeLimb = (x: number, y: number, isLeg = false) => {
      const limb = new THREE.Mesh(
        new THREE.CapsuleGeometry(isLeg ? 0.11 : 0.09, isLeg ? 0.62 : 0.48, 4, 8),
        isLeg ? dark : uniform
      );
      limb.position.set(x, y, 0);
      soldier.add(limb);
      return limb;
    };
    makeLimb(-0.47, 1.28);
    makeLimb(0.47, 1.28);
    makeLimb(-0.2, 0.48, true);
    makeLimb(0.2, 0.48, true);

    const rifle = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.95), dark);
    rifle.position.set(0.28, 1.25, -0.52);
    rifle.rotation.x = -0.12;
    soldier.add(rifle);

    soldier.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    soldier.userData.health = 100;
    return soldier;
  }

  private showRemoteShot(data: any): void {
    const bullet = new THREE.Mesh(this.remoteBulletGeometry, this.remoteBulletMaterial);
    bullet.position.set(data.origin.x, data.origin.y, data.origin.z);
    const direction = new THREE.Vector3(data.direction.x, data.direction.y, data.direction.z).normalize();
    this.sceneManager.scene.add(bullet);
    const started = performance.now();
    const animateBullet = () => {
      const elapsed = (performance.now() - started) / 1000;
      bullet.position.addScaledVector(direction, CONFIG.BULLET.SPEED * 0.016);
      if (elapsed < 1.2) requestAnimationFrame(animateBullet);
      else this.sceneManager.scene.remove(bullet);
    };
    animateBullet();
  }

  private createZombieSnapshot(): ZombieSnapshot {
    return {
      positions: this.modelManager.zombies.map(z => ({
        x: z.position.x,
        y: z.position.y,
        z: z.position.z,
        ry: z.rotation.y,
        qx: z.quaternion.x,
        qy: z.quaternion.y,
        qz: z.quaternion.z,
        qw: z.quaternion.w,
        visible: z.visible
      })),
      states: this.modelManager.zombieStates.map(s => ({
        health: s.health,
        dead: s.dead,
        dying: s.dying,
        deathTimer: s.deathTimer,
        fadeTimer: 0
      }))
    };
  }

  private applyZombieSnapshot(snapshot: ZombieSnapshot): void {
    snapshot.positions.forEach((p, i) => {
      const zombie = this.modelManager.zombies[i];
      const state = this.modelManager.zombieStates[i];
      if (!zombie || !state) return;
      zombie.position.set(p.x, p.y, p.z);

      if (
        Number.isFinite(p.qx) &&
        Number.isFinite(p.qy) &&
        Number.isFinite(p.qz) &&
        Number.isFinite(p.qw)
      ) {
        zombie.quaternion.set(p.qx!, p.qy!, p.qz!, p.qw!);
      } else {
        zombie.rotation.y = p.ry;
      }

      const incoming = snapshot.states[i];
      if (!incoming) return;
      state.health = incoming.health;
      state.dead = incoming.dead;
      state.dying = incoming.dying;
      state.deathTimer = incoming.deathTimer ?? state.deathTimer;
      state.fadeTimer = 0;
      zombie.visible = p.visible ?? !incoming.dead;

      zombie.traverse((child: any) => {
        if (!child.isMesh) return;
        child.castShadow = zombie.visible;
      });
    });
  }

  private loadCheckpoint(): void {
    const loader = new GLTFLoader(this.loadingManager.manager);
    loader.setMeshoptDecoder(MeshoptDecoder);
    loader.load('/checkpoint.glb', (gltf) => {
      this.checkpoint = gltf.scene;
      this.checkpoint.position.set(0, 0.7, 0);
      this.checkpoint.scale.set(10, 10, 10);
      this.sceneManager.scene.add(this.checkpoint);
      this.checkpointMixer = new THREE.AnimationMixer(this.checkpoint);
      this.checkpointMixer.clipAction(gltf.animations[0]).play();
      this.checkpointBox = new THREE.Box3().setFromObject(this.checkpoint);
      this.applyMissionStage(this.missionStage);
    });
  }

  public startAfterLoading(): void {
    this.setupControls();
    this.inputManager = new InputManager(this.gameState, this.weaponManager, this.lightingManager, this.controls);
    this.uiManager.updateUI();
    this.animate();
  }

  private setupControls(): void {
    this.sceneManager.camera.rotation.order = 'YXZ';
    this.controls = new PointerLockControls(this.sceneManager.camera, this.sceneManager.renderer.domElement);
    // Horizontal rotation is intentionally unlimited (full 360 degrees).
    this.controls.minPolarAngle = 0.05;
    this.controls.maxPolarAngle = Math.PI - 0.05;
    this.sceneManager.scene.add(this.controls.object);
  }

  private setupPostProcessing(): void {
    this.composer = new EffectComposer(this.sceneManager.renderer);
    this.composer.addPass(new RenderPass(this.sceneManager.scene, this.sceneManager.camera));
    this.composer.addPass(new ShaderPass(GammaCorrectionShader));
  }

  private setupWindowEvents(): void {
    window.addEventListener('resize', () => {
      const { camera, renderer } = this.sceneManager;
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
      this.composer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  private updateMovement(delta: number): void {
    const { keysPressed } = this.gameState;
    this.direction.set(0, 0, 0);
    if (keysPressed['KeyW']) this.direction.z += 1;
    if (keysPressed['KeyS']) this.direction.z -= 1;
    if (keysPressed['KeyA']) this.direction.x -= 1;
    if (keysPressed['KeyD']) this.direction.x += 1;
    if (this.direction.lengthSq() > 0) {
      this.direction.normalize();
      this.velocity.copy(this.direction).multiplyScalar(CONFIG.MOVEMENT.SPEED * delta);
      this.controls.moveRight(this.velocity.x);
      this.controls.moveForward(this.velocity.z);
      // Update bobbing offset based on movement
      this.bobbingOffset += this.bobbingSpeed * delta;
      this.sceneManager.camera.position.y = CONFIG.CAMERA.INITIAL_POSITION.y + Math.sin(this.bobbingOffset) * this.bobbingAmplitude;

      // Reset breathing offset when moving
      this.breathingOffset = 0;
    } else {
      // Breathing effect when standing still
      this.breathingOffset += this.breathingSpeed * delta;
      this.sceneManager.camera.position.y = CONFIG.CAMERA.INITIAL_POSITION.y + Math.sin(this.breathingOffset) * this.breathingAmplitude;
      // Reset bobbing when not moving
      this.bobbingOffset = 0;
    }
    const pos = this.sceneManager.camera.position;
    pos.x = clamp(pos.x, GAME_BOUNDS.minX, GAME_BOUNDS.maxX);
    pos.z = clamp(pos.z, GAME_BOUNDS.minZ, GAME_BOUNDS.maxZ);
  }

  private updateWeapon(delta: number): void {
    const { gameState, weaponManager, inputManager } = this;
    if (gameState.isShooting && weaponManager.canShoot()) {
      weaponManager.shoot();
      gameState.shootTimer = CONFIG.WEAPON.SHOOT_COOLDOWN;
      this.uiManager.updateUI();
    }
    weaponManager.updateBullets(delta);
    gameState.shootTimer -= delta;
    gameState.reloadTimer -= delta;

    // Do not let the walking/idle animation interrupt the firing animation.
    // Player movement is still processed independently in updateMovement().
    if (
      this.modelManager.gunActions.length > 0 &&
      gameState.shootTimer <= 0 &&
      !gameState.isReloading &&
      !gameState.isShooting
    ) {
      weaponManager.playGunAction(inputManager.isWalking() ? 2 : 0);
    }
  }

  private updateAnimations(delta: number): void {
    this.modelManager.gunMixer?.update(delta);
    this.modelManager.zombieMixers.forEach(mixer => mixer.update(delta));
    this.checkpointMixer?.update(delta);
  }

  private updateNearbyStreetLights(): void {
    const scene = this.sceneManager.scene;
    if (!scene) return;

    const playerPos = this.sceneManager.camera.position;
    const pointLights: any[] = [];

    scene.traverse((obj: any) => {
      if (obj.isPointLight && obj !== this.lightingManager.muzzleFlash) {
        obj._distanceToPlayer = obj.position.distanceTo(playerPos);
        pointLights.push(obj);
      }
    });

    pointLights.sort((a, b) => a._distanceToPlayer - b._distanceToPlayer);

    pointLights.forEach((light, i) => {
      const isActive = i < 4;
      light.visible = isActive;
      if (light.intensity !== undefined) {
        light.intensity = isActive ? 100 : 0;
      }
    });
  }

  private animate(): void {
    requestAnimationFrame(() => this.animate());
    const delta = Math.min(this.clock.getDelta(), 0.05);
    const playerAlive = this.gameState.health > 0;

    // A dead player becomes a spectator. Their own controls stop, but the
    // render loop, multiplayer updates and host zombie simulation continue.
    // This prevents the surviving teammate's match from freezing.
    if (playerAlive) {
      this.updateMovement(delta);
      this.updateWeapon(delta);
    } else {
      this.gameState.isShooting = false;
      this.gameState.keysPressed = {};
      if (!this.localDeathHandled) {
        this.localDeathHandled = true;
        this.multiplayer.sendPlayerState(this.sceneManager.camera, 0, true);
        showMissionFailedOverlay();
      }
    }

    this.updateAnimations(delta);
    this.weatherManager.updateRain();

    // The host remains authoritative even after dying, so zombies keep
    // moving toward the surviving player and snapshots keep being sent.
    const now = performance.now();

    if (this.multiplayer.isHost) {
      this.enemyManager.updateZombie(delta);

      // Sending every zombie every frame caused network and CPU lag.
      // About 12 updates per second is enough for smooth co-op movement.
      if (now - this.lastZombieSnapshotSent >= 80) {
        this.lastZombieSnapshotSent = now;
        this.multiplayer.sendZombieSnapshot(this.createZombieSnapshot());
      }
    }

    this.multiplayer.sendPlayerState(this.sceneManager.camera, this.gameState.health);
    if (now - this.lastDifficultyReport >= 750) {
      this.lastDifficultyReport = now;
      this.multiplayer.sendDifficultyReport(this.adaptiveDifficulty.getLocalDifficultyLevel());
    }

    this.lightingManager.updateFlashlight();
    this.uiManager.updateUI(this.modelManager);

    if (playerAlive) {
      this.checkCheckpoint();
    }
    // Wave completion must continue even if the host has died. The surviving
    // teammate can still activate checkpoints and finish the mission.
    this.updateSharedMissionProgress();

    if (this.missionStage >= 3) {
      this.updateNearbyStreetLights();
    }

    // Always render, including after local death.
    this.composer.render();
  }

  private checkCheckpoint(): void {
    if (this.checkpointTriggered || !this.checkpoint || !this.checkpointBox) return;

    this.checkpointBox.setFromObject(this.checkpoint);
    const playerPos = this.sceneManager.camera.position;
    const { min, max } = this.checkpointBox;

    if (playerPos.x >= min.x && playerPos.x <= max.x && playerPos.z >= min.z && playerPos.z <= max.z) {
      this.checkpointTriggered = true;
      playSpeechAudio1();
      if (this.checkpoint) this.checkpoint.visible = false;
      this.checkpointBox = null;
      this.checkpointMixer = null;
    }
  }

  private updateSharedMissionProgress(): void {
    const allDead = this.modelManager.zombieStates.length > 0 &&
      this.modelManager.zombieStates.every((state) => state.dead);

    // Only the host decides when a shared wave has been cleared.
    if (this.multiplayer.isHost && this.missionStage === 1 && allDead) {
      this.multiplayer.requestMissionStage(2);
      return;
    }

    if (this.missionStage === 2 && this.isPlayerInsideCheckpoint()) {
      // Either living player may activate the power checkpoint. The server
      // accepts the first request and broadcasts stage 3 to both players.
      this.multiplayer.requestMissionStage(3);
      return;
    }

    if (this.multiplayer.isHost && this.missionStage === 3 && allDead) {
      this.multiplayer.requestMissionStage(4);
      return;
    }

    if (this.missionStage === 4 && this.isPlayerInsideCheckpoint()) {
      this.multiplayer.requestMissionStage(5);
    }
  }

  private isPlayerInsideCheckpoint(): boolean {
    if (!this.checkpoint || !this.checkpointBox || !this.checkpoint.visible) return false;
    this.checkpointBox.setFromObject(this.checkpoint);
    const playerPos = this.sceneManager.camera.position;
    const { min, max } = this.checkpointBox;
    return playerPos.x >= min.x && playerPos.x <= max.x &&
      playerPos.z >= min.z && playerPos.z <= max.z;
  }

  private applyMissionStage(stage: MissionStage): void {
    if (stage < this.appliedMissionStage) return;
    this.appliedMissionStage = stage;

    if (stage === 1) return;

    if (stage === 2) {
      if (this.checkpoint) {
        this.checkpoint.position.set(0, 0.7, -400);
        this.checkpoint.scale.set(10, 10, 10);
        this.checkpoint.visible = true;
        this.checkpointBox = new THREE.Box3().setFromObject(this.checkpoint);
      }
      this.uiManager.showZombieBar();
      return;
    }

    if (stage === 3) {
      if (this.checkpoint) this.checkpoint.visible = false;
      this.checkpointBox = null;
      this.gameState.flashlightOn = false;
      this.lightingManager.flashlight.visible = false;
      this.updateNearbyStreetLights();
      this.respawnZombies();
      this.uiManager.showZombieBar();
      playSpeechAudio2();
      return;
    }

    if (stage === 4) {
      const pos = CONFIG.CAMERA.INITIAL_POSITION;
      if (this.checkpoint) {
        this.checkpoint.position.set(pos.x, 0.7, pos.z);
        this.checkpoint.scale.set(10, 10, 10);
        this.checkpoint.visible = true;
        this.checkpointBox = new THREE.Box3().setFromObject(this.checkpoint);
      }
      return;
    }

    if (stage === 5) {
      if (this.checkpoint) this.checkpoint.visible = false;
      this.checkpointBox = null;
      showMissionCompleteOverlay();
    }
  }

  private respawnZombies(): void {
    const { modelManager, sceneManager } = this;
    modelManager.zombies.forEach(zombie => sceneManager.scene.remove(zombie));
    modelManager.zombies = [];
    modelManager.zombieMixers = [];
    modelManager.zombieStates = [];

    if (modelManager.zombieGLTF) {
      this.spawnZombiesFromGLTF(modelManager.zombieGLTF, this.originalZombieCount);
    } else {
      console.error('Zombie GLTF not loaded! Cannot respawn zombies.');
    }
  }

  private spawnZombiesFromGLTF(gltf: any, count: number): void {
    const { modelManager, sceneManager } = this;
    const { minX, maxX, minZ } = GAME_BOUNDS;

    // This function is used for the second zombie wave. Spawn the entire wave
    // beyond the front gate, ahead of both players, so enemies never appear
    // behind them when the new stage begins.
    const gateZ = -400;
    const spawnMinZ = Math.max(minZ + 1.5, gateZ - 21.5);
    const spawnMaxZ = gateZ - 5.5;
    const spawnMinX = minX + 1.5;
    const spawnMaxX = maxX - 1.5;

    const columns = Math.max(5, Math.ceil(Math.sqrt(count * 1.8)));
    const rows = Math.max(1, Math.ceil(count / columns));
    const cellWidth = (spawnMaxX - spawnMinX) / columns;
    const cellDepth = (spawnMaxZ - spawnMinZ) / rows;
    const positions: THREE.Vector3[] = [];

    for (let row = 0; row < rows && positions.length < count; row++) {
      const shuffledColumns = Array.from({ length: columns }, (_, index) => index)
        .sort(() => Math.random() - 0.5);

      for (const column of shuffledColumns) {
        if (positions.length >= count) break;

        const baseX = spawnMinX + (column + 0.5) * cellWidth;
        const baseZ = spawnMinZ + (row + 0.5) * cellDepth;

        const x = clamp(
          baseX + THREE.MathUtils.randFloatSpread(Math.max(0.4, cellWidth * 0.72)),
          spawnMinX,
          spawnMaxX
        );
        const z = clamp(
          baseZ + THREE.MathUtils.randFloatSpread(Math.max(0.35, cellDepth * 0.65)),
          spawnMinZ,
          spawnMaxZ
        );

        positions.push(new THREE.Vector3(x, 0.05, z));
      }
    }

    // Randomize indexes while keeping every zombie behind the front gate.
    positions.sort(() => Math.random() - 0.5);

    for (let i = 0; i < count; i++) {
      const model = SkeletonUtils.clone(gltf.scene);
      model.scale.set(1.5, 1.5, 1.5);

      const fallbackX = THREE.MathUtils.randFloat(spawnMinX, spawnMaxX);
      const fallbackZ = THREE.MathUtils.randFloat(spawnMinZ, spawnMaxZ);
      model.position.copy(positions[i] ?? new THREE.Vector3(fallbackX, 0.05, fallbackZ));

      // Face roughly toward the gate/player side when the wave appears.
      model.rotation.y = THREE.MathUtils.randFloat(-0.35, 0.35);
      model.traverse((child: any) => {
        if (!child.isMesh) return;
        if (Array.isArray(child.material)) {
          child.material = child.material.map((material: THREE.Material) => material.clone());
        } else if (child.material) {
          child.material = child.material.clone();
        }
        child.castShadow = true;
        child.receiveShadow = true;
      });

      const mixer = new THREE.AnimationMixer(model);
      const action = mixer.clipAction(gltf.animations[3]);
      action.play();
      action.timeScale = THREE.MathUtils.randFloat(1.7, 2.3);
      action.time = Math.random() * action.getClip().duration;

      modelManager.zombieMixers.push(mixer);
      modelManager.zombies.push(model);
      modelManager.zombieStates.push({ health: 3, dead: false, dying: false, deathTimer: 0 });
      sceneManager.scene.add(model);
    }
  }}

// -- Audio and main code unchanged from your original (not shown for brevity) --

// Audio elements and contexts
let rainAudio: HTMLAudioElement;
let bgAudio: HTMLAudioElement;
let zombieAudioContext: AudioContext | null = null;
let zombieAudioBuffer: AudioBuffer | null = null;
let zombieSource: AudioBufferSourceNode | null = null;
let zombiePanner: PannerNode | null = null;

// Setup audio elements with shared configuration
function setupAudio(src: string, volume: number, loop = true): HTMLAudioElement {
  const audio = document.createElement('audio');
  audio.src = src;
  audio.loop = loop;
  audio.volume = volume;
  audio.style.display = 'none';
  document.body.appendChild(audio);

  if (loop) {
    audio.addEventListener('ended', () => {
      audio.currentTime = 0;
      audio.play().catch(() => { });
    });
  }

  return audio;
}

function setupRainAudio() {
  rainAudio = setupAudio('/rain.ogg', 0.2);
}

function setupBgAudio() {
  bgAudio = setupAudio('/bgsound.ogg', 0.8);
}

// Play temporary sound effects
function playSound(src: string, volume: number): void {
  const audio = setupAudio(src, volume, false);
  audio.autoplay = true;
  audio.addEventListener('ended', () => audio.remove());
}

function playShotSound() {
  playSound('/shot.ogg', 0.2);
}

function playReloadSound() {
  playSound('/reload.ogg', 0.7);
}

// Positional zombie audio functions
async function loadZombieAudioBuffer(): Promise<void> {
  try {
    const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextCtor) {
      console.warn('Web Audio API is not supported on this device. Continuing without zombie audio.');
      return;
    }

    if (!zombieAudioContext) {
      zombieAudioContext = new AudioContextCtor();
    }

    if (zombieAudioContext.state === 'suspended') {
      await zombieAudioContext.resume().catch(() => undefined);
    }

    const response = await fetch('/zombie.ogg');
    if (!response.ok) {
      throw new Error(`Zombie audio request failed: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    zombieAudioBuffer = await zombieAudioContext.decodeAudioData(arrayBuffer);
  } catch (error) {
    // Audio failure must never prevent the game/render loop from starting.
    console.warn('Zombie audio could not be loaded. Continuing without it.', error);
    zombieAudioBuffer = null;
  }
}

function playZombieSoundAt(position: THREE.Vector3, camera: THREE.PerspectiveCamera) {
  if (!zombieAudioContext || !zombieAudioBuffer) return;

  if (zombieSource) {
    zombieSource.stop();
    zombieSource.disconnect();
    zombieSource = null;
  }

  if (zombiePanner) {
    zombiePanner.disconnect();
    zombiePanner = null;
  }

  zombieSource = zombieAudioContext.createBufferSource();
  zombieSource.buffer = zombieAudioBuffer;
  zombieSource.loop = true;

  zombiePanner = zombieAudioContext.createPanner();
  zombiePanner.panningModel = 'HRTF';
  zombiePanner.distanceModel = 'linear';
  zombiePanner.refDistance = 1;
  zombiePanner.maxDistance = 100;
  zombiePanner.rolloffFactor = 1;
  zombiePanner.setPosition(position.x, position.y, position.z);

  zombieSource.connect(zombiePanner).connect(zombieAudioContext.destination);
  zombieSource.start(0);
  updateZombieAudioListener(camera);
}

function updateZombieAudioListener(camera: THREE.PerspectiveCamera) {
  if (!zombieAudioContext) return;

  const listener = zombieAudioContext.listener;
  const pos = camera.position;
  listener.setPosition(pos.x, pos.y, pos.z);

  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  listener.setOrientation(forward.x, forward.y, forward.z, 0, 1, 0);
}

function updateZombieSoundPosition(zombie: THREE.Object3D, camera: THREE.PerspectiveCamera) {
  if (zombiePanner) {
    zombiePanner.setPosition(zombie.position.x, zombie.position.y, zombie.position.z);
    updateZombieAudioListener(camera);
  }
}

// Audio volume management
function fadeAudio(audio: HTMLAudioElement, targetVolume: number, duration: number = 1000) {
  if (!audio) return;

  if (audio.paused) {
    audio.loop = true;
    audio.play().catch(() => { });
  }

  const startVolume = audio.volume;
  const startTime = performance.now();

  function step(now: number) {
    const t = Math.min((now - startTime) / duration, 1);
    audio.volume = startVolume + (targetVolume - startVolume) * t;

    if (t < 1) {
      requestAnimationFrame(step);
    }
  }

  requestAnimationFrame(step);
}

function fadeAllBackgroundAudio(target: number, duration: number = 1000) {
  [rainAudio, bgAudio].forEach(audio => {
    if (audio && audio.paused) {
      audio.loop = true;
      audio.play().catch(() => { });
    }
  });

  fadeAudio(rainAudio, 0.2 * target, duration);
  fadeAudio(bgAudio, 0.8 * target, duration);

  if (zombieAudioContext && zombieSource) {
    if (!(zombieSource as any)._gainNode) {
      const gainNode = zombieAudioContext.createGain();
      gainNode.gain.value = target;

      if (zombiePanner) {
        zombiePanner.disconnect();
        zombiePanner.connect(gainNode).connect(zombieAudioContext.destination);
      }

      (zombieSource as any)._gainNode = gainNode;
    }

    const gainNode = (zombieSource as any)._gainNode as GainNode;
    gainNode.gain.cancelScheduledValues(zombieAudioContext.currentTime);
    gainNode.gain.linearRampToValueAtTime(target, zombieAudioContext.currentTime + duration / 1000);
  }
}

// Speech and subtitles
function playSpeech(src: string, subtitle: string, duration: number, onEnd?: () => void) {
  fadeAllBackgroundAudio(0.3, 800);
  if (subtitle.trim()) showSubtitle(subtitle, duration);

  const audio = setupAudio(src, 1.0, false);
  audio.autoplay = true;

  audio.addEventListener('ended', () => {
    audio.remove();
    const subtitleBox = document.getElementById('subtitle-box');
    if (subtitleBox) subtitleBox.style.display = 'none';
    fadeAllBackgroundAudio(1, 1200);
    if (onEnd) onEnd();
  });
}

function playSpeechAudio1() {
  playSpeech(
    '/speech_audio_1.ogg',
    '',
    15000
  );
}

function playSpeechAudio2(onEnd?: () => void) {
  playSpeech(
    '/speech_audio_2.ogg',
    '',
    8000,
    onEnd
  );
}

function showSubtitle(text: string, duration: number) {
  const subtitleBox = document.getElementById('subtitle-box') as HTMLDivElement;
  if (!subtitleBox || !text.trim()) {
    if (subtitleBox) subtitleBox.style.display = 'none';
    return;
  }
  subtitleBox.textContent = text;
  subtitleBox.style.display = 'block';

  setTimeout(() => subtitleBox.style.display = 'none', duration);
}

// Game overlays
function showMissionFailedOverlay() {
  const overlay = document.getElementById("mission-failed-overlay");
  if (!overlay) return;
  overlay.style.display = "block";

  // Make it clear that only this player is down; the teammate can continue.
  const title = overlay.querySelector("h1, h2, .title");
  if (title) title.textContent = "YOU ARE DOWN";
  const message = overlay.querySelector("p, .message");
  if (message) message.textContent = "Your teammate can continue the mission.";

  document.exitPointerLock?.();
}

function showMissionCompleteOverlay() {
  document.getElementById("mission-complete-overlay")!.style.display = "block";
  document.exitPointerLock?.();
}

// Main function
function main() {
  setupRainAudio();
  setupBgAudio();

  const elements = {
    startButton: document.getElementById("start-button") as HTMLElement,
    startScreen: document.getElementById("start-screen") as HTMLElement,
    loadingScreen: document.getElementById("loading-screen") as HTMLElement,
    container: document.getElementById("container") as HTMLElement
  };

  elements.startScreen.style.display = "flex";
  elements.loadingScreen.style.display = "none";
  elements.container.style.display = "none";

  let game: Game | null = null;
  const multiplayer = new MultiplayerManager();

  elements.startButton.addEventListener("click", async () => {
    try {
      await multiplayer.showLobby();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Unable to connect to the multiplayer server");
      return;
    }
    elements.startScreen.style.display = "none";
    elements.loadingScreen.style.display = "flex";
    elements.container.style.display = "block";

    const loadingManager = new GameLoadingManager(async () => {
      elements.loadingScreen.style.display = "none";

      if (!game) {
        game = new Game(loadingManager, multiplayer);
        (window as any).game = game;
      }

      [rainAudio, bgAudio].forEach(audio => {
        if (audio) {
          audio.loop = true;
          audio.play().catch(() => { });
        }
      });

      // Start immediately after both players enter the room and assets finish loading.
      // The first click inside the game can still capture the mouse pointer.
      await loadZombieAudioBuffer();
      game.startAfterLoading();
    });

    game = new Game(loadingManager, multiplayer);
    (window as any).game = game;
  });
}

main();
