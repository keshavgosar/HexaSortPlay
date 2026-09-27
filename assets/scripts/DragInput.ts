import { _decorator, Component, Node, input, Input, EventTouch, Camera, Vec3 } from 'cc';
import { SlotBlock } from './SlotBlock';
import { RingController } from './RingController';
import { ShelfManager } from './ShelfManager';

const { ccclass, property } = _decorator;

@ccclass('DragInput')
export class DragInput extends Component {

    @property(Camera)
    mainCamera: Camera | null = null;

    @property(ShelfManager)
    shelfManager: ShelfManager | null = null;

    @property
    pickRadius = 70; // how many pixels away a tap can be and still "count"

    private _selected: SlotBlock | null = null;
    private _screenPos = new Vec3();

    onEnable() {
        input.on(Input.EventType.TOUCH_START, this.onTouchStart, this);
    }

    onDisable() {
        input.off(Input.EventType.TOUCH_START, this.onTouchStart, this);
    }

    private onTouchStart(event: EventTouch) {
        if (!this.mainCamera) return;
        const pos = event.getLocation();

        let closest: SlotBlock | null = null;
        let closestDist = 999999; // no radius limit while searching, filtered by pickRadius below

        for (const block of SlotBlock.getAll()) {
            if (!block.node.isValid) continue;
            this.mainCamera.worldToScreen(block.node.worldPosition, this._screenPos);
            const dx = this._screenPos.x - pos.x;
            const dy = this._screenPos.y - pos.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < closestDist) {
                closestDist = dist;
                closest = block;
            }
        }

        if (!closest || closestDist > this.pickRadius) return;

        if (closest.isEmpty) {
            if (this._selected) {
                this.commitMove(closest);
            }
            return;
        }

        this._selected = closest;
        closest.playHintPulse();
    }

    private commitMove(targetEmptySlot: SlotBlock) {
        if (!this._selected) return;
        const ring = targetEmptySlot.node.parent?.getComponent(RingController);
        if (ring && targetEmptySlot.ringIndex === this._selected.ringIndex) {
            const moved = ring.moveInto(this._selected.slotIndex, targetEmptySlot.slotIndex);
            if (moved) this.shelfManager?.notifyMoveMade();
        }
        this._selected = null;
    }
}