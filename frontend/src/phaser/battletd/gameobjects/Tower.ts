import { Monster } from "@/phaser/battletd/gameobjects/Monster";
import GameScene from "@/phaser/battletd/scenes/GameScene";
import {
  projectileSpriteInfos,
  TowerDefinition,
  towerDefinitions,
  TowerId,
  towerSpriteInfos
} from "@/phaser/battletd/model/Towers";
import { SpriteInfo } from "@/phaser/battletd/model/Common";
import FilterMode = Phaser.Textures.FilterMode;
import ArcadePhysicsCallback = Phaser.Types.Physics.Arcade.ArcadePhysicsCallback;

export interface TowerOptions {
  readonly towerId: TowerId,
}

export interface TowerProps extends TowerOptions {

}

export class Tower extends Phaser.GameObjects.Container {
  private readonly rangeIndicator: Phaser.GameObjects.Image;
  private readonly towerSprite: Phaser.GameObjects.Sprite;
  private readonly reloadIndicator: Phaser.GameObjects.Rectangle;
  private readonly towerId: TowerId;
  private readonly towerDefinition: TowerDefinition;
  private readonly projectiles: Phaser.Physics.Arcade.Group;
  private reloading: boolean = false;

  constructor(scene: Phaser.Scene, x: number, y: number, props: TowerProps) {
    super(scene, x, y);
    this.towerId = props.towerId;
    this.towerDefinition = towerDefinitions[this.towerId];
    this.rangeIndicator = this.createRangeIndicator();
    this.towerSprite = this.createTowerSprite();
    this.reloadIndicator = this.createReloadIndicator();
    this.add([this.rangeIndicator, this.towerSprite, this.reloadIndicator]);

    this.scene.add.existing(this);
    this.projectiles = this.scene.physics.add.group();
    this.scene.physics.add.overlap(this.projectiles, (this.scene as GameScene).monsters, this.hitMonster.bind(this));
  }

  protected createRangeIndicator(): Phaser.GameObjects.Image {
    const indicator = this.scene.add.image(0, 0, 'range_indicator');
    indicator.setVisible(false);
    return indicator;
  }

  protected createTowerSprite(): Phaser.GameObjects.Sprite {
    const spriteInfo: SpriteInfo = towerSpriteInfos[this.towerId];
    const sprite = this.scene.add.sprite(0, 0, spriteInfo.texture, spriteInfo.frame);
    sprite.texture.setFilter(FilterMode.NEAREST);
    return sprite;
  }

  protected createReloadIndicator(): Phaser.GameObjects.Rectangle {
    return this.scene.add.rectangle(0, this.towerSprite.displayHeight, this.towerSprite.displayWidth, 5, 0xffffff)
      .setVisible(false);
  }

  // should be called every frame. To do this, add towers to a group with runChildUpdate=true
  // https://newdocs.phaser.io/docs/3.60.0/Phaser.GameObjects.Group#runChildUpdate
  update() {
    const monsterToAttack = this.getFurthestInPath((this.scene as GameScene).monsters);
    if (monsterToAttack) {
      this.fireAt(monsterToAttack);
    }
  }

  protected getNearest(monsters: Phaser.GameObjects.Group): Monster | undefined {
    const monsterUnits = monsters.getChildren() as Monster[];
    const monsterDistances = monsterUnits
      .map(monster => { return { monster: monster, distance: Phaser.Math.Distance.Between(this.x, this.y, monster.x, monster.y) }})
      .filter(mon => mon.distance < this.towerDefinition.range);
    if (monsterDistances.length == 0) {
      return;
    } else {
      return monsterDistances.reduce((curr, prev) => curr.distance > prev.distance ? curr : prev).monster;
    }
  }

  protected getFurthestInPath(monsters: Phaser.GameObjects.Group): Monster | undefined {
    const monsterUnits = monsters.getChildren() as Monster[];
    const monstersInRange = monsterUnits.filter(monster => Phaser.Math.Distance.Between(this.x, this.y, monster.x, monster.y) < this.towerDefinition.range);
    if (monstersInRange.length == 0) {
      return;
    }
    return monstersInRange.reduce((curr, prev) => curr.pathProgress > prev.pathProgress ? curr : prev);
  }

  protected reload() {
    if (this.reloading) {
      return;
    }
    this.reloading = true;
    this.reloadIndicator.setVisible(true);
    this.reloadIndicator.setScale(1);

    this.scene.tweens.add({
      targets: this.reloadIndicator,
      duration: this.towerDefinition.reloadTime,
      scaleX: 0.0,
      onComplete: () => {
        this.reloadIndicator.setVisible(false);
        this.reloading = false;
      }
    });
  }

