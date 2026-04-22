
import * as Phaser from "phaser";
import { BayesianOccupancyFilter, type BOFConfig } from "../utils/BOF";
import easystarjs from "easystarjs";
import { flashlightStateFromScene, isPointLit, type FlashlightState } from "../utils/FlashlightState";

const SQUARE_SIZE = 32;

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


class RobotSprite extends Phaser.GameObjects.Sprite {
    private path!: Phaser.Math.Vector2[];
    private currentTarget: Phaser.Math.Vector2 | null;
    private filter!: BayesianOccupancyFilter;
    // private debug;
    // private filterDebug;
    private map: integer[][];
    private easystar!: easystarjs.js;
    private cellsSeen: Set<{
        x: number;
        y: number;
        occupied: boolean;
    }>;
    private health: integer;

    public score: integer;

    private flashlight: FlashlightState;
    private color: number;

    private config: FlashlightConfig = {
        coneHalfAngle: 35,       // 70° total cone
        numRays: 120,
        radius: 200,
        lightColour: 0xffe8a0,
        shadowAlpha: 0.92,
    };


    constructor(scene: Phaser.Scene, x: number, y: number, color: number, map: number[][]) {
        super(scene, x, y, "robot");

        this.scene = scene;
        this.map = map;
        this.color = color;

        this.currentTarget = null;
        this.path = [];

        this.setScale(0.5, 0.5)
        this.setDepth(60)

        this.health = 100;
        this.score = 0;

        // this.debug = false;
        // Enable arcade physics for moving with velocity
        scene.physics.world.enable(this);

        scene.add.existing(this);
        scene.events.on("update", this.update, this);
        scene.events.once("shutdown", this.destroy, this);

        this.cellsSeen = new Set<{ x: number; y: number; occupied: boolean }>();

        // if (this.debug) this.filterDebug = scene.add.graphics();

        scene.time.addEvent({
            delay: 250, callback: () => {
                this.filter.tick(0.12 /* noise rate */);

                const seen = Array.from(this.cellsSeen).map((s) => JSON.parse(s));
                this.filter.applyHardEvidence(seen);
                this.cellsSeen.clear();

                const top3 = this.filter.topCells(3);

                if (!this.filter.maxBelief()) {
                    this.filter.reset(top3);
                }
            }, loop: true
        });

        // Build once when map loads:
        this.flashlight = flashlightStateFromScene({
            lightOrigin: new Phaser.Math.Vector2(x, y),
            lightDirection: this.rotation,
            config: this.config
        });
    }

    setFilter(config: BOFConfig) {

        this.easystar = new easystarjs.js()
        this.easystar.setGrid(this.map);
        this.easystar.setAcceptableTiles([0]);

        this.filter = new BayesianOccupancyFilter(config, this.map);

        // Spawn 5 targets at random positions
        this.filter.spawnTargets(3);
    }

    respawn() {
        let x = Phaser.Math.Between(0, this.map[0].length - 1);
        let y = Phaser.Math.Between(0, this.map.length - 1);

        while (this.map[x][y] === 1) {
            x = Phaser.Math.Between(0, this.map[0].length - 1);
            y = Phaser.Math.Between(0, this.map.length - 1);
        }

        this.x = x * SQUARE_SIZE + SQUARE_SIZE / 2;
        this.y = y * SQUARE_SIZE + SQUARE_SIZE / 2;

        this.health = 100;
        this.path = [];
        this.currentTarget = null;
    }

