/**
 * ShelfManager.ts
 * ---------------------------------------------------------
 * The game manager. Rules (same as the reference ad):
 *  - Every ring except the LAST one can be rotated by dragging.
 *  - The LAST ring is the bottom shelf. Its stack that faces the camera
 *    is the "pile" at the bottom of the front channel.
 *  - When a stack on a rotating ring reaches the front gap:
 *      * same color as the pile (or the pile is empty) -> it FALLS down
 *        the channel and merges into the pile
 *      * different color -> nothing happens, the ring just keeps rotating
 *  - When the pile reaches GameConfig.pileCapacity discs it sparkles,
 *    shrinks away, and a new pile starts with the next stack that falls.
 *  - After GameConfig.pilesToClear piles (or when nothing is left)
 *    the end card shows.
 *
 * Setup in the Editor:
 *  - Rings are found automatically (every RingController in the scene,
 *    sorted top -> bottom by height). ringRootNodes is optional.
 *  - The LOWEST ring is the pile ring. Its pile stack is `pileBlock`
 *    (or, if not assigned, its tallest stack).
 *  - towerCenter (optional): the central column / base node. If empty,
 *    the axis is estimated from the rings' block positions.
 *  - Each other ring should have one Is Empty block = the gap; it is
 *    rotated to the front at start so the channel is clear.
 */
import { _decorator, Component, Node, Camera, Vec3, tween, Tween, director } from 'cc';
import { RingController, wrap180 } from './RingController';
import { SlotBlock } from './SlotBlock';
import { EndCard } from './EndCard';
import { GameConfig } from './GameConfig';

const { ccclass, property } = _decorator;

@ccclass('ShelfManager')
export class ShelfManager extends Component {

    @property(Camera)
    mainCamera: Camera | null = null;

    // Optional: rings are auto-detected. Assign only to force specific nodes.
    @property([Node])
    ringRootNodes: Node[] = [];

    // Optional: the stack (on the lowest ring) that acts as the pile.
    @property(SlotBlock)
    pileBlock: SlotBlock | null = null;

    // Optional: node on the tower axis (e.g. the central column). Else auto-estimated.
    @property(Node)
    towerCenter: Node | null = null;

    @property(EndCard)
    endCard: EndCard | null = null;

    // Optional: a node (particles / sprite) enabled briefly when a pile clears.
    @property(Node)
    sparkleFx: Node | null = null;

    private _rings: RingController[] = [];   // rotatable rings, TOP -> BOTTOM
    private _pileRing: RingController | null = null;
    private _pile: SlotBlock | null = null;
    private _pileScale = new Vec3(1, 1, 1);
    private _frontAlpha = 0;
    private _dragSign = 1;
    private _falling = false;
    private _cleared = 0;
    private _idle = 0;
    private _over = false;
    private _ready = false;

    get isOver(): boolean { return this._over; }
    get frontAlpha(): number { return this._frontAlpha; }
    /** +1 / -1: which way a rightward drag should rotate the ring so it follows the finger. */
    get dragSign(): number { return this._dragSign; }

    /** All rings the player may rotate (everything except the bottom/pile ring). */
    getRotatableRings(): RingController[] {
        return this._rings;
    }

    notifyInput() { this._idle = 0; }

    start() {
        if (!this.mainCamera) {
            console.error('ShelfManager: assign mainCamera.');
            return;
        }

        // 1) collect rings: assigned nodes + every RingController in the scene
        const found = new Set<RingController>();
        for (const n of this.ringRootNodes) {
            if (!n) continue;
            found.add(n.getComponent(RingController) ?? n.addComponent(RingController));
        }
        const scene = director.getScene();
        if (scene) for (const r of scene.getComponentsInChildren(RingController)) found.add(r);
        const all = Array.from(found)
            .filter(r => r.slotCount > 0)
            .sort((a, b) => b.avgWorldY() - a.avgWorldY()); // top -> bottom

        if (all.length < 2) {
            console.error('ShelfManager: need at least 2 rings with SlotBlock children.');
            return;
        }

        // 2) shared tower axis
        const axis = new Vec3();
        if (this.towerCenter) {
            axis.set(this.towerCenter.worldPosition);
        } else {
            const tmp = new Vec3();
            let n = 0;
            for (const r of all) {
                if (r.slotCount < 3) continue;
                r.getFittedCenterWorld(tmp);
                axis.x += tmp.x; axis.z += tmp.z; n++;
            }
            if (n > 0) { axis.x /= n; axis.z /= n; }
        }
        for (const r of all) r.setAxisWorld(axis);

        // 3) pile ring + pile stack
        let pileRing = all[all.length - 1];
        if (this.pileBlock) {
            const owner = all.find(r => r.indexOf(this.pileBlock!) >= 0);
            if (owner) pileRing = owner;
        }
        let pile = this.pileBlock && pileRing.indexOf(this.pileBlock) >= 0 ? this.pileBlock : null;
        if (!pile) {
            for (let i = 0; i < pileRing.slotCount; i++) {
                const b = pileRing.getBlock(i);
                if (b && !b.isEmpty && (!pile || b.startHeight > pile.startHeight)) pile = b;
            }
            if (!pile) pile = pileRing.getBlock(0);
        }
        this._pileRing = pileRing;
        this._pile = pile;
        this._rings = all.filter(r => r !== pileRing);

        // 4) front = direction from the axis to the camera
        this._frontAlpha = pileRing.computeFrontAlpha(this.mainCamera.node.worldPosition);
        if (pile) pileRing.alignSlotToFront(pileRing.indexOf(pile), this._frontAlpha);
        for (const r of this._rings) {
            const gap = r.firstEmptySlot();
            r.alignSlotToFront(gap >= 0 ? gap : r.nearestSlot(this._frontAlpha), this._frontAlpha);
        }
        if (this._pile) this._pileScale = this._pile.node.scale.clone();

        // 5) drag direction so the ring follows the finger
        const a = this._frontAlpha * Math.PI / 180;
        const tx = -Math.sin(a), tz = -Math.cos(a);
        const right = this.mainCamera.node.right;
        this._dragSign = (tx * right.x + tz * right.z) >= 0 ? 1 : -1;

        if (this.sparkleFx) this.sparkleFx.active = false;
        console.log(`[ShelfManager] rings top->bottom: ${all.map(r => `${r.node.name}(${r.slotCount})`).join(', ')}` +
            ` | pile ring: ${pileRing.node.name} | rotatable: ${this._rings.length}`);
        this._ready = true;
    }