  protected fireAt(monster: Monster) {
    if (this.reloading) {
      return;
    }

    const projectile = this.createProjectile();
    const angle = this.getLeadingAngleToFire(monster);
    this.scene.physics.velocityFromRotation(angle, this.towerDefinition.projectile.speed, projectile.body.velocity);
    if (this.towerDefinition.projectile.drag) {
      projectile.body.setDamping(true).setDrag(this.towerDefinition.projectile.drag);
    }
    this.reload();
  }

  protected createProjectile(): Phaser.Types.Physics.Arcade.ImageWithDynamicBody {
    const projectileDef = this.towerDefinition.projectile;
    const spriteInfo: SpriteInfo = projectileSpriteInfos[projectileDef.type];
    const projectile = this.scene.physics.add.sprite(this.x, this.y, spriteInfo.texture, spriteInfo.frame);
    projectile.texture.setFilter(FilterMode.NEAREST);
    if (spriteInfo.animationKey) {
      projectile.anims.play(spriteInfo.animationKey);
    }
    const projectileSize = projectileDef.size;
    // offset the hitbox, since the body is positioned from the top-left of the gameobject.
    // see: https://phaser.discourse.group/t/circular-collider-using-setcircle-is-not-centred-properly/8263/2
    projectile.setCircle(projectileSize, projectile.body.halfWidth - projectileSize, projectile.body.halfHeight - projectileSize);

    const lifespan = projectileDef.lifespan;
    if (lifespan) {
      // after {lifespan}ms, fade and destroy
      this.scene.tweens.add({
        targets: projectile,
        delay: lifespan,
        duration: 200,
        alpha: 0.0,
        onComplete: () => {
          projectile.destroy();
        }
      })
    }
    const growth = projectileDef.growth;
    if (growth) {
      // over {lifespan}ms, grow to {growth} scale
      this.scene.tweens.add({
        targets: projectile,
        duration: lifespan ?? 2000,
        scale: growth,
      });
    }
    this.projectiles.add(projectile);
    return projectile;
  }

  // inspiration from https://www.reddit.com/r/gamedev/comments/3hgxs7/projectile_interception_how_ai_lead_their_shots/cu7lg92/
  protected getLeadingAngleToFire(monster: Monster): number {
    // in case the tower can't actually hit the monster based on its current path/speed and the projectile speed, we'll
    // fire directly toward the monster's current location.
    const directAngle = this.getDirectFireVector(monster).angle();

    const projectileSpeed = this.towerDefinition.projectile.speed;
    const deltaX = monster.x - this.x;
    const deltaY = monster.y - this.y;
    const a = monster.velocity.x * monster.velocity.x + monster.velocity.y * monster.velocity.y - projectileSpeed * projectileSpeed;
    const b = 2 * deltaX * monster.velocity.x + 2 * deltaY * monster.velocity.y;
    const c = deltaX * deltaX + deltaY * deltaY;

    const t_plus = (-b + Math.sqrt(b * b - 4*a*c)) / 2 / a;
    const t_minus = (-b - Math.sqrt(b * b - 4*a*c)) / 2 / a;

    if (t_plus > 0) {
      return new Phaser.Math.Vector2(monster.x, monster.y).add(monster.velocity.clone().scale(t_plus).subtract(new Phaser.Math.Vector2(this.x, this.y))).angle();
    } else if (t_minus > 0) {
      return new Phaser.Math.Vector2(monster.x, monster.y).add(monster.velocity.clone().scale(t_minus).subtract(new Phaser.Math.Vector2(this.x, this.y))).angle();
    } else {
      return directAngle;
    }
  }

  protected getDirectFireVector(monster: Monster): Phaser.Math.Vector2 {
    const angle = Phaser.Math.RadToDeg(Phaser.Math.Angle.Between(this.x, this.y, monster.x, monster.y));
    return this.scene.physics.velocityFromAngle(angle, this.towerDefinition.projectile.speed);
  }

  protected hitMonster: ArcadePhysicsCallback = (projectile, monster): void => {
    projectile.destroy();
    // TODO: apply modifiers based on projectile damage type and monster resistances / weaknesses
    (monster as Monster).takeDamage(this.towerDefinition.projectile.impactDamage);
  }
}
