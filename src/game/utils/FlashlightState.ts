import * as Phaser from "phaser";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Vec2 {
    x: number;
    y: number;
}

export interface FlashlightState {
    /** World-space position of the light source */
    origin: Vec2;
    /** Direction the flashlight points, in radians */
    direction: number;
    /** Half-angle of the cone in radians */
    coneHalfAngle: number;
    /** Maximum reach of the light in world pixels */
    radius: number;
}

/** Result returned by isPointLit() */
export interface LitResult {
    /** Whether the point is inside the lit cone */
    lit: boolean;
    /** Normalised brightness 0–1 (0 = dark, 1 = fully lit). Always 0 when lit=false */
    intensity: number;
    /** Why the point failed, or 'lit' if it passed */
    reason: 'lit' | 'out_of_range' | 'out_of_cone' | 'occluded';
}

/** A solid rectangle in world space that blocks light */
export interface SolidRect {
    x: number; // left edge
    y: number; // top edge
    width: number;
    height: number;
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

/**
 * Wraps an angle into [-PI, PI].
 */
function wrapAngle(a: number): number {
    while (a > Math.PI) a -= 2 * Math.PI;
    while (a < -Math.PI) a += 2 * Math.PI;
    return a;
}

/**
 * Returns the angular difference between two angles, in [-PI, PI].
 */
function angleDiff(a: number, b: number): number {
    return wrapAngle(a - b);
}

/**
 * Squared distance between two points (avoids a sqrt when only
 * comparing against a threshold).
 */
function distSq(a: Vec2, b: Vec2): number {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    return dx * dx + dy * dy;
}

/**
 * Parametric ray–segment intersection.
 *
 * Ray:     P(t) = origin + t * dir,  t ∈ [0, maxT]
 * Segment: Q(s) = a + s * (b - a),  s ∈ [0, 1]
 *
 * Returns t at the intersection point, or null if they don't intersect
 * within the given ranges.
 */
function raySegmentIntersect(
    origin: Vec2,
    dir: Vec2,
    a: Vec2,
    b: Vec2,
    maxT: number,
): number | null {
    const dx = b.x - a.x;
    const dy = b.y - a.y;

    const denom = dir.x * dy - dir.y * dx;
    if (Math.abs(denom) < 1e-10) return null; // parallel

    const diffX = a.x - origin.x;
    const diffY = a.y - origin.y;

    const t = (diffX * dy - diffY * dx) / denom;
    const s = (diffX * dir.y - diffY * dir.x) / denom;

    if (t < 0 || t > maxT) return null;
    if (s < 0 || s > 1) return null;

    return t;
}

/**
 * Returns the four edges of a rect as [a, b] endpoint pairs.
 */
function rectEdges(r: SolidRect): [Vec2, Vec2][] {
    const tl: Vec2 = { x: r.x, y: r.y };
    const tr: Vec2 = { x: r.x + r.width, y: r.y };
    const br: Vec2 = { x: r.x + r.width, y: r.y + r.height };
    const bl: Vec2 = { x: r.x, y: r.y + r.height };
    return [
        [tl, tr],
        [tr, br],
        [br, bl],
        [bl, tl],
    ];
}

// ---------------------------------------------------------------------------
// Occlusion test
// ---------------------------------------------------------------------------

/**
 * Returns true if any solid rect in `occluders` breaks the line of sight
 * between `origin` and `target`.
 *
 * We cast a ray from origin → target and check whether it intersects any
 * edge of any occluder *before* reaching the target (maxT = 1 in normalised
 * ray parameterisation, i.e. exactly the distance to target).
 */
function isOccluded(origin: Vec2, target: Vec2, occluders: SolidRect[]): boolean {
    const dir: Vec2 = {
        x: target.x - origin.x,
        y: target.y - origin.y,
    };
    // maxT = 1 means "stop at the target"; subtract a tiny epsilon so a point
    // sitting exactly on a wall face is not considered self-occluded.
    const maxT = 1 - 1e-4;

    for (const rect of occluders) {
        // Quick AABB range check before testing all four edges
        const margin = Math.max(Math.abs(dir.x), Math.abs(dir.y));
        if (
            target.x < rect.x - margin ||
            target.x > rect.x + rect.width + margin ||
            target.y < rect.y - margin ||
            target.y > rect.y + rect.height + margin
        ) {
            // The target is far outside this rect's extended bounds; skip cheap
            // but still do a proper edge test below for correctness on large rects.
        }

        for (const [a, b] of rectEdges(rect)) {
            const t = raySegmentIntersect(origin, dir, a, b, maxT);
            if (t !== null) return true;
        }
    }

    return false;
}

// ---------------------------------------------------------------------------
// Main API
// ---------------------------------------------------------------------------

/**
 * Determines whether `point` is illuminated by `flashlight`.
 *
 * Three conditions must all pass:
 *   1. Distance  – the point is within the light's radius.
 *   2. Cone      – the point is inside the angular cone.
 *   3. Occlusion – no solid occluder blocks the line of sight.
 *
 * @param point      - World-space position to test.
 * @param flashlight - Current flashlight state.
 * @param occluders  - Solid rects that cast shadows (your wall tiles).
 * @returns LitResult with a boolean, intensity, and failure reason.
 */
export function isPointLit(
    point: Vec2,
    flashlight: FlashlightState,
    occluders: SolidRect[],
): LitResult {

    const { origin, direction, coneHalfAngle, radius } = flashlight;

    // --- 1. Distance check (cheap, no sqrt yet) ---
    const radiusSq = radius * radius;
    const dSq = distSq(origin, point);
    if (dSq > radiusSq) {
        return { lit: false, intensity: 0, reason: 'out_of_range' };
    }

    // --- 2. Cone check ---
    const angleToPoint = Math.atan2(point.y - origin.y, point.x - origin.x);
    const diff = Math.abs(angleDiff(angleToPoint, direction));
    if (diff > coneHalfAngle) {
        return { lit: false, intensity: 0, reason: 'out_of_cone' };
    }

    // --- 3. Occlusion check ---
    if (isOccluded(origin, point, occluders)) {
        return { lit: false, intensity: 0, reason: 'occluded' };
    }

    // --- All checks passed: compute intensity ---
    //
    // Intensity falls off with both distance and angular offset from the
    // beam centre, giving a smooth gradient that matches the visual cone.
    const dist = Math.sqrt(dSq);
    const distFalloff = 1 - dist / radius;                        // 1 at origin → 0 at edge
    const angleFalloff = 1 - diff / coneHalfAngle;               // 1 on-axis  → 0 at cone edge
    const intensity = Math.pow(distFalloff, 1.5) * angleFalloff; // shape the curve

    return { lit: true, intensity: Math.max(0, Math.min(1, intensity)), reason: 'lit' };
}

// ---------------------------------------------------------------------------
// Phaser v4 integration helper
// ---------------------------------------------------------------------------

/**
 * Converts a Phaser Tilemap layer into a flat array of SolidRect occluders.
 * Call this once (or whenever the map changes) and cache the result.
 *
 * @param layer - The TilemapLayer whose colliding tiles block light.
 */
export function buildOccludersFromLayer(
    layer: Phaser.Tilemaps.TilemapLayer,
): SolidRect[] {
    const occluders: SolidRect[] = [];

    layer.forEachTile((tile) => {
        if (!tile.collides) return;
        occluders.push({
            x: tile.getLeft(),
            y: tile.getTop(),
            width: tile.width * 2,
            height: tile.height * 2,
        });
    });

    return occluders;
}

/**
 * Converts a FlashlightScene's live config into a FlashlightState.
 * Assumes you expose `lightOrigin`, `lightDirection`, and `config`
 * as public properties on the scene (as in the previous example).
 */
export function flashlightStateFromScene(scene: {
    lightOrigin: Phaser.Math.Vector2;
    lightDirection: number;
    config: { coneHalfAngle: number; radius: number };
}): FlashlightState {
    return {
        origin: { x: scene.lightOrigin.x, y: scene.lightOrigin.y },
        direction: scene.lightDirection,
        coneHalfAngle: Phaser.Math.DegToRad(scene.config.coneHalfAngle),
        radius: scene.config.radius,
    };
}

// ---------------------------------------------------------------------------
// Usage example (inside a Phaser Scene update loop)
// ---------------------------------------------------------------------------

/*
  // Build once when map loads:
  const occluders = buildOccludersFromLayer(this.groundLayer);
  const flashlight = flashlightStateFromScene(this);

  // Test an enemy position every frame:
  const enemyPos: Vec2 = { x: enemy.x, y: enemy.y };
  const result = isPointLit(enemyPos, flashlight, occluders);

  if (result.lit) {
    console.log(`Enemy spotted! Brightness: ${result.intensity.toFixed(2)}`);
    enemy.setAlpha(result.intensity);  // fade enemy into the light
  } else {
    console.log(`Hidden in shadow — reason: ${result.reason}`);
    enemy.setAlpha(0.05);
  }
*/