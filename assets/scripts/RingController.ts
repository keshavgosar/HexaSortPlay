/**
 * RingController.ts
 * ---------------------------------------------------------
 * Manages the slots on ONE ring (one Shelf_Circle level):
 *  - knows which slots are empty (any slot, not just one)
 *  - handles "move filled block into an empty slot" requests
 *
 * Column-wide matching (same slot index across ALL rings) is
 * handled one level up, by ShelfManager — this class only
 * knows about its own ring.
 *
 * Attach this to the parent Node of a ring's block instances.
 */
import { _decorator, Component, Node, tween } from 'cc';
import { SlotBlock } from './SlotBlock';

const { ccclass, property } = _decorator;

@ccclass('RingController')
export class RingController extends Component {

    @property([Node])
    slotNodes: Node[] = []; // assign the child block nodes in the Editor, in slotIndex order

    private _blocks: (SlotBlock | null)[] = [];

    onLoad() {
        this._blocks = this.slotNodes.map(n => n.getComponent(SlotBlock));
    }

    getBlockAt(slotIndex: number): SlotBlock | null {
        return this._blocks[slotIndex] ?? null;
    }

    isEmptyAt(slotIndex: number): boolean {
        const b = this._blocks[slotIndex];
        return !b || b.isEmpty;
    }

    /** Slide the block at fromIndex into the empty slot at toIndex, within this ring. */
    moveInto(fromIndex: number, toIndex: number): boolean {
        if (fromIndex === toIndex) return false;

        const fromBlock = this._blocks[fromIndex];
        const toBlock = this._blocks[toIndex];
        if (!fromBlock || !toBlock) return false;
        if (fromBlock.isEmpty) return false;   // nothing to move
        if (!toBlock.isEmpty) return false;    // destination must be empty

        const targetPos = this.slotNodes[toIndex].position.clone();
        const originPos = this.slotNodes[fromIndex].position.clone();

        toBlock.setColor(fromBlock.color);
        toBlock.setEmpty(false);
        toBlock.node.setPosition(originPos);
        tween(toBlock.node).to(0.18, { position: targetPos }).start();

        fromBlock.setEmpty(true);
        return true;
    }

    /** Used by ShelfManager's idle-hint system to nudge a random valid move in this ring. */
    hintRandomMovable(): SlotBlock | null {
        const candidates = this._blocks.filter(b => b && !b.isEmpty) as SlotBlock[];
        if (candidates.length === 0) return null;
        return candidates[Math.floor(Math.random() * candidates.length)];
    }
}