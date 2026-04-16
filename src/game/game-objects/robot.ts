
import { GameObjects, Math as PMath, Tilemaps } from "phaser";
import { BayesianOccupancyFilter, type BOFConfig } from "../utils/BOF";
import easystarjs from "easystarjs";
import type { Vector } from "matter";


class RobotSprite extends GameObjects.Sprite {
    private path;
    private currentTarget;
    private filter;
    private filterDebug;
    private viewSlice;
    private map;
    private easystar;
    private cellsSeen;


    constructor(scene: Phaser.Scene, x: number, y: number, map: number[][]) {
        super(scene, x, y, "robot");

        this.scene = scene;
        this.map = map;

        this.currentTarget = null;
        this.path = [];

        this.setScale(0.5, 0.5)
        // Enable arcade physics for moving with velocity
        scene.physics.world.enable(this);

        scene.add.existing(this);
        scene.events.on("update", this.update, this);
        scene.events.once("shutdown", this.destroy, this);

        this.viewSlice = scene.add.graphics({ x: x, y: y });
        this.viewSlice.lineStyle(5, 0x00ff00, 1);
        this.viewSlice.fillStyle(0x00ff00, 0.5);

        const startAngle = PMath.DegToRad(-45);
        const endAngle = PMath.DegToRad(45);
        const anticlockwise = false;

        this.viewSlice.beginPath();
        this.viewSlice.slice(0, 0, 120, startAngle, endAngle, anticlockwise);
        this.viewSlice.fillPath();

        this.cellsSeen = new Set<{ x: number; y: number; occupied: boolean }>();


        this.filterDebug = scene.add.graphics();

        scene.time.addEvent({
            delay: 250, callback: () => {
                this.filter.tick(0.12 /* noise rate */);

                const seen = Array.from(this.cellsSeen).map((s) => JSON.parse(s));
                this.filter.applyHardEvidence(seen);
                this.cellsSeen.clear();

                const top3 = this.filter.topCells(2);

                if (!this.filter.maxBelief()) {
                    this.filter.reset(top3);
                }
            }, loop: true
        })
    }

    setFilter(config: BOFConfig) {

        this.easystar = new easystarjs.js()
        this.easystar.setGrid(this.map);
        this.easystar.setAcceptableTiles([0]);

        this.filter = new BayesianOccupancyFilter(config, this.map);

        // Spawn 5 targets at random positions
        this.filter.spawnTargets(2);
    }

    update(time: number, deltaTime: number) {
        if (!this.body) return;

        // Stop any previous movement
        this.body.velocity.x = 0;
        this.body.velocity.y = 0;

        //console.log(this.path, this.currentTarget)

        if (this.currentTarget) {
            // Check if we have reached the current target (within a fudge factor)
            const { x, y } = this.currentTarget;
            const distance = PMath.Distance.Between(this.x, this.y, x, y);

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
            this.currentTarget = { x: newTagert.x * 32 + 16, y: newTagert.y * 32 + 16 }
        } else {
            const target = this.filter.topCells(1)[0];

            this.easystar.findPath(Math.floor((this.x) / 32), Math.floor((this.y) / 32), target.x, target.y, (path: Array<Vector>) => {
                if (path === null) {
                    throw Error("WHAT")
                } else {
                    this.path = path;
                }
            });
            this.easystar.calculate();
        }


        const squareSize = 32;
        for (let i = 0; i < this.filter.getBelief().length; i++) {
            const row = Math.floor(i / this.map[0].length);
            const col = i % this.map.length;

            if (
                isPointInCircleSlice(
                    {
                        x: col * squareSize + squareSize / 2,
                        y: row * squareSize + squareSize / 2,
                    },
                    {
                        x: this.viewSlice.x,
                        y: this.viewSlice.y,
                    },
                    120,
                    PMath.RadToDeg(this.viewSlice.rotation) - 45,
                    PMath.RadToDeg(this.viewSlice.rotation) + 45,
                )
            ) {
                //console.log(x, y, this.filter.getPredicted());
                this.cellsSeen.add(JSON.stringify({ x: col, y: row, occupied: false }));
                //this.filter.setCellBelief(col, row, "min");
                this.filterDebug.fillStyle(0x00ffff, this.filter.getBelief()[i]);
                this.filterDebug.fillRect(
                    col * squareSize,
                    row * squareSize,
                    squareSize,
                    squareSize,
                );
                // console.log(this.filter.getBelief()[i]);
            }
        }


        this.debugFilter()

        // this.path.forEach((v) => {
        //     this.filterDebug.fillStyle(0xff00ff, 1.0)
        //     this.filterDebug.fillRect(v.x * 32, v.y * 32, 32, 32);
        // })

    }

