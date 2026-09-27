/**
 * SlotBlock.ts
 */
import { _decorator, Component, MeshRenderer, Material, Color, tween, Tween, Vec3, Enum } from 'cc';
import { BlockColor, COLOR_TABLE } from './GameConfig';



const { ccclass, property } = _decorator;

@ccclass('SlotBlock')
export class SlotBlock extends Component {

    @property
    ringIndex = 0;

    @property
    slotIndex = 0;

    @property
    isEmpty = false;

    // Pick this block's starting color right in the Inspector,
    // exactly like a Unity enum dropdown field.
    @property({ type: Enum(BlockColor) })
    startColor: BlockColor = BlockColor.Blue;

    private _color: BlockColor = BlockColor.Blue;
    private _mat: Material | null = null;

    private static _all: SlotBlock[] = [];
    static getAll(): SlotBlock[] { return SlotBlock._all; }

    get color(): BlockColor {
        return this._color;
    }

    onLoad() {
        // Search children too, since the FBX mesh usually isn't on
        // the same node as this script.
        SlotBlock._all.push(this);
        const renderer = this.getComponentInChildren(MeshRenderer);
        if (renderer) {
            this._mat = renderer.material;
        } else {
            console.warn(`SlotBlock on "${this.node.name}" found no MeshRenderer in itself or its children.`);
        }

        if (this.isEmpty) {
            this.setEmpty(true);
        } else {
            this.setColor(this.startColor);
        }
    }

    setColor(color: BlockColor) {
        this._color = color;
        if (this._mat) {
            this._mat.setProperty('mainColor', COLOR_TABLE[color] as Color);
        }
    }

    setEmpty(empty: boolean) {
        this.isEmpty = empty;
        this.node.active = !empty;
    }

    playHintPulse() {
        Tween.stopAllByTarget(this.node); // don't stack scale tweens on rapid re-taps
        const originalScale = this.node.scale.clone();
        tween(this.node)
            .to(0.25, { scale: new Vec3(originalScale.x * 1.15, originalScale.y * 1.15, originalScale.z * 1.15) })
            .to(0.25, { scale: originalScale })
            .union()
            .repeat(2)
            .start();
    }

    playMatchPulse(onDone?: () => void) {
        Tween.stopAllByTarget(this.node);
        tween(this.node)
            .to(0.15, { scale: new Vec3(1.3, 1.3, 1.3) })
            .to(0.15, { scale: new Vec3(0, 0, 0) })
            .call(() => onDone && onDone())
            .start();
    }

    onDestroy() {
        const idx = SlotBlock._all.indexOf(this);
        if (idx >= 0) SlotBlock._all.splice(idx, 1);
    }
}