    update(time: number, deltaTime: number) {
        if (this.health <= 0) {
            console.log("I'm dead. Respawn")
            this.respawn()
            return;
        }

        if (!this.body) return;

        // Stop any previous movement
        this.body.velocity.x = 0;
        this.body.velocity.y = 0;

        if (this.currentTarget) {
            // Check if we have reached the current target (within a fudge factor)
            const { x, y } = this.currentTarget;
            const distance = Phaser.Math.Distance.Between(this.x, this.y, x, y);

            if (distance < 5) {
                this.currentTarget = null;
            }

            // Slow down as we approach final point in the path. This helps prevent issues with the
            // physics body overshooting the goal and leaving the mesh.
            let speed = 400;

            // Still got a valid target?
            if (this.currentTarget) {
                this.moveTowards(this.currentTarget, speed, deltaTime / 1000);
            }
        } else if (this.path.length) {
            const newTagert = this.path.shift();
            this.currentTarget = {
                x: newTagert.x * SQUARE_SIZE + SQUARE_SIZE / 2,
                y: newTagert.y * SQUARE_SIZE + SQUARE_SIZE / 2
            };
        } else {
            const target = this.filter.topCells(1)[0];

            const startX = Math.floor(this.x / SQUARE_SIZE);
            const startY = Math.floor(this.y / SQUARE_SIZE);

            this.easystar.findPath(startX, startY, target.x, target.y, (path: Array<Vector>) => {
                if (path === null) {
                    throw Error("WHAT")
                } else {
                    this.path = path;
                }
            });

            this.easystar.calculate();
        }


        for (let i = 0; i < this.filter.getBelief().length; i++) {
            const row = Math.floor(i / this.map[0].length);
            const col = i % this.map.length;

            const point = new Phaser.Math.Vector2({
                x: col * SQUARE_SIZE + SQUARE_SIZE / 2,
                y: row * SQUARE_SIZE + SQUARE_SIZE / 2,
            });

            if (
                isPointLit(point, this.flashlight, this.scene.occluders).lit
            ) {
                //console.log(x, y, this.filter.getPredicted());
                this.cellsSeen.add(JSON.stringify({ x: col, y: row, occupied: false }));
                //this.filter.setCellBelief(col, row, "min");
            }
        }

        this.scene.robots.forEach(robot => {

            if (this === robot) {
                return;
            }

            const row = Math.floor(robot.x / this.map[0].length);
            const col = Math.floor(robot.y / this.map.length);

            if (
                isPointLit(robot, this.flashlight, this.scene.occluders).lit
            ) {
                this.cellsSeen.add(JSON.stringify({ x: col, y: row, occupied: true }));
                robot.health -= 1;

                if (robot.health === 0) {
                    this.score++;
                }
            }
        });

        // Flash light updates
        this.updateLightDirection();
        this.drawFlashlight();
    }

    destroy() {
        if (this.scene) this.scene.events.off("update", this.update, this);
        super.destroy();
    }

    moveTowards(targetPosition: { x: number, y: number }, maxSpeed = 200, elapsedSeconds: number) {
        const { x, y } = targetPosition;
        const angle = Phaser.Math.Angle.Between(this.x, this.y, x, y);
        const distance = Phaser.Math.Distance.Between(this.x, this.y, x, y);
        const targetSpeed = distance / elapsedSeconds;
        const magnitude = Math.min(maxSpeed, targetSpeed);

        this.scene.physics.velocityFromRotation(
            angle,
            magnitude,
            this.body.velocity,
        );

        this.rotation = angle;
    }

    setCurrentTarget(targetPosition: { x: number, y: number }) {
        this.currentTarget = targetPosition;
    }

    // debugFilter() {
    //     // Update BOF filter
    //     const SQUARE_SIZE = 32;

    //     this.filterDebug.clear();

    //     if (!this.filter) {
    //         return;
    //     }

    //     for (let i = 0; i < this.filter.getBelief().length; i++) {
    //         // for (let i = 0; i < this.filter.getBelief().length; i++) {
    //         const row = Math.floor(i / this.map[0].length);
    //         const col = i % this.map.length;

    //         this.filterDebug.lineStyle(2, 0x000000, 1);
    //         this.filterDebug.fillStyle(0xff0000, this.filter.getBelief()[i]);
    //         this.filterDebug.fillRect(
    //             col * SQUARE_SIZE,
    //             row * SQUARE_SIZE,
    //             SQUARE_SIZE,
    //             SQUARE_SIZE,
    //         );
    //         this.filterDebug.strokeRect(
    //             col * SQUARE_SIZE,
    //             row * SQUARE_SIZE,
    //             SQUARE_SIZE,
    //             SQUARE_SIZE,
    //         );
    //     }

