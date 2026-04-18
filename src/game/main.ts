// import { PhaserNavMeshPlugin } from "phaser-navmesh";

import { Boot } from "./scenes/Boot.ts";
import { MainGame } from "./scenes/MainGame.ts";
import { MainMenu } from "./scenes/MainMenu.ts";
import { AUTO, Game } from "phaser";
import { Preloader } from "./scenes/Preloader.ts";



//  Find out more information about the Game Config at:
//  https://docs.phaser.io/api-documentation/typedef/types-core#gameconfig
const config: Phaser.Types.Core.GameConfig = {
    type: AUTO,
    width: 768,
    height: 768,
    parent: "game-container",
    backgroundColor: "#028af8",
    scene: [Boot, Preloader, MainMenu, MainGame],
    render: {
        pixelArt: true
    },
    physics: {
        default: "arcade",
        arcade: {
            gravity: { x: 0, y: 0 },
        },

        //   plugins: {
        //     scene: [
        //       {
        //         key: "NavMeshPlugin",
        //         plugin: PhaserNavMeshPlugin,
        //         mapping: "navMeshPlugin",
        //         start: true,
        //       },
        //     ],
        //   },
        //   physics: {
        //     default: "arcade",
        //     arcade: {
        //       gravity: 0,
        //     },
        //   },
    },

};

const StartGame = (parent: string) => {
    return new Game({ ...config, parent });
};

export default StartGame;
