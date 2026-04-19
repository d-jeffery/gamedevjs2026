/**
 * Bayesian Occupancy Filter (BOF)
 *
 * Tracks an arbitrary number of targets on a 2-D grid.
 * Each cell holds a marginal probability of occupancy P(occ).
 *
 * Pipeline per time-step:
 *   1. predict()  – convolve belief with the 8-direction motion model
 *   2. sense()    – generate noisy binary sensor readings from ground truth
 *   3. update()   – Bayesian fusion of prediction and sensor evidence
 *   4. moveTargets() – advance ground-truth targets (random 8-direction walk)
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BOFConfig {
    /** Grid width in cells */
    width: number;
    /** Grid height in cells */
    height: number;
    /** Probability a cell stays occupied rather than moving (motion model) */
    pStay: number;
    /** P(detection=1 | cell is occupied)  – true-positive rate */
    pDetect: number;
    /** P(detection=1 | cell is empty)     – false-positive rate */
    pFalseAlarm: number;
    /** Initial uniform prior for every cell */
    priorOccupancy: number;
    /** Minimum/maximum clamped belief value (prevents degenerate 0/1 lock-in) */
    beliefMin: number;
    beliefMax: number;
}

export interface Target {
    x: number;
    y: number;
}

export interface BOFState {
    /** Marginal P(occ) for each cell, row-major (index = y*width + x) */
    belief: Float64Array;
    /** Predicted P(occ) before sensor fusion (output of predict step) */
    predicted: Float64Array;
    /** Binary sensor grid from the last sense() call */
    sensorGrid: Uint8Array;
    /** Ground-truth target positions */
    targets: Target[];
    /** Number of completed filter cycles */
    step: number;
}

// ---------------------------------------------------------------------------
// Default configuration
// ---------------------------------------------------------------------------

export const DEFAULT_CONFIG: BOFConfig = {
    width: 40,
    height: 40,
    pStay: 0.2,
    pDetect: 0.88,
    pFalseAlarm: 0.07,
    priorOccupancy: 0.1,
    beliefMin: 0.01,
    beliefMax: 0.99,
};

// ---------------------------------------------------------------------------
// Core filter
// ---------------------------------------------------------------------------

export class BayesianOccupancyFilter {
    readonly config: Readonly<BOFConfig>;
    private state: BOFState;
    private map: Array<Array<number>> | null;