    destroy() {
        if (this.scene) this.scene.events.off("update", this.update, this);
        super.destroy();
    }

    moveTowards(targetPosition: { x: number, y: number }, maxSpeed = 200, elapsedSeconds: number) {
        const { x, y } = targetPosition;
        const angle = PMath.Angle.Between(this.x, this.y, x, y);
        const distance = PMath.Distance.Between(this.x, this.y, x, y);
        const targetSpeed = distance / elapsedSeconds;
        const magnitude = Math.min(maxSpeed, targetSpeed);

        this.scene.physics.velocityFromRotation(
            angle,
            magnitude,
            this.body.velocity,
        );

        this.rotation = angle;
        this.viewSlice.x = this.x;
        this.viewSlice.y = this.y;
        this.viewSlice.rotation = this.rotation;
    }

    setCurrentTarget(targetPosition: { x: number, y: number }) {
        this.currentTarget = targetPosition;
    }

    debugFilter() {
        // Update BOF filter
        const squareSize = 32;

        this.filterDebug.clear();

        if (!this.filter) {
            return;
        }

        for (let i = 0; i < this.filter.getBelief().length; i++) {
            // for (let i = 0; i < this.filter.getBelief().length; i++) {
            const row = Math.floor(i / this.map[0].length);
            const col = i % this.map.length;

            this.filterDebug.lineStyle(2, 0x000000, 1);
            this.filterDebug.fillStyle(0xff0000, this.filter.getBelief()[i]);
            this.filterDebug.fillRect(
                col * squareSize,
                row * squareSize,
                squareSize,
                squareSize,
            );
            this.filterDebug.strokeRect(
                col * squareSize,
                row * squareSize,
                squareSize,
                squareSize,
            );
        }

        const top3 = this.filter.topCells(2);
        top3.forEach((guess) => {
            this.filterDebug.lineStyle(2, 0x000000, 1);
            this.filterDebug.fillStyle(
                0x0000ff,
                this.filter.getCellBelief(guess.x, guess.y),
            );
            this.filterDebug.fillRect(
                guess.x * squareSize,
                guess.y * squareSize,
                squareSize,
                squareSize,
            );
            this.filterDebug.strokeRect(
                guess.x * squareSize,
                guess.y * squareSize,
                squareSize,
                squareSize,
            );
        });
    }
}


function isPointInCircleSlice(
    point: PMath.Vector2,
    circleCenter: PMath.Vector2,
    radius: number,
    startAngle: number,
    endAngle: number,
) {
    const { x, y } = point;
    const { x: cx, y: cy } = circleCenter;

    // Calculate the distance from the circle center to the point
    const distance = PMath.Distance.Between(x, y, cx, cy);
    // const distance = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);

    // Check if the point is within the radius of the circle
    if (distance > radius) {
        return false; // Outside the circle
    }

    // Calculate the angle of the point relative to the circle center
    const angle = Math.atan2(y - cy, x - cx) * (180 / Math.PI); // Convert to degrees

    // Normalize the angle to be within [0, 360)
    const normalizedAngle = (angle + 360) % 360;

    // Ensure the start and end angles are within [0, 360)
    const normalizedStart = (startAngle + 360) % 360;
    const normalizedEnd = (endAngle + 360) % 360;

    // Check if the angle is within the slice
    if (normalizedStart < normalizedEnd) {
        return (
            normalizedAngle >= normalizedStart && normalizedAngle <= normalizedEnd
        );
    } else {
        // Handle the case where the slice crosses the 0 degrees line
        return (
            normalizedAngle >= normalizedStart || normalizedAngle <= normalizedEnd
        );
    }
}


export default RobotSprite;