export interface EnemyDifficultySettings {
  movementSpeedMultiplier: number;
  attackDamageMultiplier: number;
  detectionRange: number;
  flankChance: number;
  separationMultiplier: number;
}

export type PerformanceSnapshot = {
  difficulty: number;
  shotsFired: number;
  shotsHit: number;
  kills: number;
  health: number;
};

export class AdaptiveDifficulty {
  private shotsFired = 0;
  private shotsHit = 0;
  private kills = 0;
  private damageTaken = 0;
  private playerHealth = 100;

  private startTime = performance.now();
  private localDifficulty = 0.5;
  private sharedDifficulty = 0.5;
  private lastUpdateTime = performance.now();

  public recordShot(): void {
    this.shotsFired++;
  }

  public recordHit(): void {
    this.shotsHit++;
  }

  public recordKill(): void {
    this.kills++;
  }

  public recordDamage(amount: number, currentHealth: number): void {
    this.damageTaken += Math.max(0, amount);
    this.playerHealth = Math.max(0, currentHealth);
  }

  private calculateTargetDifficulty(): number {
    const elapsedMinutes = Math.max(
      (performance.now() - this.startTime) / 60000,
      0.25
    );

    const accuracy = this.shotsFired > 0
      ? this.shotsHit / this.shotsFired
      : 0.45;

    const killsPerMinute = this.kills / elapsedMinutes;
    const killScore = Math.min(killsPerMinute / 6, 1);
    const healthScore = Math.max(0, Math.min(1, this.playerHealth / 100));

    const performanceScore =
      accuracy * 0.45 +
      killScore * 0.35 +
      healthScore * 0.20;

    return Math.max(0.2, Math.min(1, performanceScore));
  }

  private updateLocalDifficulty(): void {
    const now = performance.now();
    if (now - this.lastUpdateTime < 250) return;
    this.lastUpdateTime = now;

    const target = this.calculateTargetDifficulty();
    this.localDifficulty += (target - this.localDifficulty) * 0.08;
  }

  public getLocalDifficultyLevel(): number {
    this.updateLocalDifficulty();
    return this.localDifficulty;
  }

  public setSharedDifficultyLevel(level: number): void {
    if (!Number.isFinite(level)) return;
    this.sharedDifficulty = Math.max(0.2, Math.min(1, level));
  }

  public getPerformanceSnapshot(): PerformanceSnapshot {
    return {
      difficulty: this.getLocalDifficultyLevel(),
      shotsFired: this.shotsFired,
      shotsHit: this.shotsHit,
      kills: this.kills,
      health: this.playerHealth
    };
  }

  public getEnemySettings(): EnemyDifficultySettings {
    this.updateLocalDifficulty();

    // Both players use the same difficulty. The server chooses the stronger
    // player's value and broadcasts it to the whole room.
    const level = Math.max(this.localDifficulty, this.sharedDifficulty);

    return {
      movementSpeedMultiplier: 0.70 + level * 0.80,
      attackDamageMultiplier: 0.60 + level * 0.90,
      detectionRange: 170 + level * 280,
      flankChance: 0.03 + level * 0.32,
      separationMultiplier: 1.20 - level * 0.35
    };
  }

  public getDifficultyLevel(): number {
    this.updateLocalDifficulty();
    return Math.max(this.localDifficulty, this.sharedDifficulty);
  }
}
