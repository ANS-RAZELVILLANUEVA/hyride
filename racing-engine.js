/** Gameplay uses a fixed 400 × 710 canvas, independent of the screen size. */
export const RACE_CONFIG = Object.freeze({
  width: 400,
  height: 710,
  goal: 520,
  pointsPerSecond: 10,
  startSpeed: 240,
  maxSpeed: 520,
  countdownSeconds: 3,
  finishSeconds: 2.5,
  laneBaselines: Object.freeze([0.785, 0.9]),
  laneChangeSeconds: 0.14,
  bikeLeft: 45,
  bikeRight: 125,
  riderWidth: 112,
  riderHeight: 75,
  obstacleMaxWidth: 140,
  obstacleMaxHeight: 75,
  spawnX: 420,
});

const OBSTACLE_TYPES = Object.freeze([
  { type: 'white_car', aspect: 570 / 222, scale: 1.44 },
  { type: 'red_car', aspect: 540 / 275, scale: 1.2 },
  { type: 'truck', aspect: 559 / 349, scale: 1.44 },
  { type: 'broken_car', aspect: 1442 / 468, scale: 1.44 },
  { type: 'hole', aspect: 1216 / 817 },
].map(({ type, aspect, scale = 1 }) => {
  const height = Math.min(RACE_CONFIG.obstacleMaxHeight, RACE_CONFIG.obstacleMaxWidth / aspect) * scale;
  return Object.freeze({ type, width: height * aspect, height });
}));

const EPSILON = 1e-8;
const MAX_STEP = 1 / 60;
const RACE_SECONDS = RACE_CONFIG.goal / RACE_CONFIG.pointsPerSecond;
const OBSTACLE_INSET = 0.14;
// Opposite-lane obstacles allow time to react and complete a lane change.
const SWITCH_CLEARANCE_SECONDS = 0.6;

function raceSpeed(elapsed) {
  return RACE_CONFIG.startSpeed
    + (RACE_CONFIG.maxSpeed - RACE_CONFIG.startSpeed) * elapsed / RACE_SECONDS;
}

// Integrate the continuous acceleration so road and hazards travel the same
// distance regardless of frame size or which score a frame crosses.
function raceDistance(elapsed) {
  return RACE_CONFIG.startSpeed * elapsed
    + (RACE_CONFIG.maxSpeed - RACE_CONFIG.startSpeed) * elapsed ** 2 / (2 * RACE_SECONDS);
}

/**
 * Pure game state. The caller renders these properties and skips tick() while
 * paused. Baselines/riderY are normalized; all horizontal sizes are logical px.
 */
export class RaceEngine {
  constructor({ rng = Math.random, onPhaseChange = null } = {}) {
    this.rng = rng;
    this.onPhaseChange = onPhaseChange;
    this.phase = 'intro';
    this._reset();
  }

  _reset() {
    this.score = 0;
    this.elapsed = 0;
    this.countdown = RACE_CONFIG.countdownSeconds;
    this.roadTime = 0;
    this.roadDistance = 0;
    this.lane = 1;
    this.riderY = RACE_CONFIG.laneBaselines[1];
    this.obstacles = [];
    this.finishX = RACE_CONFIG.spawnX;
    this.speed = RACE_CONFIG.startSpeed;
    this._finishElapsed = 0;
    this._spawnRemaining = 1.3;
    this._nextId = 1;
  }

  _setPhase(next) {
    if (next === this.phase) return;
    const previous = this.phase;
    this.phase = next;
    this.onPhaseChange?.(next, previous, this);
  }

  /** Begin the moving, obstacle-free instructions screen. */
  start() {
    this._reset();
    this._setPhase('instructions');
    return this;
  }

  restart() {
    return this.start();
  }

  closeInstructions() {
    if (this.phase === 'instructions') {
      this.countdown = RACE_CONFIG.countdownSeconds;
      this._setPhase('countdown');
    }
    return this;
  }

  /** -1 is up, +1 is down; repeated presses never leave the two lanes. */
  move(direction) {
    if (!['instructions', 'countdown', 'racing'].includes(this.phase)) return this;
    if (!Number.isFinite(direction) || direction === 0) return this;
    this.lane = Math.max(0, Math.min(1, this.lane + Math.sign(direction)));
    return this;
  }

  _moveRider(dt) {
    const target = RACE_CONFIG.laneBaselines[this.lane];
    const fullDistance = RACE_CONFIG.laneBaselines[1] - RACE_CONFIG.laneBaselines[0];
    const distance = fullDistance * dt / RACE_CONFIG.laneChangeSeconds;
    this.riderY += Math.sign(target - this.riderY) * Math.min(distance, Math.abs(target - this.riderY));
  }

  _advanceRoad(dt, speed = this.speed) {
    this.roadTime += dt;
    this.roadDistance += speed * dt;
  }

