/**
 * RingController.ts
 */
import { _decorator, Component, Node, Vec3, tween, Tween, MeshRenderer } from 'cc';
import { SlotBlock } from './SlotBlock';
import { GameConfig } from './GameConfig';
import { meshWorldBounds } from './MeshUtil';

const { ccclass, property } = _decorator;

const RAD = Math.PI / 180;

/** Wrap an angle in degrees to (-180, 180]. */
export function wrap180(a: number): number {
    return ((a + 180) % 360 + 360) % 360 - 180;
}

export interface RingBuildOpts {
    axisWorld: Vec3;
    slots: number;
    headroomWorld: number;
    fixedHeight: number;
    skipHeight: SlotBlock | null;
}

export interface PlateInfo {
    cx: number;
    cz: number;
    radius: number;
    top: number;
    bottom: number;
}

@ccclass('RingController')
export class RingController extends Component {

    @property([Node])
    slotNodes: Node[] = [];

    private _blocks: (SlotBlock | null)[] = [];
    private _basePos: Vec3[] = [];
    private _baseEuler: Vec3[] = [];
    private _yawShift: number[] = [];
    private _alpha0: number[] = [];
    private _center = new Vec3();
    private _angle = 0;
    private _anim = { t: 0 };
    private _tmp = new Vec3();
    private _tmp2 = new Vec3();
    private _plate: PlateInfo | null = null;
    private _prepared = false;

    get slotCount(): number { return this.slotNodes.length; }
    get plate(): PlateInfo | null { return this._plate; }

    prepare() {
        if (this._prepared) return;
        this._prepared = true;

        let nodes = this.slotNodes.filter(n => !!n);
        const auto = this.node.children.filter(c => !!c.getComponent(SlotBlock));
        if (auto.length > nodes.length) nodes = auto;
        this.slotNodes = nodes;
        this._blocks = nodes.map(n => n.getComponent(SlotBlock));

        let bestExt = 0;
        for (const c of this.node.children) {
            if (c.getComponent(SlotBlock)) continue;
            for (const r of c.getComponentsInChildren(MeshRenderer)) {
                const b = meshWorldBounds(r);
                if (!b) continue;
                const ext = Math.max(b.max.x - b.min.x, b.max.z - b.min.z);
                if (ext > bestExt) {
                    bestExt = ext;
                    this._plate = {
                        cx: (b.min.x + b.max.x) / 2,
                        cz: (b.min.z + b.max.z) / 2,
                        radius: ext / 2,
                        top: b.max.y,
                        bottom: b.min.y,
                    };
                }
            }
        }
    }

    getAxisWorld(out: Vec3): boolean {
        if (this._plate) {
            out.set(this._plate.cx, this._plate.top, this._plate.cz);
            return true;
        }
        if (this.slotNodes.length === 0) return false;
        out.set(0, 0, 0);
        for (const n of this.slotNodes) out.add(n.worldPosition);
        out.multiplyScalar(1 / this.slotNodes.length);
        return true;
    }

    avgWorldY(): number {
        if (this._plate) return this._plate.top;
        if (this.slotNodes.length === 0) return this.node.worldPosition.y;
        let y = 0;
        for (const n of this.slotNodes) y += n.worldPosition.y;
        return y / this.slotNodes.length;
    }

    build(opts: RingBuildOpts): number {
        this.prepare();
        if (this.slotNodes.length === 0) return 0;

        const first = this._blocks.find(b => b && !b.isEmpty) ?? this._blocks[0];
        if (!first) return 0;

        this.node.inverseTransformPoint(this._tmp, opts.axisWorld);
        const cx = this._tmp.x, cz = this._tmp.z;
        this._center.set(cx, 0, cz);

        const ringScale = this.node.worldScale.x || 1;
        const fp = first.measureFootprint();
        const widthLocal = fp.width / ringScale;

        const N = Math.max(opts.slots, this.slotNodes.length);
        while (this.slotNodes.length < N) {
            const sb = first.spawnCopy(this.node);
            if (!sb) break;
            this.slotNodes.push(sb.node);
            this._blocks.push(sb);
        }
        const n = this.slotNodes.length;

        let plateR: number;
        if (this._plate) {
            plateR = this._plate.radius / ringScale;
        } else {
            plateR = 0;
            for (const nd of this.slotNodes) {
                plateR = Math.max(plateR, Math.hypot(nd.position.x - cx, nd.position.z - cz) + widthLocal * 0.5);
            }
        }
        const margin = plateR * 0.02;
        let s = 1, R = plateR - widthLocal * 0.5 - margin;
        for (let it = 0; it < 4; it++) {
            R = plateR - widthLocal * s * 0.5 - margin;
            const chord = 2 * R * Math.sin(Math.PI / n);
            s = Math.max(0.3, Math.min(GameConfig.hexMaxScale, chord / (widthLocal * GameConfig.hexGap)));
        }
        R = plateR - widthLocal * s * 0.5 - margin;

        let baseY = first.node.position.y;
        if (this._plate) {
            const offset = fp.bottomWorldY - first.node.worldPosition.y;
            const worldY = this._plate.top - offset * s + 0.002;
            this._tmp2.set(0, worldY, 0);
            this.node.inverseTransformPoint(this._tmp, this._tmp2);
            baseY = this._tmp.y;
        }

        for (let i = 0; i < n; i++) {
            const nd = this.slotNodes[i];
            const sc = nd.scale;
            nd.setScale(sc.x * s, sc.y * s, sc.z * s);
            const b = this._blocks[i];
            if (b) { b.slotIndex = i; nd.name = `Block_${i}`; }
        }
        this._baseEuler = this.slotNodes.map(nd => nd.eulerAngles.clone());
        this._alpha0 = [];
        this._basePos = [];
        this._yawShift = [];
        for (let i = 0; i < n; i++) {
            const a = (i * 360) / n;
            this._alpha0.push(a);
            this._yawShift.push(a);
            this._basePos.push(new Vec3(cx + R * Math.cos(a * RAD), baseY, cz - R * Math.sin(a * RAD)));
        }

        const discWorld = fp.discWorld * s;
        let h = opts.fixedHeight;
        if (h <= 0) {
            h = opts.headroomWorld > 0 && discWorld > 0
                ? Math.floor((opts.headroomWorld * 0.95) / discWorld)
                : 4;
            h = Math.max(2, Math.min(12, h));
        }
        for (const b of this._blocks) {
            if (!b || b === opts.skipHeight || b.isEmpty) continue;
            b.setHeight(h);
        }

        this._angle = 0;
        this.layout();
        return h;
    }

