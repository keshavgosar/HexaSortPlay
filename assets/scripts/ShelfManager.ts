/**
 * ShelfManager.ts
 * ---------------------------------------------------------
 * The "GameManager" of the playable. Owns the cross-ring
 * matching rule: for each of the 6 angular slot positions,
 * if every ring has a filled block there AND they're all the
 * same color, that whole vertical column pops and empties out.
 *
 * Also drives the idle-hint nudge and fires the end card once
 * GameConfig.columnsToClear matches have happened.
 *
 * Drop this on an empty "GameManager" node at the scene root
 * and wire up ringRootNodes (one per ring) + endCard.
 */
import { _decorator, Component, Node } from 'cc';
import { RingController } from './RingController';
import { EndCard } from './EndCard';
import { GameConfig } from './GameConfig';

const { ccclass, property } = _decorator;

@ccclass('ShelfManager')
export class ShelfManager extends Component {

    @property([Node])
    ringRootNodes: Node[] = []; // one Node per ring, each holding a RingController

    @property(EndCard)
    endCard: EndCard | null = null;

    private _rings: RingController[] = [];
    private _columnsCleared = 0;
    private _idleTimer = 0;
    private _gameOver = false;

    onLoad() {
        this._rings = this.ringRootNodes
            .map(n => n.getComponent(RingController))
            .filter((r): r is RingController => !!r);
    }

    update(dt: number) {
        if (this._gameOver) return;
        this._idleTimer += dt;
        if (this._idleTimer >= GameConfig.hintDelay) {
            this._idleTimer = 0;
            this.showIdleHint();
        }
    }

    /** Called by DragInput right after a move successfully lands. */
    notifyMoveMade() {
        this._idleTimer = 0;
        this.checkColumns();
    }

    private checkColumns() {
        if (this._rings.length === 0) return;
        for (let slot = 0; slot < GameConfig.slotsPerRing; slot++) {
            if (this.isColumnFullMatch(slot)) {
                this.clearColumn(slot);
            }
        }
    }

    private isColumnFullMatch(slot: number): boolean {
        let firstColor = -1;
        for (const ring of this._rings) {
            if (ring.isEmptyAt(slot)) return false;
            const block = ring.getBlockAt(slot);
            if (!block) return false;
            if (firstColor === -1) {
                firstColor = block.color;
            } else if (block.color !== firstColor) {
                return false;
            }
        }
        return true;
    }

    private clearColumn(slot: number) {
        let remaining = this._rings.length;
        for (const ring of this._rings) {
            const block = ring.getBlockAt(slot);
            block?.playMatchPulse(() => {
                block.setEmpty(true);
                remaining--;
                if (remaining === 0) this.onColumnCleared();
            });
        }
    }

    private onColumnCleared() {
        this._columnsCleared++;
        if (this._columnsCleared >= GameConfig.columnsToClear) {
            this.showEndCard();
        }
    }

    private showIdleHint() {
        for (const ring of this._rings) {
            const hint = ring.hintRandomMovable();
            if (hint) {
                hint.playHintPulse();
                break;
            }
        }
    }

    private showEndCard() {
        this._gameOver = true;
        this.endCard?.show();
    }
}