  _random() {
    const value = this.rng();
    return Number.isFinite(value) ? Math.max(0, Math.min(1 - Number.EPSILON, value)) : 0;
  }

  _spawnObstacle() {
    let lane = this._random() < 0.5 ? 0 : 1;
    const shape = OBSTACLE_TYPES[Math.floor(this._random() * OBSTACLE_TYPES.length)];
    const previous = this.obstacles[this.obstacles.length - 1];

    if (previous && previous.lane !== lane) {
      const previousRight = previous.x + previous.width * (1 - OBSTACLE_INSET);
      const nextLeft = RACE_CONFIG.spawnX + shape.width * OBSTACLE_INSET;
      const neededGap = RACE_CONFIG.bikeRight - RACE_CONFIG.bikeLeft
        + this.speed * SWITCH_CLEARANCE_SECONDS;
      if (nextLeft - previousRight < neededGap) lane = previous.lane;
    }

    this.obstacles.push({
      id: this._nextId++,
      ...shape,
      x: RACE_CONFIG.spawnX,
      lane,
      baseline: RACE_CONFIG.laneBaselines[lane],
    });
  }

  _hasCollision() {
    return this.obstacles.some(obstacle => {
      const left = obstacle.x + obstacle.width * OBSTACLE_INSET;
      const right = obstacle.x + obstacle.width * (1 - OBSTACLE_INSET);
      // Use wheel/lane positions so sprites do not block both lanes.
      return left < RACE_CONFIG.bikeRight && right > RACE_CONFIG.bikeLeft
        && Math.abs(this.riderY - obstacle.baseline) < 0.036;
    });
  }

  _raceStep(dt) {
    const previousElapsed = this.elapsed;
    this.elapsed = Math.min(RACE_SECONDS, this.elapsed + dt);
    if (this.elapsed >= RACE_SECONDS - EPSILON) this.elapsed = RACE_SECONDS;
    this.score = Math.min(RACE_CONFIG.goal, Math.floor(this.elapsed * RACE_CONFIG.pointsPerSecond + EPSILON));
    this.speed = raceSpeed(this.elapsed);
    const distance = raceDistance(this.elapsed) - raceDistance(previousElapsed);
    this.roadTime += dt;
    this.roadDistance += distance;

    if (this.elapsed >= RACE_SECONDS - EPSILON) {
      this.elapsed = RACE_SECONDS;
      this.score = RACE_CONFIG.goal;
      this.obstacles = [];
      this._setPhase('finishing');
      return;
    }

    for (const obstacle of this.obstacles) obstacle.x -= distance;
    this.obstacles = this.obstacles.filter(obstacle => obstacle.x + obstacle.width > -12);
    this._spawnRemaining -= dt;
    if (this._spawnRemaining <= EPSILON) {
      this._spawnObstacle();
      this._spawnRemaining += 2.3 - 0.4 * this.elapsed / RACE_SECONDS;
    }
    if (this._hasCollision()) this._setPhase('lost');
  }

  /**
   * Advance in seconds. Substeps prevent missed collisions on slow devices;
   * phase boundaries consume exactly their own time, including a long tick.
   */
  tick(dtSeconds) {
    if (!Number.isFinite(dtSeconds) || dtSeconds <= 0) return this;
    if (['intro', 'won', 'lost'].includes(this.phase)) return this;

    if (this.phase === 'instructions') {
      this._advanceRoad(dtSeconds);
      this._moveRider(dtSeconds);
      return this;
    }

    let remaining = dtSeconds;
    while (remaining > EPSILON && !['intro', 'won', 'lost'].includes(this.phase)) {
      let dt = Math.min(MAX_STEP, remaining);
      if (this.phase === 'countdown') dt = Math.min(dt, this.countdown);
      if (this.phase === 'racing') {
        dt = Math.min(dt, RACE_SECONDS - this.elapsed);
      }
      if (this.phase === 'finishing') dt = Math.min(dt, RACE_CONFIG.finishSeconds - this._finishElapsed);
      if (this.phase !== 'racing') this._advanceRoad(dt);
      this._moveRider(dt);

      if (this.phase === 'countdown') {
        this.countdown = Math.max(0, this.countdown - dt);
        if (this.countdown <= EPSILON) {
          this.countdown = 0;
          this._setPhase('racing');
        }
      } else if (this.phase === 'racing') {
        this._raceStep(dt);
      } else if (this.phase === 'finishing') {
        this._finishElapsed += dt;
        const progress = Math.min(1, this._finishElapsed / RACE_CONFIG.finishSeconds);
        this.finishX = RACE_CONFIG.spawnX - 480 * progress;
        if (this._finishElapsed >= RACE_CONFIG.finishSeconds - EPSILON) {
          this._finishElapsed = RACE_CONFIG.finishSeconds;
          this.finishX = -60;
          this._setPhase('won');
        }
      }
      remaining -= dt;
    }
    return this;
  }
}
