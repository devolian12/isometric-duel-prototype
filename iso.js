
import { BOARD } from './rules/data.js';

// SAFETY: Coordinate System is strictly:
// x = COLUMN (0..cols-1)
// y = ROW    (0..rows-1)
// Drawing and Picking MUST use the identical projection math below.
// DO NOT MODIFY gridToScreen or getTilePolygon without updating the other.

export const Iso = {
    tileW: 64,
    tileH: 32,
    originX: 0, // Calculated in computeOrigin
    originY: 0,

    get halfW() { return this.tileW / 2; },
    get halfH() { return this.tileH / 2; },

    // Compute origin to center the board within the given CSS dimensions
    computeOrigin(canvasCssW, canvasCssH) {
        const hw = this.halfW;
        const hh = this.halfH;

        // Calculate bounding box of the grid relative to (0,0)
        const corners = [
            { x: 0, y: 0 },
            { x: BOARD.cols - 1, y: 0 },
            { x: 0, y: BOARD.rows - 1 },
            { x: BOARD.cols - 1, y: BOARD.rows - 1 }
        ];

        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;

        corners.forEach(p => {
            const rx = (p.x - p.y) * hw;
            const ry = (p.x + p.y) * hh;

            if (rx < minX) minX = rx;
            if (rx > maxX) maxX = rx;
            if (ry < minY) minY = ry;
            if (ry > maxY) maxY = ry;
        });

        const boxWidth = maxX - minX;
        const boxHeight = maxY - minY;

        const boxCenterRelX = (minX + maxX) / 2;
        const boxCenterRelY = (minY + maxY) / 2;

        // Center on canvas with slight top offset (35% down)
        this.originX = canvasCssW * 0.5 - boxCenterRelX;
        this.originY = canvasCssH * 0.35 - boxCenterRelY;
    },

    // Project Grid (col, row) -> Screen (x, y)
    gridToScreen(col, row) {
        const x = this.originX + (col - row) * this.halfW;
        const y = this.originY + (col + row) * this.halfH;
        return { x, y };
    },

    // Returns the 4 screen-space points of the tile diamond
    getTilePolygon(col, row) {
        const c = this.gridToScreen(col, row);
        return [
            { x: c.x, y: c.y - this.halfH }, // Top
            { x: c.x + this.halfW, y: c.y },              // Right
            { x: c.x, y: c.y + this.halfH }, // Bottom
            { x: c.x - this.halfW, y: c.y }               // Left
        ];
    },

    // Ray-Casting Point-in-Polygon check
    pointInsidePolygon(px, py, poly) {
        let inside = false;
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
            const xi = poly[i].x, yi = poly[i].y;
            const xj = poly[j].x, yj = poly[j].y;

            const intersect = ((yi > py) !== (yj > py)) &&
                (px < (xj - xi) * (py - yi) / (yj - yi) + xi);

            if (intersect) inside = !inside;
        }
        return inside;
    },

    // Brute-force picking against all board tiles
    pickTile(px, py) {
        let bestCandidate = null;
        let minDist = Infinity;

        for (let row = 0; row < BOARD.rows; row++) {
            for (let col = 0; col < BOARD.cols; col++) {

                const poly = this.getTilePolygon(col, row);

                if (this.pointInsidePolygon(px, py, poly)) {
                    // Tie-breaker: distance to tile center
                    const center = this.gridToScreen(col, row);
                    const desc = Math.hypot(px - center.x, py - center.y);

                    if (desc < minDist) {
                        minDist = desc;
                        bestCandidate = { x: col, y: row };
                    }
                }
            }
        }
        return bestCandidate;
    }
};
