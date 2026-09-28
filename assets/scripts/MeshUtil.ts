import { MeshRenderer, Vec3 } from 'cc';

export interface WorldBounds {
    min: Vec3;
    max: Vec3;
}

const _p = new Vec3();

export function meshWorldBounds(r: MeshRenderer): WorldBounds | null {
    const st = r.mesh?.struct;
    if (!st || !st.minPosition || !st.maxPosition) return null;

    const mn = st.minPosition;
    const mx = st.maxPosition;
    const wm = r.node.worldMatrix;
    const min = new Vec3(Infinity, Infinity, Infinity);
    const max = new Vec3(-Infinity, -Infinity, -Infinity);

    for (const x of [mn.x, mx.x]) {
        for (const y of [mn.y, mx.y]) {
            for (const z of [mn.z, mx.z]) {
                Vec3.transformMat4(_p, new Vec3(x, y, z), wm);
                Vec3.min(min, min, _p);
                Vec3.max(max, max, _p);
            }
        }
    }
    return { min, max };
}