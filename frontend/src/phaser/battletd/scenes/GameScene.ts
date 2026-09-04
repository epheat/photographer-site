import Phaser from 'phaser'
import miniTerrainTileset from "@/phaser/battletd/assets/tiles/miniworld/terrain.png";
import miniBuildingsTileset from "@/phaser/battletd/assets/tiles/miniworld/buildings.png";
import miniNatureTileset from "@/phaser/battletd/assets/tiles/miniworld/nature.png";
import tower from "@/phaser/battletd/assets/tiles/miniworld/tower.png";
import plot from "@/phaser/battletd/assets/tiles/miniworld/plot.png";
import orc1 from "@/phaser/battletd/assets/tiles/miniworld/enemies/orc1.png";
import orc2 from "@/phaser/battletd/assets/tiles/miniworld/enemies/orc2.png";
import orc3 from "@/phaser/battletd/assets/tiles/miniworld/enemies/orc3.png";
import orc4 from "@/phaser/battletd/assets/tiles/miniworld/enemies/orc4.png";
import bomb from "@/phaser/battletd/assets/bomb.png";
import pellet from "@/phaser/battletd/assets/tiles/miniworld/projectiles/pellet.png";
import pellet2 from "@/phaser/battletd/assets/tiles/miniworld/projectiles/pellet2.png";
import bullet from "@/phaser/battletd/assets/tiles/miniworld/projectiles/bullet.png";
import bullet2 from "@/phaser/battletd/assets/tiles/miniworld/projectiles/bullet2.png";
import fire from "@/phaser/battletd/assets/tiles/fire_fx_v1.0/png/orange/loops/burning_loop_5.png";
import blueFire from "@/phaser/battletd/assets/tiles/fire_fx_v1.0/png/blue/loops/burning_loop_2.png";
import range from "@/phaser/battletd/assets/range.png";
import star from "@/phaser/battletd/assets/star.png";
import map1 from "@/phaser/battletd/tiled/map1.json";
import map2 from "@/phaser/battletd/tiled/map2.json";
import map3 from "@/phaser/battletd/tiled/map3.json";
import ComponentSystem from "@/phaser/battletd/system/ComponentSystem";
import { TowerPlot } from "@/phaser/battletd/gameobjects/TowerPlot";
import { Monster } from "@/phaser/battletd/gameobjects/Monster";
import { eventBus, events } from "@/phaser/battletd/events/EventBus";
import { WavePhase } from "@/phaser/battletd/model/GameState";
import { BattleTDGame } from "@/phaser/battletd/BattleTD";
import { getTowerCard, TowerCard } from "@/phaser/battletd/model/Cards";
import { EnemyType } from "@/phaser/battletd/model/Enemies";
import {BattleTDGameSimulator} from "@/phaser/battletd/model/GameSimulator";

export default class GameScene extends Phaser.Scene {

    private components!: ComponentSystem;
    public monsters!: Phaser.Physics.Arcade.Group;
    public monsterSprites!: Phaser.Physics.Arcade.Group;
    public towers!: Phaser.GameObjects.Group;
    public plots!: Phaser.GameObjects.Group;

    private monsterPath!: Phaser.Curves.Path;
    private monsterPathStart!: Phaser.Types.Tilemaps.TiledObject;

    public gameSimulator!: BattleTDGameSimulator;

    constructor() {
        super('game-scene')
    }

