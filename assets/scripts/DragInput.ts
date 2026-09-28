/**
 * DragInput.ts
 * ---------------------------------------------------------
 * Touch/mouse a ring and drag left/right to rotate it.
 * The ring that gets grabbed is the one whose stacks are closest
 * to the touch (vertically) on screen. On release the ring snaps so a
 * stack sits exactly in the front gap.
 */
import { _decorator, Component, input, Input, EventTouch, Camera, Vec3 } from 'cc';
import { RingController } from './RingController';
import { ShelfManager } from './ShelfManager';

const { ccclass, property } = _decorator;

@ccclass('DragInput')
export class DragInput extends Component {

    @property(Camera)
    mainCamera: Camera | null = null;

    @property(ShelfManager)
    shelfManager: ShelfManager | null = null;

    // Degrees of ring rotation per pixel dragged. Raise for a "lighter" ring.
    @property
    degPerPixel = 0.35;

    // A touch further than this many screen pixels (vertically) from any ring is ignored.
    @property
    pickRangePx = 140;

    private _ring: RingController | null = null;
    private _wp = new Vec3();
    private _sp = new Vec3();

    onEnable() {
        input.on(Input.EventType.TOUCH_START, this.onTouchStart, this);
        input.on(Input.EventType.TOUCH_MOVE, this.onTouchMove, this);
        input.on(Input.EventType.TOUCH_END, this.onTouchEnd, this);
        input.on(Input.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
    }

    onDisable() {
        input.off(Input.EventType.TOUCH_START, this.onTouchStart, this);
        input.off(Input.EventType.TOUCH_MOVE, this.onTouchMove, this);
        input.off(Input.EventType.TOUCH_END, this.onTouchEnd, this);
        input.off(Input.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
    }

    private onTouchStart(event: EventTouch) {
        const mgr = this.shelfManager;
        const cam = this.mainCamera ?? mgr?.mainCamera;
        if (!mgr || !cam || mgr.isOver) return;

        const touchY = event.getLocationY();
        let best: RingController | null = null;
        let bestD = Infinity;

        for (const ring of mgr.getRotatableRings()) {
            if (!ring.getPickWorldPos(this._wp)) continue;
            cam.worldToScreen(this._wp, this._sp);
            const d = Math.abs(this._sp.y - touchY);
            if (d < bestD) { bestD = d; best = ring; }
        }

        if (!best || bestD > this.pickRangePx) return;
        this._ring = best;
        best.beginDrag();
        mgr.notifyInput();
    }

    private onTouchMove(event: EventTouch) {
        const mgr = this.shelfManager;
        if (!this._ring || !mgr || mgr.isOver) return;
        this._ring.rotateBy(event.getDeltaX() * this.degPerPixel * mgr.dragSign);
        mgr.notifyInput();
    }

    private onTouchEnd() {
        const mgr = this.shelfManager;
        if (this._ring && mgr) {
            this._ring.snapToFront(mgr.frontAlpha);
            mgr.notifyInput();
        }
        this._ring = null;
    }
}