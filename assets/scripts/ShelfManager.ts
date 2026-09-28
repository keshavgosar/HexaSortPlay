/**
 * ShelfManager.ts
 */
import { _decorator, Component, Node, Camera, Vec3, tween, Tween, director } from 'cc';
import { RingController } from './RingController';
import { SlotBlock } from './SlotBlock';
import { EndCard } from './EndCard';
import { BlockColor, GameConfig } from './GameConfig';

const { ccclass, property } = _decorator;

@ccclass('ShelfManager')
export class ShelfManager extends Component {

    @property(Camera)
    mainCamera: Camera | null = null;

    @property([Node])
    ringRootNodes: Node[] = [];

    @property(SlotBlock)
    pileBlock: SlotBlock | null = null;

    @property(Node)
    towerCenter: Node | null = null;

    @property(EndCard)
    endCard: EndCard | null = null;

    @property(Node)
    sparkleFx: Node | null = null;

    private _rings: RingController[] = [];
    private _pileRing: RingController | null = null;
    private _allRings: RingController[] = [];
    private _capacity = 24;
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
    get dragSign(): number { return this._dragSign; }

    getRotatableRings(): RingController[] {
        return this._rings;
    }

    notifyInput() { this._idle = 0; }

    start() {
        if (!this.mainCamera) {
            console.error('ShelfManager: assign mainCamera.');
            return;
        }

        const found = new Set<RingController>();
        for (const n of this.ringRootNodes) {
            if (!n) continue;
            found.add(n.getComponent(RingController) ?? n.addComponent(RingController));
        }
        const scene = director.getScene();
        if (scene) {
            for (const r of scene.getComponentsInChildren(RingController)) {
                found.add(r);
            }
        }
        const list = Array.from(found);
        for (const r of list) r.prepare();
        const all = list
            .filter(r => r.slotCount > 0)
            .sort((a, b) => b.avgWorldY() - a.avgWorldY());
        if (all.length < 2) {
            console.error('ShelfManager: need at least 2 rings with SlotBlock children.');
            return;
        }
        this._allRings = all;

        const axis = new Vec3();
        if (this.towerCenter) {
            axis.set(this.towerCenter.worldPosition);
        } else {
            const tmp = new Vec3();
            let n = 0;
            for (const r of all) {
                if (r.getAxisWorld(tmp)) { axis.x += tmp.x; axis.z += tmp.z; n++; }
            }
            if (n > 0) { axis.x /= n; axis.z /= n; }
        }

        let pileRing = all[all.length - 1];
        if (this.pileBlock) {
            const owner = all.find(r => r.indexOf(this.pileBlock!) >= 0);
            if (owner) pileRing = owner;
        }
        let pile: SlotBlock | null = this.pileBlock && pileRing.indexOf(this.pileBlock) >= 0 ? this.pileBlock : null;
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

        let headroom = Infinity;
        for (let k = 1; k < all.length; k++) {
            const above = all[k - 1].plate, cur = all[k].plate;
            if (above && cur) headroom = Math.min(headroom, above.bottom - cur.top);
        }
        if (!isFinite(headroom) || headroom <= 0) headroom = 0;

        let h = 4;
        for (const r of all) {
            const used = r.build({
                axisWorld: axis,
                slots: GameConfig.slotsPerRing,
                headroomWorld: headroom,
                fixedHeight: GameConfig.stackHeight,
                skipHeight: r === pileRing ? pile : null,
            });
            if (used > 0) h = used;
        }

        for (const r of this._rings) {
            if (r.firstEmptySlot() < 0) r.getBlock(0)?.setEmpty(true);
        }

        this.assignColors(pile, h);
        if (pile) {
            pile.setColor(pile.startColor);
            if (!pile.isEmpty) {
                pile.setHeight(Math.max(pile.startHeight, Math.round(h * GameConfig.pileStartStacks)));
            }
            this._pileScale = pile.node.scale.clone();
        }
        this._capacity = GameConfig.pileCapacity > 0 ? GameConfig.pileCapacity : GameConfig.pileStacks * h;

        this._frontAlpha = pileRing.computeFrontAlpha(this.mainCamera.node.worldPosition);
        if (pile) pileRing.alignSlotToFront(pileRing.indexOf(pile), this._frontAlpha);
        for (const r of this._rings) {
            const gap = r.firstEmptySlot();
            r.alignSlotToFront(gap >= 0 ? gap : r.nearestSlot(this._frontAlpha), this._frontAlpha);
        }

        const a = this._frontAlpha * Math.PI / 180;
        const tx = -Math.sin(a), tz = -Math.cos(a);
        const right = this.mainCamera.node.right;
        this._dragSign = (tx * right.x + tz * right.z) >= 0 ? 1 : -1;

        if (this.sparkleFx) this.sparkleFx.active = false;
        console.log(`[ShelfManager] rings top->bottom: ${all.map(r => `${r.node.name}(${r.slotCount})`).join(', ')}` +
            ` | pile ring: ${pileRing.node.name} | stack height: ${h} | pile capacity: ${this._capacity} discs | headroom: ${headroom.toFixed(3)}`);
        this._ready = true;
    }

    private assignColors(pile: SlotBlock | null, _h: number) {
        const palette = [
            BlockColor.Blue, BlockColor.Orange, BlockColor.Pink, BlockColor.Green,
            BlockColor.Yellow, BlockColor.Red, BlockColor.Purple,
        ];
        const play: SlotBlock[] = [];
        for (const r of this._rings) {
            for (let i = 0; i < r.slotCount; i++) {
                const b = r.getBlock(i);
                if (b && !b.isEmpty) play.push(b);
            }
        }
        const per = Math.max(1, GameConfig.pileStacks);
        const bag: BlockColor[] = [];
        const full = Math.floor(play.length / per);
        for (let i = 0; i < full; i++) for (let k = 0; k < per; k++) bag.push(palette[i % palette.length]);
        while (bag.length < play.length) bag.push(palette[Math.floor(Math.random() * palette.length)]);
        for (let i = bag.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [bag[i], bag[j]] = [bag[j], bag[i]];
        }
        play.forEach((b, i) => b.setColor(bag[i]));

        if (this._pileRing) {
            for (let i = 0; i < this._pileRing.slotCount; i++) {
                const b = this._pileRing.getBlock(i);
                if (b && b !== pile && !b.isEmpty) b.setColor(palette[Math.floor(Math.random() * palette.length)]);
            }
        }
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

    private checkDrops() {
        const pile = this._pile;
        if (this._falling || !pile) return;

        const rotatable = this._rings.length;
        for (let k = rotatable - 1; k >= 0; k--) {
            const slot = this._rings[k].frontSlot(this._frontAlpha, GameConfig.frontToleranceDeg);
            if (slot < 0) continue;
            const block = this._rings[k].getBlock(slot)!;

            if (!pile.isEmpty && pile.color !== block.color) continue;

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

        if (pile.height >= this._capacity) {
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
        this._falling = true;

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