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
    // --- how many stacks sit around each ring ---
    slotsPerRing: 14,

    // --- stacks ---
    // Discs per stack. 0 = auto: as tall as fits between two shelves.
    stackHeight: 0,
    // Stacks may be scaled UP to this factor to fill the ring (they always scale
    // DOWN as much as needed so neighbours never overlap).
    hexMaxScale: 1.1,
    // Gap between neighbouring stacks (1.04 = 4% air).
    hexGap: 1.04,
    // Gap multiplier between discs in a stack (1 = touching).
    discSpacing: 1.0,
    // Block-local height of ONE disc. 0 = measure automatically from the mesh.
    discStepOverride: 0,

    // --- pile at the bottom of the front channel ---
    // How many stacks fill a pile (pile clears when it reaches this many stacks tall).
    pileStacks: 6,
    // Manual override in discs. 0 = use pileStacks x stack height.
    pileCapacity: 0,
    // Starting pile size, in stacks (the big blue column in the video).
    pileStartStacks: 2,
    // How many piles must be cleared before the end card shows.
    pilesToClear: 3,

    // --- feel ---
    // Degrees around the ring within which a stack counts as "at the front".
    frontToleranceDeg: 8,
    // Seconds for a stack to drop down the channel.
    fallDuration: 0.35,
    // Seconds of no input before the hint wobble plays.
    hintDelay: 4,
};