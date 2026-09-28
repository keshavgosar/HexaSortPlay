/**
 * GameConfig.ts
 * ---------------------------------------------------------
 * Every tweakable number in the playable lives here.
 */
import { Color } from 'cc';

export enum BlockColor {
    Blue = 0,
    Orange = 1,
    Pink = 2,
    Green = 3,
    // new colors seen in the reference video (existing values unchanged)
    Yellow = 4,
    Red = 5,
    Purple = 6,
}

// RGB values used to tint each disc's material ('mainColor').
export const COLOR_TABLE: Record<BlockColor, Color> = {
    [BlockColor.Blue]:   new Color(65, 105, 225, 255),
    [BlockColor.Orange]: new Color(255, 149, 30, 255),
    [BlockColor.Pink]:   new Color(255, 105, 180, 255),
    [BlockColor.Green]:  new Color(90, 200, 90, 255),
    [BlockColor.Yellow]: new Color(255, 214, 40, 255),
    [BlockColor.Red]:    new Color(225, 45, 40, 255),
    [BlockColor.Purple]: new Color(125, 70, 225, 255),
};

export const GameConfig = {
    // --- layout (kept from before, not used by the scripts directly) ---
    ringCount: 6,
    slotsPerRing: 6,
    ringSpacing: 1.1,
    ringRadius: 1.6,

    // --- stacks ---
    // Gap multiplier between discs in a stack (1 = touching).
    discSpacing: 1.0,
    // Block-local height of ONE disc. 0 = measure automatically from the mesh.
    // Set this manually if stacks look squashed or have gaps.
    discStepOverride: 0,

    // --- pile at the bottom of the front channel ---
    // Total discs in the pile that count as "full" -> sparkle + clear.
    // Roughly: (number of rings) x (discs per stack). Tune by eye.
    pileCapacity: 24,
    // How many piles must be cleared before the end card shows.
    pilesToClear: 3,

    // --- feel ---
    // Degrees around the ring within which a stack counts as "at the front".
    frontToleranceDeg: 10,
    // Seconds for a stack to drop down the channel.
    fallDuration: 0.35,
    // Seconds of no input before the hint wobble plays.
    hintDelay: 4,
};