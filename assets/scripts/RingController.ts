/**
 * RingController.ts
 * ---------------------------------------------------------
 * One ring (shelf level). Dragging rotates every stack on the ring
 * around the TOWER AXIS. The shelf plate doesn't spin - only stacks move.
 *
 * Setup: attach to each Ring node. slotNodes is optional - if left empty
 * (or incomplete) the ring automatically uses every direct child that has
 * a SlotBlock on it.
 *
 * On start, the stacks are re-laid out evenly on one circle around the
 * tower axis (evenSpacing), so they can never poke out past the plate
 * however they were placed in the scene.
 */
import { _decorator, Component, Node, Vec3, tween, Tween } from 'cc';
import { SlotBlock } from './SlotBlock';

const { ccclass, property } = _decorator;

const RAD = Math.PI / 180;

/** Wrap an angle in degrees to (-180, 180]. */
export function wrap180(a: number): number {
    return ((a + 180) % 360 + 360) % 360 - 180;
}

/** Least-squares circle centre through points (x,z). Falls back to the average. */
function fitCircleCenter(pts: Vec3[]): { x: number, z: number } {
    const n = pts.length;
    let ax = 0, az = 0;
    for (const p of pts) { ax += p.x; az += p.z; }
    ax /= n; az /= n;
    if (n < 3) return { x: ax, z: az };

    let sxx = 0, sxz = 0, szz = 0, sx = 0, sz = 0, sxs = 0, szs = 0, ss = 0;
    for (const p of pts) {
        const s = p.x * p.x + p.z * p.z;
        sxx += p.x * p.x; sxz += p.x * p.z; szz += p.z * p.z;
        sx += p.x; sz += p.z;
        sxs += p.x * s; szs += p.z * s; ss += s;
    }
    // Solve [sxx sxz sx; sxz szz sz; sx sz n] * [A B C] = [sxs szs ss]  (Cramer's rule)
    const det = (a: number[]) =>
        a[0] * (a[4] * a[8] - a[5] * a[7]) - a[1] * (a[3] * a[8] - a[5] * a[6]) + a[2] * (a[3] * a[7] - a[4] * a[6]);
    const M = [sxx, sxz, sx, sxz, szz, sz, sx, sz, n];
    const D = det(M);
    if (Math.abs(D) < 1e-9) return { x: ax, z: az };
    const MA = [sxs, sxz, sx, szs, szz, sz, ss, sz, n];
    const MB = [sxx, sxs, sx, sxz, szs, sz, sx, ss, n];
    const A = det(MA) / D, B = det(MB) / D;
    const cx = A / 2, cz = B / 2;
    if (!isFinite(cx) || !isFinite(cz)) return { x: ax, z: az };
    return { x: cx, z: cz };
}

@ccclass('RingController')
export class RingController extends Component {

    // Optional. Leave empty to auto-use child nodes that have a SlotBlock.
    @property([Node])
    slotNodes: Node[] = [];

    // Re-space the stacks evenly on one circle around the tower axis.
    @property
    evenSpacing = true;

    private _blocks: (SlotBlock | null)[] = [];
    private _basePos: Vec3[] = [];       // slot positions at rotation 0 (on the circle)
    private _baseEuler: Vec3[] = [];
    private _yawShift: number[] = [];
    private _alpha0: number[] = [];      // each slot's angle at rotation 0
    private _rawPos: Vec3[] = [];
    private _center = new Vec3();
    private _fit = { x: 0, z: 0 };
    private _angle = 0;
    private _anim = { t: 0 };
    private _tmp = new Vec3();

    get slotCount(): number { return this.slotNodes.length; }

    onLoad() {
        let nodes = this.slotNodes.filter(n => !!n);
        const auto = this.node.children.filter(c => !!c.getComponent(SlotBlock));
        if (auto.length > nodes.length) nodes = auto;
        this.slotNodes = nodes;

        this._blocks = nodes.map(n => n.getComponent(SlotBlock));
        this._rawPos = nodes.map(n => n.position.clone());
        this._baseEuler = nodes.map(n => n.eulerAngles.clone());
        this._fit = fitCircleCenter(this._rawPos);
        this.rebuild(this._fit.x, this._fit.z);
    }

