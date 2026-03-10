/**
 * Pure TypeScript k-means++ clustering with cosine distance.
 * Used by the weekly learning job for resonance cluster discovery.
 */

function cosineDistance(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 1;
  return 1 - dot / denom;
}

/** k-means++ initialization: pick centroids with probability proportional to squared distance. */
function initCentroids(vectors: number[][], k: number): number[][] {
  const centroids: number[][] = [];
  const n = vectors.length;

  // First centroid: random
  centroids.push(vectors[Math.floor(Math.random() * n)]!);

  for (let c = 1; c < k; c++) {
    // Compute squared distances to nearest existing centroid
    const dists = new Float64Array(n);
    let totalDist = 0;
    for (let i = 0; i < n; i++) {
      let minDist = Infinity;
      for (const centroid of centroids) {
        const d = cosineDistance(vectors[i]!, centroid);
        if (d < minDist) minDist = d;
      }
      dists[i] = minDist * minDist;
      totalDist += dists[i]!;
    }

    // Pick next centroid with probability proportional to squared distance
    let r = Math.random() * totalDist;
    for (let i = 0; i < n; i++) {
      r -= dists[i]!;
      if (r <= 0) {
        centroids.push(vectors[i]!);
        break;
      }
    }
    // Fallback in case of floating point issues
    if (centroids.length <= c) {
      centroids.push(vectors[Math.floor(Math.random() * n)]!);
    }
  }

  return centroids;
}

/** Assign each vector to the nearest centroid. */
function assignClusters(vectors: number[][], centroids: number[][]): number[] {
  const assignments = new Array<number>(vectors.length);
  for (let i = 0; i < vectors.length; i++) {
    let minDist = Infinity;
    let best = 0;
    for (let c = 0; c < centroids.length; c++) {
      const d = cosineDistance(vectors[i]!, centroids[c]!);
      if (d < minDist) {
        minDist = d;
        best = c;
      }
    }
    assignments[i] = best;
  }
  return assignments;
}

/** Recompute centroids as the mean of assigned vectors. */
function recomputeCentroids(vectors: number[][], assignments: number[], k: number): number[][] {
  const dims = vectors[0]!.length;
  const sums: number[][] = Array.from({ length: k }, () => new Array(dims).fill(0));
  const counts = new Array(k).fill(0) as number[];

  for (let i = 0; i < vectors.length; i++) {
    const c = assignments[i]!;
    counts[c]!++;
    for (let d = 0; d < dims; d++) {
      sums[c]![d]! += vectors[i]![d]!;
    }
  }

  return sums.map((sum, c) => {
    if (counts[c]! === 0) return sum; // empty cluster, keep as-is
    return sum.map((v) => v / counts[c]!);
  });
}

/**
 * Run k-means++ clustering.
 * @returns centroids and assignment array (cluster index per vector)
 */
export function kmeanspp(
  vectors: number[][],
  k: number,
  maxIter: number = 20
): { centroids: number[][]; assignments: number[] } {
  if (vectors.length === 0 || k <= 0) {
    return { centroids: [], assignments: [] };
  }
  k = Math.min(k, vectors.length);

  let centroids = initCentroids(vectors, k);
  let assignments = assignClusters(vectors, centroids);

  for (let iter = 0; iter < maxIter; iter++) {
    const newCentroids = recomputeCentroids(vectors, assignments, k);
    const newAssignments = assignClusters(vectors, newCentroids);

    // Check convergence
    let changed = false;
    for (let i = 0; i < assignments.length; i++) {
      if (assignments[i] !== newAssignments[i]) {
        changed = true;
        break;
      }
    }

    centroids = newCentroids;
    assignments = newAssignments;

    if (!changed) break;
  }

  return { centroids, assignments };
}

/** Find indices of the k vectors nearest to a centroid. */
export function nearestToCenter(
  vectors: number[][],
  centroid: number[],
  k: number
): number[] {
  const dists = vectors.map((v, i) => ({ i, d: cosineDistance(v, centroid) }));
  dists.sort((a, b) => a.d - b.d);
  return dists.slice(0, k).map((x) => x.i);
}
