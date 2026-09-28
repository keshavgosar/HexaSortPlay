/**
 * SlotBlock.ts
 * ---------------------------------------------------------
 */
import { _decorator, Component, MeshRenderer, Color, Vec3, Node, Enum, instantiate } from 'cc';
import { BlockColor, COLOR_TABLE, GameConfig } from './GameConfig';
import { meshWorldBounds } from './MeshUtil';

const { ccclass, property } = _decorator;

@ccclass('SlotBlock')
export class SlotBlock extends Component {

    @property
    ringIndex = 0;

    @property
    slotIndex = 0;

    @property
    isEmpty = false;

    @property({ type: Enum(BlockColor) })
    startColor: BlockColor = BlockColor.Blue;

    // How many discs tall this stack is at the start.
    @property
    startHeight = 4;

    /** True while the stack is falling down the channel (ring must not move it). */
    isBusy = false;

    private _color: BlockColor = BlockColor.Blue;
    private _height = 0;
    private _discs: Node[] = [];
    private _template: Node | null = null;
    private _step = 0.2;   // block-local distance between discs
    private _baseY = 0;
    private _tmp = new Vec3();

    get color(): BlockColor { return this._color; }
    get height(): number { return this._height; }

    onLoad() {
        const renderer = this.getComponentInChildren(MeshRenderer);
        if (!renderer || renderer.node === this.node) {
            console.error(`SlotBlock "${this.node.name}": MeshRenderer must be on a CHILD node so discs can be cloned.`);
            return;
        }
        this._template = renderer.node;
        this._baseY = this._template.position.y;
        this._discs.push(this._template);
        this._step = this.measureStep(renderer) * GameConfig.discSpacing;

        this._color = this.startColor;
        this.setHeight(this.startHeight);
        this.setColor(this._color);

        if (this.isEmpty) {
            this.setEmpty(true);
        }
    }

    /** Hex width (world), one disc's height (world) and the world Y of the stack's bottom. */
    measureFootprint(): { width: number, discWorld: number, bottomWorldY: number } {
        const r = this._template?.getComponent(MeshRenderer);
        const b = r ? meshWorldBounds(r) : null;
        const discWorld = this._step * this.node.worldScale.y;
        if (!b) return { width: 0.3, discWorld, bottomWorldY: this.node.worldPosition.y };
        return {
            width: Math.max(b.max.x - b.min.x, b.max.z - b.min.z),
            discWorld,
            bottomWorldY: b.min.y,
        };
    }

    /** Clone this stack (without its generated extra discs) under `parent`. */
    spawnCopy(parent: Node): SlotBlock | null {
        const n = instantiate(this.node);
        for (const c of n.children.slice()) {
            if (c.name === '__disc') { c.removeFromParent(); c.destroy(); }
        }
        const sb = n.getComponent(SlotBlock);
        if (!sb) return null;
        sb.isEmpty = false;
        sb.isBusy = false;
        n.active = true;
        n.setParent(parent);
        return sb;
    }

    /** Thickness of one disc in this block's local Y units, measured from the mesh. */
    private measureStep(renderer: MeshRenderer): number {
        if (GameConfig.discStepOverride > 0) return GameConfig.discStepOverride;

        const st = renderer.mesh?.struct;
        if (!st || !st.minPosition || !st.maxPosition || !this._template) {
            console.warn('SlotBlock: could not measure mesh height, set GameConfig.discStepOverride.');
            return 0.2;
        }
        const mn = st.minPosition, mx = st.maxPosition;
        const wm = this._template.worldMatrix;
        let minY = Infinity, maxY = -Infinity;
        for (const x of [mn.x, mx.x]) for (const y of [mn.y, mx.y]) for (const z of [mn.z, mx.z]) {
            Vec3.transformMat4(this._tmp, new Vec3(x, y, z), wm);
            minY = Math.min(minY, this._tmp.y);
            maxY = Math.max(maxY, this._tmp.y);
        }
        const worldH = maxY - minY;
        const sy = this.node.worldScale.y || 1;
        return worldH / sy;
    }

    setColor(color: BlockColor) {
        this._color = color;
        for (const d of this._discs) this.tint(d);
    }

    private tint(disc: Node) {
        const r = disc.getComponent(MeshRenderer);
        if (r) r.material?.setProperty('mainColor', COLOR_TABLE[this._color] as Color);
    }

    /** Grow or shrink the stack to `n` discs. */
    setHeight(n: number) {
        if (!this._template) return;
        n = Math.max(0, Math.floor(n));
        const p = this._template.position;
        while (this._discs.length < n) {
            const d = instantiate(this._template);
            d.name = '__disc';
            d.setParent(this._template.parent!);
            d.setPosition(p.x, this._baseY + this._discs.length * this._step, p.z);
            this._discs.push(d);
            this.tint(d);
        }
        for (let i = 0; i < this._discs.length; i++) {
            this._discs[i].active = i < n;
        }
        this._height = n;
    }

    setEmpty(empty: boolean) {
        this.isEmpty = empty;
        this.node.active = !empty;
    }

    /** World position where the NEXT disc would go (used as the landing spot for falling stacks). */
    getLandingWorldPos(out: Vec3): Vec3 {
        out.set(this.node.worldPosition);
        out.y += this._height * this._step * this.node.worldScale.y;
        return out;
    }

    /** World position of the middle of the stack (used to decide which ring a touch belongs to). */
    getCenterWorldPos(out: Vec3): Vec3 {
        out.set(this.node.worldPosition);
        out.y += 0.5 * this._height * this._step * this.node.worldScale.y;
        return out;
    }
}