    //     const top3 = this.filter.topCells(3);
    //     top3.forEach((guess) => {
    //         this.filterDebug.lineStyle(2, 0x000000, 1);
    //         this.filterDebug.fillStyle(
    //             0x0000ff,
    //             this.filter.getCellBelief(guess.x, guess.y),
    //         );
    //         this.filterDebug.fillRect(
    //             guess.x * SQUARE_SIZE,
    //             guess.y * SQUARE_SIZE,
    //             SQUARE_SIZE,
    //             SQUARE_SIZE,
    //         );
    //         this.filterDebug.strokeRect(
    //             guess.x * SQUARE_SIZE,
    //             guess.y * SQUARE_SIZE,
    //             SQUARE_SIZE,
    //             SQUARE_SIZE,
    //         );
    //     });
    // }


    private updateLightDirection(): void {

        // this.lightDirection = this.rotation;
        this.flashlight.direction = this.rotation;
        this.flashlight.origin = { x: this.x, y: this.y }

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
        const { x: ox, y: oy } = this.flashlight.origin;
        const halfRad = Phaser.Math.DegToRad(coneHalfAngle);

        // --- cast all rays ---
        const points: Phaser.Math.Vector2[] = [];
        for (let i = 0; i <= numRays; i++) {
            const angle = this.flashlight.direction - halfRad + (i / numRays) * halfRad * 2;
            const hit = this.castRay(ox, oy, angle);
            points.push(new Phaser.Math.Vector2(hit.x, hit.y));
        }

        // --- 1. Full-screen dark overlay ---
        // this.scene.overlayGraphics.clear();
        // this.scene.overlayGraphics.fillStyle(0x000000, shadowAlpha);
        // // this.overlayGraphics.fillRect(0, 0, this.scale.width, this.scale.height);
        // this.scene.overlayGraphics.fillRect(0, 0, 768, 768);

        // --- 2. Erase the cone from the overlay ---
        this.scene.lightGraphics.clear();
        this.scene.lightGraphics.fillStyle(0xffffff, 1);
        this.scene.lightGraphics.beginPath();
        this.scene.lightGraphics.moveTo(ox, oy);
        for (const p of points) {
            this.scene.lightGraphics.lineTo(p.x, p.y);
        }
        this.scene.lightGraphics.closePath();
        this.scene.lightGraphics.fillPath();

        // --- 3. Soft radial falloff (drawn in NORMAL blend on top) ---
        this.drawRadialFalloff(ox, oy, radius, halfRad, points);

        // --- 4. Highlight tiles inside the cone ---
        this.tintLitTiles(ox, oy);
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
        if (wx < 0 || wy < 0 || wx >= this.scene.scale.width || wy >= this.scene.scale.height - 32) {
            return true;
        }

        // getTileAtWorldXY returns null for empty/non-solid tiles
        const tile = this.scene.wallsLayer.getTileAtWorldXY(wx, wy, true);
        return tile !== null && tile.collides;
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
        const falloffGraphics = this.scene.add.graphics();
        falloffGraphics.setDepth(52);

        const steps = 8;
        for (let s = steps; s >= 1; s--) {
            const t = s / steps;
            const alpha = Phaser.Math.Easing.Quadratic.In(t) * 0.55;
            const stepRadius = radius * t;

            falloffGraphics.fillStyle(this.color, alpha);
            falloffGraphics.beginPath();
            falloffGraphics.moveTo(ox, oy);

            for (let i = 0; i <= outerPoints.length - 1; i++) {
                const angle =
                    this.flashlight.direction -
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
        this.scene.time.delayedCall(0, () => falloffGraphics.destroy());
    }

    /**
  * Applies a warm colour tint to tiles whose centres fall inside the
  * flashlight cone.  This gives solid tiles a "lit face" appearance.
  */
    private tintLitTiles(ox: number, oy: number): void {
        const { coneHalfAngle, radius, lightColour } = this.config;
        const halfRad = Phaser.Math.DegToRad(coneHalfAngle);

        this.scene.wallsLayer.forEachTile((tile) => {
            const tx = tile.getCenterX();
            const ty = tile.getCenterY();
            const dist = Phaser.Math.Distance.Between(ox, oy, tx, ty);

            if (dist > radius * 1.15) {
                tile.tint = 0xffffff; // reset tint outside range
                return;
            }

            const angleToTile = Phaser.Math.Angle.Between(ox, oy, tx, ty);
            let diff = Phaser.Math.Angle.Wrap(angleToTile - this.flashlight.direction);
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

export default RobotSprite;