import Phaser from 'phaser';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RayHit {
  x: number;
  y: number;
  hit: boolean;
  dist: number;
}

interface FlashlightConfig {
  /** Half-angle of the cone in degrees (total cone = coneHalfAngle * 2) */
  coneHalfAngle: number;
  /** Number of rays to cast across the cone */
  numRays: number;
  /** Maximum reach of the light in world pixels */
  radius: number;
  /** Colour of the light tint applied to lit tiles (0xRRGGBB) */
  lightColour: number;
  /** Opacity of the dark overlay outside the cone (0–1) */
  shadowAlpha: number;
}

// ---------------------------------------------------------------------------
// FlashlightScene
// ---------------------------------------------------------------------------

export class FlashlightScene extends Phaser.Scene {
  // --- tilemap ---
  private map!: Phaser.Tilemaps.Tilemap;
  private groundLayer!: Phaser.Tilemaps.TilemapLayer;
  private wallLayer!: Phaser.Tilemaps.TilemapLayer;

  // --- flashlight ---
  private lightGraphics!: Phaser.GameObjects.Graphics;
  private overlayGraphics!: Phaser.GameObjects.Graphics;
  private lightOrigin!: Phaser.Math.Vector2;
  private lightDirection: number = 0; // radians

  private config: FlashlightConfig = {
    coneHalfAngle: 35,       // 70° total cone
    numRays: 120,
    radius: 200,
    lightColour: 0xffe8a0,
    shadowAlpha: 0.92,
  };

  // --- optional: player sprite that carries the flashlight ---
  private player?: Phaser.GameObjects.Rectangle;