    constructor(config: Partial<BOFConfig> = {}, map: number[][]) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.state = this.createInitialState();
        this.map = map;
    }

    // ---- public accessors ---------------------------------------------------

    getState(): Readonly<BOFState> {
        return this.state;
    }

    getBelief(): Float64Array {
        return this.state.belief;
    }

    getPredicted(): Float64Array {
        return this.state.predicted;
    }

    getSensorGrid(): Uint8Array {
        return this.state.sensorGrid;
    }

    getTargets(): readonly Target[] {
        return this.state.targets;
    }

    getStep(): number {
        return this.state.step;
    }

    // ---- initialisation -----------------------------------------------------

    reset(targets?: Target[]): void {
        this.state = this.createInitialState(targets);
    }

    spawnTargets(count: number): void {
        const { width, height } = this.config;
        this.state.targets = Array.from({ length: count }, () => ({
            x: Math.floor(Math.random() * width),
            y: Math.floor(Math.random() * height),
        }));
    }

    // ---- main tick ----------------------------------------------------------

    /**
     * Advance the filter by one time step.
     * Order: predict → sense → Bayesian update → move targets
     */
    tick(noiseRate?: number): void {
        this.state.predicted = this.predict(this.state.belief);
        this.state.sensorGrid = this.sense(noiseRate);
        this.state.belief = this.update(
            this.state.predicted,
            this.state.sensorGrid,
        );
        this.moveTargets();
        this.state.step++;
    }

    // -------------------------------------------------------------------------
    // Step 1: Prediction
    //   Convolve the current belief with the motion model.
    //   Each cell's probability mass is split:
    //     - pStay fraction remains in place
    //     - (1 - pStay) is distributed equally to all reachable 8-neighbors
    //   Cells at the boundary have fewer neighbors, so the residual stay
    //   probability is implicitly increased (reflecting boundary).
    // -------------------------------------------------------------------------

    predict(belief: Float64Array): Float64Array {
        const { width, height, pStay } = this.config;
        const predicted = new Float64Array(width * height);

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                if (this.map && this.map[x][y] === 1) continue;  // skip wall cells entirely

                const i = this.idx(x, y);
                const b = belief[i];
                if (b < 1e-9) continue;

                const allNeighbors = this.neighbors4(x, y);
                const freeNeighbors = allNeighbors.filter(([nx, ny]) => {
                    return !this.isWall(nx, ny);
                });
                const blockedCount = allNeighbors.length - freeNeighbors.length;
                const pMovePerCell = (1 - pStay) / allNeighbors.length;
                const effectiveStay = pStay + blockedCount * pMovePerCell;

                predicted[i] += b * effectiveStay;

                for (const [nx, ny] of freeNeighbors) {
                    predicted[this.idx(nx, ny)] += b * pMovePerCell;
                }
            }
        }

        return predicted;
    }

    // -------------------------------------------------------------------------
    // Step 2: Sensing
    //   Generate a binary detection grid from ground-truth target positions.
    //     z(x,y) = 1  if a target is at (x,y) and Bernoulli(pDetect) fires,
    //                 OR if Bernoulli(noiseRate) false-alarm fires
    //     z(x,y) = 0  otherwise
    // -------------------------------------------------------------------------

    sense(noiseRate: number = this.config.pFalseAlarm): Uint8Array {
        const { width, height } = this.config;
        const z = new Uint8Array(width * height);

        // False positives (clutter)
        for (let i = 0; i < z.length; i++) {
            if (Math.random() < noiseRate) z[i] = 1;
        }

        // True detections (may miss with probability 1 - pDetect)
        for (const t of this.state.targets) {
            if (Math.random() < this.config.pDetect) {
                z[this.idx(t.x, t.y)] = 1;
            }
        }

        return z;
    }

    // -------------------------------------------------------------------------
    // Step 3: Bayesian Update (sensor fusion)
    //   For each cell independently:
    //
    //   Let p  = predicted occupancy probability
    //       lk = P(z | occ)   (likelihood given occupied)
    //       lf = P(z | empty) (likelihood given empty)
    //
    //   Posterior: P(occ | z) = lk·p / (lk·p + lf·(1-p))
    //
    //   This is the standard Bayes filter update written in probability form
    //   (equivalent to log-odds form: l = log(lk/lf) + log(p/(1-p)) ).
    //   Values are clamped to [beliefMin, beliefMax] to prevent lock-in.
    // -------------------------------------------------------------------------

    update(predicted: Float64Array, z: Uint8Array): Float64Array {
        const { pDetect, pFalseAlarm, beliefMin, beliefMax } = this.config;
        const belief = new Float64Array(predicted.length);
        const { width, height } = this.config;

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const i = this.idx(x, y);

                if (this.isWall(x, y)) {         // wall cells are always beliefMin
                    belief[i] = beliefMin;
                    continue;
                }

                const p = predicted[i];
                const lk = z[i] ? pDetect : (1 - pDetect);
                const lf = z[i] ? pFalseAlarm : (1 - pFalseAlarm);

                const numerator = lk * p;
                const denominator = numerator + lf * (1 - p);
                const posterior = denominator < 1e-12 ? p : numerator / denominator;

                belief[i] = Math.max(beliefMin, Math.min(beliefMax, posterior));
            }
        }

        return belief;
    }

    // -------------------------------------------------------------------------
    // Target motion model (ground truth, NOT part of the filter itself)
    //   Each target chooses uniformly among its 4/8 neighbors with probability
    //   (1 - pStay) and stays put otherwise.
    // -------------------------------------------------------------------------

    moveTargets(): void {
        const { pStay } = this.config;
        for (const t of this.state.targets) {
            if (Math.random() < pStay) continue; // stay
            //const neighbors = this.neighbors8(t.x, t.y);
            const neighbors = this.neighbors4(t.x, t.y).filter(([nx, ny]) => {
                return !this.isWall(nx, ny);
            });
            if (neighbors.length === 0) continue;
            const [nx, ny] = neighbors[Math.floor(Math.random() * neighbors.length)];
            t.x = nx;
            t.y = ny;
        }
    }

    // -------------------------------------------------------------------------
    // Diagnostics
    // -------------------------------------------------------------------------

    /**
     * Mean binary entropy H(p) = -p·log2(p) - (1-p)·log2(1-p) across all cells.
     * High entropy → uncertain grid. Low entropy → confident assignments.
     */
    meanEntropy(): number {
        const b = this.state.belief;
        let total = 0;
        for (let i = 0; i < b.length; i++) {
            const p = b[i];
            const q = 1 - p;
            total -= p < 1e-9 ? 0 : p * Math.log2(p);
            total -= q < 1e-9 ? 0 : q * Math.log2(q);
        }
        return total / b.length;
    }

    /** Maximum belief value in the grid */
    maxBelief(): number {
        return Math.max(...this.state.belief);
    }

    /**
     * Return the top-N cells sorted by belief (descending).
     * Useful for extracting estimated target positions.
     */
    topCells(n: number): Array<{ x: number; y: number; belief: number }> {
        const { width } = this.config;
        const b = this.state.belief;

        const indices = Array.from({ length: b.length }, (_, i) => i)
            .filter(i => !this.isWall(i % width, Math.floor(i / width)));

        indices.sort((a, b_) => b[b_] - b[a]);

        return indices.slice(0, n).map(i => ({
            x: i % width,
            y: Math.floor(i / width),
            belief: b[i],
        }));
    }

    // -------------------------------------------------------------------------
    // Utility
    // -------------------------------------------------------------------------

    private idx(x: number, y: number): number {
        return y * this.config.width + x;
    }

    private neighbors4(x: number, y: number): Array<[number, number]> {
        const { width, height } = this.config;
        const result: Array<[number, number]> = [];
        const cardinal: Array<[number, number]> = [
            [0, -1],  // north
            [1, 0],  // east
            [0, 1],  // south
            [-1, 0],  // west
        ];
        for (const [dx, dy] of cardinal) {
            const nx = x + dx;
            const ny = y + dy;

            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                result.push([nx, ny]);
            }
        }
        return result;
    }

    private neighbors8(x: number, y: number): Array<[number, number]> {
        const { width, height } = this.config;
        const result: Array<[number, number]> = [];
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) continue;
                const nx = x + dx;
                const ny = y + dy;

                if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                    result.push([nx, ny]);
                }
            }
        }
        return result;
    }

    private createInitialState(targets?: Target[]): BOFState {
        const { width, height, priorOccupancy } = this.config;
        const size = width * height;
        return {
            belief: new Float64Array(size).fill(priorOccupancy),
            predicted: new Float64Array(size).fill(priorOccupancy),
            sensorGrid: new Uint8Array(size),
            targets: targets ?? [],
            step: 0,
        };
    }

    // --------

    getCellBelief(x: number, y: number): number {
        return this.state.belief[this.idx(x, y)];
    }

    setCellBelief(x: number, y: number, value: "min" | "max" | number): void {
        const { beliefMin, beliefMax } = this.config;
        const v = value === "min" ? beliefMin : value === "max" ? beliefMax : value;
        this.state.belief[this.idx(x, y)] = Math.max(
            beliefMin,
            Math.min(beliefMax, v),
        );
    }

    applyHardEvidence(
        cells: Array<{ x: number; y: number; occupied: boolean }>,
    ): void {
        const { beliefMin, beliefMax } = this.config;
        for (const { x, y, occupied } of cells) {
            this.state.belief[this.idx(x, y)] = occupied ? beliefMax : beliefMin;
        }
    }

    isWall(x: number, y: number): boolean {
        if (!this.map) return false;
        return this.map && this.map[x][y] === 1
    }
}

