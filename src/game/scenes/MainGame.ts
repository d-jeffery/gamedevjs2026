import * as Phaser from "phaser";
import RobotSprite from "../game-objects/robot";
import { type SolidRect, buildOccludersFromLayer } from "../utils/FlashlightState";

const GRID_CELL = 32;
const WIDTH = 768;
const HEIGHT = 768;

export class MainGame extends Phaser.Scene {
  // raycasterPlugin: PhaserRaycaster;
  // raycaster: Raycaster;
  // ray: Raycaster.Ray;
  private scoreOne;
  private scoreTwo;
  private scoreThree;
  private scoreFour;

  // Controlls
  private speed;
  private filterSpeed;
  private debugMode;

  private debug;

  private camera;
  public robots;


  public occluders!: SolidRect[];

  //private groundLayer!: Phaser.Tilemaps.TilemapLayer;
  private wallsLayer!: Phaser.Tilemaps.TilemapLayer;

  private lightGraphics!: Phaser.GameObjects.Graphics;
  private overlayGraphics!: Phaser.GameObjects.Graphics;

  constructor() {
    super("Game");
  }

  preload() {
    this.load.image("tiles", "assets/tilemaps/tiles.png");
  }

  create() {
    this.camera = this.cameras.main;
    this.camera.setBackgroundColor(0x000000);

    this.debug = false;

    const grid = this.add.grid(0, 0, WIDTH, HEIGHT, GRID_CELL / 2, GRID_CELL / 2, 0xffffff, 1, 0x000000, 0.5);
    grid.setScale(2);

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
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
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

    this.wallsLayer = tilemap.createLayer(0, tileset, 0, 0);
    this.wallsLayer.setDepth(0);
    this.wallsLayer.setScale(2);
    this.wallsLayer.setCollision([1]);


    // Build once when map loads:
    this.occluders = buildOccludersFromLayer(this.wallsLayer);

    // FlashLights
    this.setupGraphicsLayers()

    this.events.on("update", this.update, this);

    const robot1 = new RobotSprite(this, GRID_CELL / 2, GRID_CELL / 2, 0xffff00, map);
    const robot2 = new RobotSprite(this, GRID_CELL / 2, HEIGHT - GRID_CELL / 2, 0xff0000, map);
    const robot3 = new RobotSprite(this, WIDTH - GRID_CELL / 2, GRID_CELL / 2, 0x00ff00, map);
    const robot4 = new RobotSprite(this, WIDTH - GRID_CELL / 2, HEIGHT - GRID_CELL / 2, 0x0000ff, map);

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
    // this.score = this.add.text(0, 768, "Loading...", { color: 0xffffff, fontFamily: "Roboto", fontSize: 24, align: "center", fixedWidth: 768 })


    this.scoreOne = this.add.text(32, 780, "Loading...", { color: "rgb(255,255,0)", fontFamily: "Arial Black", fontSize: 24, align: "center" });
    this.scoreTwo = this.add.text(224, 780, "Loading...", { color: "rgb(255,0,0)", fontFamily: "Arial Black", fontSize: 24, align: "center" });
    this.scoreThree = this.add.text(416, 780, "Loading...", { color: "rgb(0,255,0)", fontFamily: "Arial Black", fontSize: 24, align: "center" });
    this.scoreFour = this.add.text(608, 780, "Loading...", { color: "rgb(0,0,255)", fontFamily: "Arial Black", fontSize: 24, align: "center" });


    this.speed = this.add.dom(150, 832).createFromHTML(`
      <label for="speed" style="color: white; font-size: 24px;"/> Speed </label>
      <input type="range" name="speed" min="100" max="500" value="250" style="width: 100px;">
    `);

    this.speed.getChildByName('speed').addEventListener('input', (event) => {
      this.robots.forEach((robot: RobotSprite) => {
        robot.setSpeed(event.target.value);
      });
    });

    this.filterSpeed = this.add.dom(400, 832).createFromHTML(`
      <label for="filterSpeed" style="color: white; font-size: 24px;"/> Sample Speed </label>
      <input type="range" name="filterSpeed" min="100" max="500" value="250" style="width: 100px;">
    `);

    this.filterSpeed.getChildByName('filterSpeed').addEventListener('input', (event) => {
      this.robots.forEach((robot: RobotSprite) => {
        robot.setFilterSpeed(600 - event.target.value);
      });
    });

    this.debugMode = this.add.dom(650, 832).createFromHTML(`
      <label for="debug" style="color: white; font-size: 24px;"/> Debug Mode </label>
      <input type="checkbox" name="debug" value="no">
      `);

    this.debugMode.getChildByName('debug').addEventListener('input', (event) => {
      this.debug = event.target.checked;
    });
  }

  update(time: number, delta: number): void {
    if (this.debug) {
      this.overlayGraphics.clear();
      this.robots.forEach((robot: RobotSprite) => {
        robot.drawDebug();
      });

      return;
    }

    this.overlayGraphics.clear();
    this.overlayGraphics.fillStyle(0x000000, 0.92);
    // this.overlayGraphics.fillRect(0, 0, this.scale.width, this.scale.height);
    this.overlayGraphics.fillRect(0, 0, this.wallsLayer.width * this.wallsLayer.scaleX, this.wallsLayer.height * this.wallsLayer.scaleY);

    this.doScore()
  }

  private doScore(): void {

    this.scoreOne.setText("Robot " + 1 + ": " + this.robots[0].score);
    this.scoreTwo.setText("Robot " + 2 + ": " + this.robots[1].score);
    this.scoreThree.setText("Robot " + 3 + ": " + this.robots[2].score);
    this.scoreFour.setText("Robot " + 4 + ": " + this.robots[3].score);

    // const score = this.robots.map((robot, index) => {
    //   return ("Robot " + (index + 1) + ": " + robot.score);
    // });
    //this.score.setText([robot1].join(" | "))
  }

  private setupGraphicsLayers(): void {
    // overlayGraphics: the full-screen dark mask
    this.overlayGraphics = this.add.graphics();
    this.overlayGraphics.setDepth(50);

    // lightGraphics: the illuminated cone polygon punched through the overlay
    this.lightGraphics = this.add.graphics();
    this.lightGraphics.setDepth(51);
    this.lightGraphics.setBlendMode(Phaser.BlendModes.ERASE);
  }
}
