import Phaser from 'phaser'
import GameScene from './scenes/GameScene'

function launch(containerId: string) {
    const config = {
        type: Phaser.AUTO,
        width: 320,
        height: 480,
        parent: containerId,
        physics: {
            default: 'arcade',
        },
        scene: [GameScene]
    }
    return new Phaser.Game(config);
}

export { launch }