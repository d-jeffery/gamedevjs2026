import { Scene } from "phaser";
import RobotSprite from "../game-objects/robot";
import type { Vector } from "matter";

export class MainGame extends Scene {
  // raycasterPlugin: PhaserRaycaster;
  // raycaster: Raycaster;
  // ray: Raycaster.Ray;
  private camera;
  public robots;

  constructor() {
    super("Game");
  }

  preload() {
    this.load.image("tiles", "src/assets/tilemaps/tiles.png");
  }

  create() {
    this.camera = this.cameras.main;
    this.camera.setBackgroundColor(0xffffff);

    const map = [
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0],
      [0, 0, 1, 1, 1, 0, 0, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 0, 0, 1, 1, 1, 0, 0],
      [0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0],
      [0, 0, 1, 1, 1, 0, 0, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 0, 0, 1, 1, 1, 0, 0],
      [0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0],
      [0, 0, 1, 1, 1, 0, 0, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 0, 0, 1, 1, 1, 0, 0],
      [0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0],
      [0, 0, 1, 1, 1, 0, 0, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 0, 0, 1, 1, 1, 0, 0],
      [0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    ];
    const tilemap = this.make.tilemap({ data: map, key: 'map', tileHeight: 16, tileWidth: 16 });
    const tileset = tilemap.addTilesetImage("tiles", "tiles");

    if (!tileset) {
      throw new Error("Failed to create tileset.");
    }

    const wallsLayer = tilemap.createLayer(0, tileset, 0, 0);
    wallsLayer.setScale(2);
    wallsLayer.setCollision([1]);

    // this.raycaster = this.raycasterPlugin.createRaycaster({});

    // this.ray = this.raycaster.createRay();
    const robot1 = new RobotSprite(this, 50, 200, map);
    const robot2 = new RobotSprite(this, 200, 50, map);
    const robot3 = new RobotSprite(this, 700, 200, map);
    const robot4 = new RobotSprite(this, 200, 700, map);

    this.robots = [robot1, robot2, robot3, robot4];
    // robot1.setFilter({
    //   width: map[0].length,
    //   height: map.length,
    //   pStay: 0.2,
    //   pDetect: 0.88,
    //   pFalseAlarm: 0.07,
    //   priorOccupancy: 0.1,
    //   beliefMin: 0.01,
    //   beliefMax: 0.99,
    // });

    const basicFilter = {
      width: map[0].length,
      height: map.length,
      pStay: 0.2,
      pDetect: 0.88,
      pFalseAlarm: 0.07,
      priorOccupancy: 0.1,
      beliefMin: 0.0,
      beliefMax: 1.0,
    };

    robot1.setFilter(basicFilter);
    robot2.setFilter(basicFilter);
    robot3.setFilter(basicFilter);
    robot4.setFilter(basicFilter);


    // this.physics.add.collider(robot1, wallsLayer);
    // this.physics.add.collider(robot2, wallsLayer);
    // this.physics.add.collider(robot3, wallsLayer);
    // this.physics.add.collider(robot4, wallsLayer);


    // this.input.on("pointerdown", (pointer: Vector) => {
    //   robot1.setCurrentTarget({ x: pointer.x, y: pointer.y });
    // });
  }
}
