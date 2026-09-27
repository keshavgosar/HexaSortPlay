/**
 * GameConfig.ts
 * ---------------------------------------------------------
 * Central place for every "tweakable" number in the playable.
 * (Unity comparison: this is like a ScriptableObject you'd
 * drag values into, except here it's just a plain TS file.)
 */
import { Color } from 'cc';

export enum BlockColor {
    Blue = 0,
    Orange = 1,
    Pink = 2,
    Green = 3,
}

// Actual RGB values used to tint the shared hexa_03 material per block.
export const COLOR_TABLE: Record<BlockColor, Color> = {
    [BlockColor.Blue]:   new Color(65, 105, 225, 255),
    [BlockColor.Orange]: new Color(255, 149, 30, 255),
    [BlockColor.Pink]:   new Color(255, 105, 180, 255),
    [BlockColor.Green]:  new Color(90, 200, 90, 255),
};

export const GameConfig = {
    // How many rings (Shelf_Circle levels) are stacked on the base.
    ringCount: 3,
    // How many block slots sit around each ring.
    slotsPerRing: 6,
    // Vertical spacing between rings (world units) - tune to your FBX scale.
    ringSpacing: 1.1,
    // Radius at which slots are placed around the ring center.
    ringRadius: 1.6,
    // Seconds of no input before we show an auto-hint (glow pulse).
    hintDelay: 4,
    // Seconds the "column pop" celebration animation takes.
    clearAnimDuration: 0.5,
    // How many full-height column matches trigger the end card.
    // Ad pacing knob: keep this low (2-3) rather than requiring the
    // whole board to be solved before the CTA appears.
    columnsToClear: 3,
};