    getBlock(i: number): SlotBlock | null { return this._blocks[i] ?? null; }
    baseAlpha(i: number): number { return this._alpha0[i]; }
    indexOf(block: SlotBlock): number { return this._blocks.indexOf(block); }

    computeFrontAlpha(worldPoint: Vec3): number {
        this.node.inverseTransformPoint(this._tmp, worldPoint);
        return Math.atan2(-(this._tmp.z - this._center.z), this._tmp.x - this._center.x) / RAD;
    }

    hasBlocks(): boolean {
        return this._blocks.some(b => b && !b.isEmpty);
    }

    firstEmptySlot(): number {
        return this._blocks.findIndex(b => !!b && b.isEmpty);
    }

    getPickWorldPos(out: Vec3): boolean {
        out.set(0, 0, 0);
        let n = 0;
        for (const b of this._blocks) {
            if (!b || b.isEmpty) continue;
            b.getCenterWorldPos(this._tmp);
            out.add(this._tmp);
            n++;
        }
        if (n === 0) return false;
        out.multiplyScalar(1 / n);
        return true;
    }

    beginDrag() {
        Tween.stopAllByTarget(this._anim);
    }

    rotateBy(deg: number) {
        Tween.stopAllByTarget(this._anim);
        this._angle += deg;
        this.layout();
    }

    alignSlotToFront(i: number, frontAlpha: number) {
        Tween.stopAllByTarget(this._anim);
        this._angle += wrap180(frontAlpha - this._alpha0[i] - this._angle);
        this.layout();
    }

    nearestSlot(frontAlpha: number): number {
        let best = 0, bestAbs = Infinity;
        for (let i = 0; i < this._alpha0.length; i++) {
            const d = Math.abs(wrap180(frontAlpha - this._alpha0[i] - this._angle));
            if (d < bestAbs) { bestAbs = d; best = i; }
        }
        return best;
    }

    snapToFront(frontAlpha: number, duration = 0.15) {
        const i = this.nearestSlot(frontAlpha);
        this.animateAngle(wrap180(frontAlpha - this._alpha0[i] - this._angle), duration, false);
    }

    hintNudge(slot: number, frontAlpha: number) {
        const d = wrap180(frontAlpha - this._alpha0[slot] - this._angle);
        this.animateAngle(Math.max(-25, Math.min(25, d)), 0.5, true);
    }

    private animateAngle(delta: number, duration: number, returnToStart: boolean) {
        Tween.stopAllByTarget(this._anim);
        const start = this._angle;
        this._anim.t = 0;
        tween(this._anim)
            .to(duration, { t: 1 }, {
                onUpdate: () => {
                    const k = returnToStart ? Math.sin(this._anim.t * Math.PI) : this._anim.t;
                    this._angle = start + delta * k;
                    this.layout();
                }
            })
            .start();
    }

    private layout() {
        if (this._basePos.length === 0) return;
        const th = this._angle * RAD;
        const cos = Math.cos(th), sin = Math.sin(th);
        const c = this._center;
        for (let i = 0; i < this.slotNodes.length; i++) {
            const b = this._blocks[i];
            if (b && b.isBusy) continue;
            const base = this._basePos[i];
            const rx = base.x - c.x, rz = base.z - c.z;
            const x = rx * cos + rz * sin;
            const z = -rx * sin + rz * cos;
            const node = this.slotNodes[i];
            node.setPosition(c.x + x, base.y, c.z + z);
            const e = this._baseEuler[i];
            node.setRotationFromEuler(e.x, e.y + this._yawShift[i] + this._angle, e.z);
        }
    }

    frontSlot(frontAlpha: number, tolDeg: number): number {
        let best = -1, bestAbs = tolDeg;
        for (let i = 0; i < this._alpha0.length; i++) {
            const b = this._blocks[i];
            if (!b || b.isEmpty || b.isBusy) continue;
            const d = Math.abs(wrap180(frontAlpha - this._alpha0[i] - this._angle));
            if (d <= bestAbs) { bestAbs = d; best = i; }
        }
        return best;
    }
}