    update(dt: number) {
        if (!this._ready || this._over) return;

        this._idle += dt;
        if (this._idle >= GameConfig.hintDelay) {
            this._idle = 0;
            this.showHint();
        }
        this.checkDrops();
    }

    // ---------------------------------------------------------------- dropping

    private checkDrops() {
        const pile = this._pile;
        if (this._falling || !pile) return;

        const rotatable = this._rings.length;
        // Lower rings first so the stack closest to the pile goes first.
        for (let k = rotatable - 1; k >= 0; k--) {
            const slot = this._rings[k].frontSlot(this._frontAlpha, GameConfig.frontToleranceDeg);
            if (slot < 0) continue;
            const block = this._rings[k].getBlock(slot)!;

            // Wrong color -> it just keeps rotating.
            if (!pile.isEmpty && pile.color !== block.color) continue;

            // Something sitting in the channel below blocks the drop.
            let blocked = false;
            for (let j = k + 1; j < rotatable; j++) {
                if (this._rings[j].frontSlot(this._frontAlpha, GameConfig.frontToleranceDeg) >= 0) {
                    blocked = true;
                    break;
                }
            }
            if (blocked) continue;

            this.startFall(block);
            return;
        }
    }

    private startFall(block: SlotBlock) {
        const pile = this._pile!;
        this._falling = true;
        block.isBusy = true;

        const world = new Vec3();
        const local = new Vec3();
        pile.getLandingWorldPos(world);
        block.node.parent!.inverseTransformPoint(local, world);

        tween(block.node)
            .to(GameConfig.fallDuration, { position: local }, { easing: 'quadIn' })
            .call(() => this.onLanded(block))
            .start();
    }

    private onLanded(block: SlotBlock) {
        const pile = this._pile!;
        if (pile.isEmpty) {
            pile.setColor(block.color);
            pile.setEmpty(false);
            pile.setHeight(block.height);
        } else {
            pile.setHeight(pile.height + block.height);
        }
        block.setEmpty(true);
        block.isBusy = false;

        if (pile.height >= GameConfig.pileCapacity) {
            this.clearPile();
        } else {
            this.bumpPile();
            this._falling = false;
            if (this.allDone()) this.finish();
        }
    }

    private bumpPile() {
        const pile = this._pile!;
        const s = this._pileScale;
        Tween.stopAllByTarget(pile.node);
        pile.node.setScale(s);
        tween(pile.node)
            .to(0.08, { scale: new Vec3(s.x * 1.12, s.y, s.z * 1.12) })
            .to(0.1, { scale: s.clone() })
            .start();
    }

    private clearPile() {
        const pile = this._pile!;
        const s = this._pileScale;
        this._falling = true; // freeze drops during the clear

        Tween.stopAllByTarget(pile.node);
        pile.node.setScale(s);

        if (this.sparkleFx) {
            this.sparkleFx.active = true;
            this.scheduleOnce(() => { if (this.sparkleFx) this.sparkleFx.active = false; }, 0.9);
        }

        tween(pile.node)
            .delay(0.3)
            .to(0.4, { scale: new Vec3(s.x, 0.001, s.z) })
            .call(() => {
                pile.setEmpty(true);
                pile.setHeight(0);
                pile.node.setScale(s);
                this._cleared++;
                this._falling = false;
                if (this._cleared >= GameConfig.pilesToClear || this.allDone()) this.finish();
            })
            .start();
    }

    private allDone(): boolean {
        return this.getRotatableRings().every(r => !r.hasBlocks());
    }

    private finish() {
        this._over = true;
        this.endCard?.show();
    }

    // ---------------------------------------------------------------- hint

    /** Wiggle a ring that has a stack which would drop if rotated to the front. */
    private showHint() {
        const pile = this._pile;
        if (!pile) return;
        const rings = this.getRotatableRings();
        for (let k = rings.length - 1; k >= 0; k--) {
            const ring = rings[k];
            for (let i = 0; i < ring.slotCount; i++) {
                const b = ring.getBlock(i);
                if (!b || b.isEmpty || b.isBusy) continue;
                if (pile.isEmpty || b.color === pile.color) {
                    ring.hintNudge(i, this._frontAlpha);
                    return;
                }
            }
        }
    }
}