  constructor() {
    super({ key: 'FlashlightScene' });
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  preload(): void {
    // Load your tileset image and tilemap JSON here.
    // Example:
    //   this.load.image('tiles', 'assets/tileset.png');
    //   this.load.tilemapTiledJSON('map', 'assets/map.json');
    //
    // For a quick start without assets, we procedurally build the map below
    // inside create() using createBlankTilemap().
  }

  create(): void {
    this.buildProceduralMap();
    this.setupPlayer();
    this.setupGraphicsLayers();
    this.setupInputs();

    // Start the light at the player's position
    this.lightOrigin = new Phaser.Math.Vector2(
      this.scale.width / 2,
      this.scale.height / 2,
    );
  }

  update(_time: number, _delta: number): void {
    this.handleMovement();
    this.updateLightDirection();
    this.drawFlashlight();
  }

  // ---------------------------------------------------------------------------
  // Map construction
  // ---------------------------------------------------------------------------

  /**
   * Builds a simple tilemap entirely in code so the demo runs without
   * external assets.  Replace this with a Tiled JSON map in production.
   *
   * Tile index conventions used here:
   *   1 = floor (walkable)
   *   2 = wall  (solid, blocks light)
   */
  private buildProceduralMap(): void {
    const tileSize = 40;
    const cols = Math.ceil(this.scale.width / tileSize);
    const rows = Math.ceil(this.scale.height / tileSize);

    // 0 = empty slot; we fill it below
    const data: number[][] = Array.from({ length: rows }, () =>
      Array(cols).fill(1),
    );

    // Scatter some wall clusters
    const walls: [number, number][] = [
      [2, 2], [2, 3], [3, 2],
      [5, 6], [6, 6], [7, 6], [7, 7],
      [10, 2], [10, 3],
      [3, 8], [4, 8],
      [8, 9], [8, 10], [9, 9],
      [12, 5], [13, 5], [13, 6],
    ];
    for (const [col, row] of walls) {
      if (row < rows && col < cols) data[row][col] = 2;
    }

    this.map = this.make.tilemap({
      data,
      tileWidth: tileSize,
      tileHeight: tileSize,
    });

    // Programmatic tileset – fill tiles with plain colours via the graphics
    // texture trick.  In a real project use: map.addTilesetImage('tiles').
    const tileset = this.createProgrammaticTileset(tileSize);

    this.groundLayer = this.map.createLayer(0, tileset, 0, 0)!;
    this.groundLayer.setDepth(0);

    // Mark walls (tile index 2) as colliding so the player cannot walk through
    this.groundLayer.setCollision(2);
  }

  /**
   * Generates a tiny texture atlas (floor + wall) so createLayer() works
   * without any external image file.
   */
  private createProgrammaticTileset(tileSize: number): Phaser.Tilemaps.Tileset {
    const key = '__tiles__';
    const g = this.make.graphics({ x: 0, y: 0, add: false });

    // Tile index 1 – floor
    g.fillStyle(0x18182a, 1);
    g.fillRect(0, 0, tileSize, tileSize);
    g.lineStyle(0.5, 0x22223a, 1);
    g.strokeRect(0, 0, tileSize, tileSize);

    // Tile index 2 – wall (second column in the atlas)
    g.fillStyle(0x2a2a40, 1);
    g.fillRect(tileSize, 0, tileSize, tileSize);
    g.lineStyle(1, 0x3a3a60, 1);
    g.strokeRect(tileSize, 0, tileSize, tileSize);

    g.generateTexture(key, tileSize * 2, tileSize);
    g.destroy();

    return this.map.addTilesetImage(key, key, tileSize, tileSize, 0, 0)!;
  }

  // ---------------------------------------------------------------------------
  // Player
  // ---------------------------------------------------------------------------

  private setupPlayer(): void {
    const cx = this.scale.width / 2;
    const cy = this.scale.height / 2;

    this.player = this.add.rectangle(cx, cy, 14, 14, 0xffe88a);
    this.player.setDepth(10);

    // Optionally enable arcade physics for collision with walls
    // this.physics.add.existing(this.player);
    // this.physics.add.collider(this.player, this.groundLayer);
  }

  private handleMovement(): void {
    if (!this.player) return;

    const speed = 3;
    const keys = this.input.keyboard!.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT') as Record<
      string,
      Phaser.Input.Keyboard.Key
    >;

    if (keys.A.isDown || keys.LEFT.isDown) this.player.x -= speed;
    if (keys.D.isDown || keys.RIGHT.isDown) this.player.x += speed;
    if (keys.W.isDown || keys.UP.isDown) this.player.y -= speed;
    if (keys.S.isDown || keys.DOWN.isDown) this.player.y += speed;

    // Clamp to map bounds
    this.player.x = Phaser.Math.Clamp(this.player.x, 0, this.scale.width);
    this.player.y = Phaser.Math.Clamp(this.player.y, 0, this.scale.height);

    this.lightOrigin.set(this.player.x, this.player.y);
  }

  // ---------------------------------------------------------------------------
  // Graphics layers
  // ---------------------------------------------------------------------------

  private setupGraphicsLayers(): void {
    // overlayGraphics: the full-screen dark mask
    this.overlayGraphics = this.add.graphics();
    this.overlayGraphics.setDepth(50);

    // lightGraphics: the illuminated cone polygon punched through the overlay
    this.lightGraphics = this.add.graphics();
    this.lightGraphics.setDepth(51);
    this.lightGraphics.setBlendMode(Phaser.BlendModes.ERASE);
  }

  // ---------------------------------------------------------------------------
  // Input
  // ---------------------------------------------------------------------------

  private setupInputs(): void {
    // The flashlight points toward the mouse cursor
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      this.lightDirection = Phaser.Math.Angle.Between(
        this.lightOrigin.x,
        this.lightOrigin.y,
        pointer.worldX,
        pointer.worldY,
      );
    });
  }

  private updateLightDirection(): void {
    // Recalculate each frame in case the player moved
    const pointer = this.input.activePointer;
    this.lightDirection = Phaser.Math.Angle.Between(
      this.lightOrigin.x,
      this.lightOrigin.y,
      pointer.worldX,
      pointer.worldY,
    );
  }

  // ---------------------------------------------------------------------------
  // Raycasting core
  // ---------------------------------------------------------------------------

  /**
   * Casts a single ray from (ox, oy) in `angle` direction.
   * Steps forward until it hits a wall tile or reaches max radius.
   * Binary-searches the wall edge for a sharp shadow boundary.
   */
  private castRay(ox: number, oy: number, angle: number): RayHit {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const { radius } = this.config;
    const stepSize = 2; // pixels per DDA step – smaller = more accurate

    let dist = 0;

    while (dist < radius) {
      dist += stepSize;
      const nx = ox + dx * dist;
      const ny = oy + dy * dist;

      if (this.isSolid(nx, ny)) {
        // Binary-search the precise edge
        const edgeDist = this.binarySearchEdge(ox, oy, dx, dy, dist - stepSize, dist);
        return {
          x: ox + dx * edgeDist,
          y: oy + dy * edgeDist,
          hit: true,
          dist: edgeDist,
        };
      }
    }

    return {
      x: ox + dx * radius,
      y: oy + dy * radius,
      hit: false,
      dist: radius,
    };
  }

  /**
   * Narrows in on the exact pixel boundary between open space and a wall.
   */
  private binarySearchEdge(
    ox: number,
    oy: number,
    dx: number,
    dy: number,
    near: number,
    far: number,
    iterations: number = 6,
  ): number {
    for (let i = 0; i < iterations; i++) {
      const mid = (near + far) / 2;
      if (this.isSolid(ox + dx * mid, oy + dy * mid)) {
        far = mid;
      } else {
        near = mid;
      }
    }
    return (near + far) / 2;
  }

  /**
   * Returns true if the world position (wx, wy) is inside a solid tile.
   * Uses the tilemap layer directly – no separate collision grid needed.
   */
  private isSolid(wx: number, wy: number): boolean {
    // Out-of-bounds → treat as solid so rays don't escape the map
    if (wx < 0 || wy < 0 || wx >= this.scale.width || wy >= this.scale.height) {
      return true;
    }

    // getTileAtWorldXY returns null for empty/non-solid tiles
    const tile = this.groundLayer.getTileAtWorldXY(wx, wy, true);
    return tile !== null && tile.collides;
  }

  // ---------------------------------------------------------------------------
  // Flashlight rendering
  // ---------------------------------------------------------------------------

  /**
   * Main render call – called every frame from update().
   *
   * Strategy:
   *   1. Draw full-screen dark overlay on `overlayGraphics`.
   *   2. Draw the lit cone polygon on `lightGraphics` (ERASE blend mode).
   *      This punches the lit area out of the overlay.
   *   3. Optionally tint tiles that fall inside the cone.
   */
  private drawFlashlight(): void {
    const { coneHalfAngle, numRays, radius, shadowAlpha } = this.config;
    const { x: ox, y: oy } = this.lightOrigin;
    const halfRad = Phaser.Math.DegToRad(coneHalfAngle);

    // --- cast all rays ---
    const points: Phaser.Math.Vector2[] = [];
    for (let i = 0; i <= numRays; i++) {
      const angle = this.lightDirection - halfRad + (i / numRays) * halfRad * 2;
      const hit = this.castRay(ox, oy, angle);
      points.push(new Phaser.Math.Vector2(hit.x, hit.y));
    }

    // --- 1. Full-screen dark overlay ---
    this.overlayGraphics.clear();
    this.overlayGraphics.fillStyle(0x000000, shadowAlpha);
    this.overlayGraphics.fillRect(0, 0, this.scale.width, this.scale.height);

    // --- 2. Erase the cone from the overlay ---
    this.lightGraphics.clear();
    this.lightGraphics.fillStyle(0xffffff, 1);
    this.lightGraphics.beginPath();
    this.lightGraphics.moveTo(ox, oy);
    for (const p of points) {
      this.lightGraphics.lineTo(p.x, p.y);
    }
    this.lightGraphics.closePath();
    this.lightGraphics.fillPath();

    // --- 3. Soft radial falloff (drawn in NORMAL blend on top) ---
    this.drawRadialFalloff(ox, oy, radius, halfRad, points);

    // --- 4. Highlight tiles inside the cone ---
    this.tintLitTiles(ox, oy);
  }

  /**
   * Draws a dark-to-transparent radial gradient over the cone to simulate
   * the light fading with distance.
   *
   * Phaser.GameObjects.Graphics doesn't support gradients natively, so we
   * approximate the falloff by drawing concentric filled polygons with
   * decreasing alpha.
   */
  private drawRadialFalloff(
    ox: number,
    oy: number,
    radius: number,
    halfRad: number,
    outerPoints: Phaser.Math.Vector2[],
  ): void {
    const falloffGraphics = this.add.graphics();
    falloffGraphics.setDepth(52);

    const steps = 8;
    for (let s = steps; s >= 1; s--) {
      const t = s / steps;
      const alpha = Phaser.Math.Easing.Quadratic.In(t) * 0.55;
      const stepRadius = radius * t;

      falloffGraphics.fillStyle(0x000000, alpha);
      falloffGraphics.beginPath();
      falloffGraphics.moveTo(ox, oy);

      for (let i = 0; i <= outerPoints.length - 1; i++) {
        const angle =
          this.lightDirection -
          halfRad +
          (i / (outerPoints.length - 1)) * halfRad * 2;
        const dist = Math.hypot(outerPoints[i].x - ox, outerPoints[i].y - oy);
        const clampedDist = Math.min(dist, stepRadius);
        falloffGraphics.lineTo(
          ox + Math.cos(angle) * clampedDist,
          oy + Math.sin(angle) * clampedDist,
        );
      }

      falloffGraphics.closePath();
      falloffGraphics.fillPath();
    }

    // Destroy after one frame – we recreate each update()
    this.time.delayedCall(0, () => falloffGraphics.destroy());
  }

  /**
   * Applies a warm colour tint to tiles whose centres fall inside the
   * flashlight cone.  This gives solid tiles a "lit face" appearance.
   */
  private tintLitTiles(ox: number, oy: number): void {
    const { coneHalfAngle, radius, lightColour } = this.config;
    const halfRad = Phaser.Math.DegToRad(coneHalfAngle);

    this.groundLayer.forEachTile((tile) => {
      const tx = tile.getCenterX();
      const ty = tile.getCenterY();
      const dist = Phaser.Math.Distance.Between(ox, oy, tx, ty);

      if (dist > radius * 1.15) {
        tile.tint = 0xffffff; // reset tint outside range
        return;
      }

      const angleToTile = Phaser.Math.Angle.Between(ox, oy, tx, ty);
      let diff = Phaser.Math.Angle.Wrap(angleToTile - this.lightDirection);
      if (Math.abs(diff) > halfRad + 0.25) {
        tile.tint = 0xffffff; // outside cone
        return;
      }

      // Blend: full tint near origin, fade to white at radius edge
      const falloff = 1 - dist / radius;
      tile.tint = Phaser.Display.Color.Interpolate.ColorWithColor(
        Phaser.Display.Color.ValueToColor(0xffffff),
        Phaser.Display.Color.ValueToColor(lightColour),
        100,
        Math.round(falloff * 100),
      ).color;
    });
  }

  // ---------------------------------------------------------------------------
  // Public API – tweak flashlight at runtime
  // ---------------------------------------------------------------------------

  public setFlashlightConfig(partial: Partial<FlashlightConfig>): void {
    Object.assign(this.config, partial);
  }
}

// ---------------------------------------------------------------------------
// Game bootstrap
// ---------------------------------------------------------------------------

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 640,
  height: 440,
  backgroundColor: '#0a0a14',
  scene: FlashlightScene,
  // Uncomment to enable arcade physics for player–wall collisions:
  // physics: {
  //   default: 'arcade',
  //   arcade: { gravity: { y: 0 }, debug: false },
  // },
};

new Phaser.Game(config);