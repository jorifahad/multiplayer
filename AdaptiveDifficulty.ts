export interface EnemyDifficultySettings {
  movementSpeedMultiplier: number;
  attackDamageMultiplier: number;
  detectionRange: number;
  flankChance: number;
  separationMultiplier: number;
}

export class AdaptiveDifficulty {
  private shotsFired = 0;
  private shotsHit = 0;
  private kills = 0;
  private damageTaken = 0;
  private playerHealth = 100;

  private startTime = performance.now();
  private difficulty = 0.5;
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
    this.damageTaken += amount;
    this.playerHealth = Math.max(0, currentHealth);
  }

  private calculateTargetDifficulty(): number {
    const elapsedMinutes = Math.max(
      (performance.now() - this.startTime) / 60000,
      0.25
    );

    const accuracy =
      this.shotsFired > 0
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

  private updateDifficulty(): void {
    const now = performance.now();

    // Recalculate at most four times per second.
    if (now - this.lastUpdateTime < 250) return;
    this.lastUpdateTime = now;

    const target = this.calculateTargetDifficulty();

    // Smooth transition so enemies never change suddenly.
    this.difficulty += (target - this.difficulty) * 0.08;
  }

  public getEnemySettings(): EnemyDifficultySettings {
    this.updateDifficulty();
    const level = this.difficulty;

    return {
      movementSpeedMultiplier: 0.70 + level * 0.80,
      attackDamageMultiplier: 0.60 + level * 0.90,
      detectionRange: 170 + level * 280,
      flankChance: 0.03 + level * 0.32,
      separationMultiplier: 1.20 - level * 0.35
    };
  }

  public getDifficultyLevel(): number {
    this.updateDifficulty();
    return this.difficulty;
  }
}