    /** Tower axis as estimated from this ring alone (world space). */
    getFittedCenterWorld(out: Vec3): Vec3 {
        let y = 0;
        for (const p of this._rawPos) y += p.y;
        y = this._rawPos.length ? y / this._rawPos.length : 0;
        this._tmp.set(this._fit.x, y, this._fit.z);
        return Vec3.transformMat4(out, this._tmp, this.node.worldMatrix);
    }

    /** Use a shared tower axis (world position). */
    setAxisWorld(world: Vec3) {
        this.node.inverseTransformPoint(this._tmp, world);
        this.rebuild(this._tmp.x, this._tmp.z);
    }

    private rebuild(cx: number, cz: number) {
        const n = this._rawPos.length;
        this._center.set(cx, 0, cz);
        if (n === 0) return;

        const a: number[] = [], r: number[] = [];
        let meanR = 0;
        for (let i = 0; i < n; i++) {
            const p = this._rawPos[i];
            a.push(Math.atan2(-(p.z - cz), p.x - cx) / RAD);
            r.push(Math.hypot(p.x - cx, p.z - cz));
            meanR += r[i];
        }
        meanR /= n;

        let alphas = a.slice();
        if (this.evenSpacing && n > 1) {
            const order = a.map((_, i) => i).sort((i, j) => a[i] - a[j]);
            const step = 360 / n;
            let sx = 0, sy = 0;
            for (let k = 0; k < n; k++) {
                const d = (a[order[k]] - k * step) * RAD;
                sx += Math.cos(d); sy += Math.sin(d);
            }
            const off = Math.atan2(sy, sx) / RAD;
            for (let k = 0; k < n; k++) alphas[order[k]] = off + k * step;
        }

        this._alpha0 = alphas;
        this._basePos = [];
        this._yawShift = [];
        for (let i = 0; i < n; i++) {
            const rad = this.evenSpacing ? meanR : r[i];
            const al = alphas[i] * RAD;
            this._basePos.push(new Vec3(cx + rad * Math.cos(al), this._rawPos[i].y, cz - rad * Math.sin(al)));
            this._yawShift.push(wrap180(alphas[i] - a[i]));
        }
        this._angle = 0;
        this.layout();
    }

    getBlock(i: number): SlotBlock | null { return this._blocks[i] ?? null; }
    baseAlpha(i: number): number { return this._alpha0[i]; }
    indexOf(block: SlotBlock): number { return this._blocks.indexOf(block); }

    /** Average world height of this ring's slots (used to sort rings top -> bottom). */
    avgWorldY(): number {
        if (this.slotNodes.length === 0) return this.node.worldPosition.y;
        let y = 0;
        for (const n of this.slotNodes) y += n.worldPosition.y;
        return y / this.slotNodes.length;
    }

    /** Angle of the direction from the tower axis to a world point. */
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

    /** Average world position of this ring's stacks; used to figure out which ring a touch is on. */
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

    // ---------------------------------------------------------------- rotation

    beginDrag() {
        Tween.stopAllByTarget(this._anim);
    }

    rotateBy(deg: number) {
        Tween.stopAllByTarget(this._anim);
        this._angle += deg;
        this.layout();
    }

    /** Instantly rotate so slot i sits exactly at the front. */
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

    /** Ease the ring to the nearest position where some slot sits exactly at the front. */
    snapToFront(frontAlpha: number, duration = 0.15) {
        const i = this.nearestSlot(frontAlpha);
        this.animateAngle(wrap180(frontAlpha - this._alpha0[i] - this._angle), duration, false);
    }

    /** Small wobble toward the front for the idle hint. */
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
        const th = this._angle * RAD;
        const cos = Math.cos(th), sin = Math.sin(th);
        const c = this._center;
        for (let i = 0; i < this.slotNodes.length; i++) {
            const b = this._blocks[i];
            if (b && b.isBusy) continue; // falling stacks are driven by the manager
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

    // ---------------------------------------------------------------- front gap

    /** Index of the filled, non-falling stack sitting at the front (within tolDeg), or -1. */
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