    preload() {
        this.load.image('bomb', bomb);
        this.load.image('bullet', bullet);
        this.load.image('bullet2', bullet2);
        this.load.image('pellet', pellet);
        this.load.image('pellet2', pellet2);
        this.load.spritesheet('fire', fire, { frameWidth: 8, frameHeight: 8 });
        this.load.spritesheet('blueFire', blueFire, { frameWidth: 20, frameHeight: 24 });
        this.load.image('star', star);
        this.load.image('plot', plot);
        this.load.image('tower', tower);
        this.load.spritesheet('Orc1', orc1, { frameWidth: 16, frameHeight: 16 });
        this.load.spritesheet('Orc2', orc2, { frameWidth: 16, frameHeight: 16 });
        this.load.spritesheet('Orc3', orc3, { frameWidth: 16, frameHeight: 16 });
        this.load.spritesheet('Orc4', orc4, { frameWidth: 16, frameHeight: 16 });
        this.load.image('range_indicator', range)
        this.load.image('terrain', miniTerrainTileset);
        this.load.image('nature', miniNatureTileset);
        this.load.image('buildings', miniBuildingsTileset);
        this.load.spritesheet('buildings_sprites', miniBuildingsTileset, { frameWidth: 16, frameHeight: 16 });
        this.load.tilemapTiledJSON('map1', map1);
        this.load.tilemapTiledJSON('map2', map2);
        this.load.tilemapTiledJSON('map3', map3);

        this.components = new ComponentSystem();
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            this.components.destroy();
        });
    }

    create() {
        this.createAnimations();
        this.monsters = this.physics.add.group({ runChildUpdate: true });
        this.towers = this.add.group({ runChildUpdate: true });
        this.plots = this.add.group({ runChildUpdate: false });
        this.createMap3();

        this.gameSimulator = (this.game as BattleTDGame).gameSimulator;

        eventBus.on(events.newWave, this.spawnWave, this);
        eventBus.on(events.monsterReachedPathEnd, this.takeCastleDamage, this);
        eventBus.on(events.selectCard, this.selectCard, this);
        eventBus.on(events.buyCard, this.buyCard, this);
        eventBus.on(events.placeTower, this.placeTower, this);
    }

    createAnimations(): void {
        this.anims.create({
            key: 'fireAnim',
            frames: this.anims.generateFrameNumbers('fire', {}),
            frameRate: 10,
            repeat: -1,
        });
        this.anims.create({
            key: 'blueFireAnim',
            frames: this.anims.generateFrameNumbers('blueFire', {}),
            frameRate: 10,
            repeat: -1,
        });
        [EnemyType.Orc1, EnemyType.Orc2, EnemyType.Orc3, EnemyType.Orc4].forEach(enemyType => {
            this.anims.create({
                key: `${enemyType}WalkD`,
                frames: this.anims.generateFrameNumbers(enemyType, { start: 1, end: 4 }),
                frameRate: 8,
                repeat: -1,
            });
            this.anims.create({
                key: `${enemyType}WalkU`,
                frames: this.anims.generateFrameNumbers(enemyType, { start: 6, end: 9 }),
                frameRate: 8,
                repeat: -1,
            });
            this.anims.create({
                key: `${enemyType}WalkR`,
                frames: this.anims.generateFrameNumbers(enemyType, { start: 11, end: 14 }),
                frameRate: 8,
                repeat: -1,
            });
            this.anims.create({
                key: `${enemyType}WalkL`,
                frames: this.anims.generateFrameNumbers(enemyType, { start: 16, end: 19 }),
                frameRate: 8,
                repeat: -1,
            });
        })
    }

    update(time: number, delta: number) {
        this.components.update(delta);

        this.gameSimulator.update(time, delta);

        if (this.gameSimulator.gameState.waveState.phase == WavePhase.PreBattlePhase && this.monsters.children.size == 0) {
            this.spawnWave(this.gameSimulator.gameState.waveState.enemyType, this.gameSimulator.gameState.waveState.enemyCount);
        }
        if (this.gameSimulator.gameState.waveState.phase == WavePhase.BattlePhase && this.monsters.children.size == 0) {
            this.gameSimulator.gameState.waveState.complete = true;
            // TODO: calculate interest
            this.gameSimulator.gameState.playerState.gold++;
        }
    }

    private createMap3() {
        const map = this.make.tilemap({ key: 'map3', tileWidth: 16, tileHeight: 16 });
        const terrainTileset = map.addTilesetImage('terrain', 'terrain');
        const buildingsTileset = map.addTilesetImage('buildings', 'buildings');
        const natureTileset = map.addTilesetImage('nature', 'nature');
        const baseLayer = map.createLayer('Base', terrainTileset!, 0, 0);
        const coastLayer = map.createLayer('Coast', terrainTileset!, 0, 0);
        const grassLayer = map.createLayer('Grass', terrainTileset!, 0, 0);
        const mountainLayer = map.createLayer('Mountain', terrainTileset!, 0, 0);
        const mountainTopLayer = map.createLayer('MountainTop', terrainTileset!, 0, 0);
        const natureLayer = map.createLayer('Nature', natureTileset!, 0, 0);
        const pathLayer = map.createLayer('Path', terrainTileset!, 0, 0);
        const castleLayer = map.createLayer('Castle', buildingsTileset!, 0, 0);
        const monsterPathLayer = map.getObjectLayer('MonsterPath');
        this.monsterPathStart = monsterPathLayer?.objects[0]!;
        this.monsterPath = new Phaser.Curves.Path(this.monsterPathStart!.x, this.monsterPathStart!.y);
        for (let i = 1; i < monsterPathLayer?.objects.length!; i++) {
            this.monsterPath.lineTo(monsterPathLayer?.objects[i].x!, monsterPathLayer?.objects[i].y!);
        }

        // https://newdocs.phaser.io/docs/3.60.0/focus/Phaser.Tilemaps.Tilemap-createFromObjects
        this.plots.addMultiple(map.createFromObjects('Towers', { classType: TowerPlot, key: 'plot' }));
    }

    private spawnWave(enemyType: EnemyType, waveSize: number) {
        for (let i=0; i<waveSize; i++) {
            const monster = new Monster(this, this.monsterPath, this.monsterPathStart!.x!, this.monsterPathStart!.y!, {
                enemyType: enemyType,
            });
            this.monsters.add(monster);
            setTimeout(() => {
                monster.startFollow();
            }, 1000 * i + BattleTDGameSimulator.PRE_BATTLE_PHASE_TIME_MILLIS)
        }
    }

    private takeCastleDamage(monster: Monster): void {
        this.gameSimulator.gameState.playerState.castle.hp -= monster.castleDmg;
    }

    private selectCard(selectedIndex: number): void {
        this.gameSimulator.gameState.playerState.selectedCard = selectedIndex;
        this.plots.children.each(tower => {
            (tower as TowerPlot).setHighlightVisible(selectedIndex != undefined);
            return true;
        });
    }

    private buyCard(shopIndex: number): void {
        const card: TowerCard = getTowerCard(this.gameSimulator.gameState.shopState.offerings[shopIndex])!;
        this.gameSimulator.gameState.playerState.gold -= card.cost;
        this.gameSimulator.gameState.shopState.offerings.splice(shopIndex, 1);
        this.gameSimulator.gameState.playerState.bench.push(card.towerId);
    }

    private placeTower(plot: TowerPlot): void {
        if (this.gameSimulator.gameState.playerState.selectedCard == undefined) {
            console.log("No tower selected.");
            return;
        }
        this.gameSimulator.gameState.playerState.bench.splice(this.gameSimulator.gameState.playerState.selectedCard, 1);
        this.gameSimulator.gameState.playerState.selectedCard = undefined;

        this.plots.children.each(tower => {
            (tower as TowerPlot).setHighlightVisible(false);
            return true;
        });
    }
}