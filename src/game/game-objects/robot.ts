
import { GameObjects, Math as PMath, Tilemaps } from "phaser";
import { BayesianOccupancyFilter } from "../utils/BOF";


class RobotSprite extends GameObjects.Sprite {
    private currentTarget;
    private filter;
    private filterDebug;
    private viewSlice;

    constructor(scene: Phaser.Scene, x: number, y: number, mapLayer: Tilemaps.TilemapLayer | Tilemaps.TilemapGPULayer) {
        super(scene, x, y, "robot");

        this.scene = scene;
        this.currentTarget = null;

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


        this.filter = new BayesianOccupancyFilter({
            width: 10,
            height: 9,
            pStay: 0.2,
            pDetect: 0.88,
            pFalseAlarm: 0.07,
            priorOccupancy: 0.1,
            beliefMin: 0.01,
            beliefMax: 0.99,
        }, mapLayer);

        // Spawn 5 targets at random positions
        this.filter.spawnTargets(2);

        this.filterDebug = scene.add.graphics();

        scene.time.addEvent({
            delay: 500, callback: () => {
                this.filter.tick(0.12 /* noise rate */);
            }, loop: true
        })
    }

    update(time: number, deltaTime: number) {
        if (!this.body) return;

        // Stop any previous movement
        this.body.velocity.x = 0;
        this.body.velocity.y = 0;

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
        }

        // Update BOF filter
        const squareSize = 32;

        this.filterDebug.clear();

        for (let i = 0; i < this.filter.getBelief().length; i++) {
            // for (let i = 0; i < this.filter.getBelief().length; i++) {
            const row = Math.floor(i / 10);
            const col = i % 10;

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
    const distance = Phaser.Math.Distance.Between(x, y, cx, cy);
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