// ---------------------------------------------------------------------------
// Log-odds variant (numerically superior for extreme probabilities)
// ---------------------------------------------------------------------------

/**
 * Convert probability → log-odds
 * L = log(p / (1 - p))
 */
export function probToLogOdds(p: number): number {
    return Math.log(p / (1 - p));
}

/**
 * Convert log-odds → probability
 * p = 1 / (1 + exp(-L))
 */
export function logOddsToProb(l: number): number {
    return 1 / (1 + Math.exp(-l));
}

/**
 * Numerically stable Bayesian update in log-odds space.
 * Equivalent to BayesianOccupancyFilter.update() but avoids near-zero products.
 *
 * Log-odds update rule:
 *   L_posterior = L_prior + log( P(z|occ)/P(z|empty) )
 *                         ─────────────────────────────
 *                              sensor log-likelihood ratio
 */
export function updateLogOdds(
    predictedLogOdds: Float64Array,
    z: Uint8Array,
    pDetect: number,
    pFalseAlarm: number,
    clamp: [number, number] = [-10, 10],
): Float64Array {
    const llrDetect = Math.log(pDetect / pFalseAlarm); // z=1 LLR
    const llrNoDetect = Math.log((1 - pDetect) / (1 - pFalseAlarm)); // z=0 LLR
    const result = new Float64Array(predictedLogOdds.length);

    for (let i = 0; i < result.length; i++) {
        const llr = z[i] ? llrDetect : llrNoDetect;
        result[i] = Math.max(
            clamp[0],
            Math.min(clamp[1], predictedLogOdds[i] + llr),
        );
    }
    return result;
}
