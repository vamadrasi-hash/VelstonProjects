// On-device face recognition using @vladmandic/face-api (TensorFlow.js).
//
// Models live in /public/models and are loaded lazily on first use. We use the
// lightweight TinyFaceDetector so scanning stays fast on phones. A face is
// represented by a 128-float "descriptor"; two faces match when the Euclidean
// distance between their descriptors is small.

// The @vladmandic/face-api bundle (with TensorFlow.js) is ~1MB gzipped, so we
// import it dynamically — it's only fetched when a face flow actually runs,
// keeping it out of the app-wide bundle.
type FaceApi = typeof import("@vladmandic/face-api");
let faceapiMod: FaceApi | null = null;
async function fa(): Promise<FaceApi> {
  if (!faceapiMod) faceapiMod = await import("@vladmandic/face-api");
  return faceapiMod;
}

const MODEL_URL = "/models";

/** Distance below which two descriptors are treated as the same person. */
export const MATCH_THRESHOLD = 0.52;
/** Above this we don't even offer the match as a suggestion. */
export const SUGGEST_THRESHOLD = 0.62;

export type Descriptor = number[]; // length 128

let loadPromise: Promise<void> | null = null;

/** Load face models once (idempotent). Safe to call on every render. */
export function ensureModels(): Promise<void> {
  if (!loadPromise) {
    loadPromise = (async () => {
      const faceapi = await fa();
      await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
      await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
      await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);
    })().catch((e) => {
      // Reset so a later call can retry after a transient failure.
      loadPromise = null;
      throw e;
    });
  }
  return loadPromise;
}

type Input = HTMLImageElement | HTMLVideoElement | HTMLCanvasElement;

/**
 * Detect the single most prominent face in the input and return its descriptor.
 * Returns null when no face is found. `fast` uses a smaller input size for live
 * video scanning; enrollment stills should use the default (more accurate).
 */
export async function computeDescriptor(input: Input, fast = false): Promise<Descriptor | null> {
  await ensureModels();
  const faceapi = await fa();
  const options = new faceapi.TinyFaceDetectorOptions({
    inputSize: fast ? 320 : 416,
    scoreThreshold: 0.5,
  });
  const result = await faceapi
    .detectSingleFace(input, options)
    .withFaceLandmarks()
    .withFaceDescriptor();
  if (!result) return null;
  return Array.from(result.descriptor);
}

/** Euclidean distance between two descriptors (lower = more similar). */
export function distance(a: Descriptor | Float32Array, b: Descriptor | Float32Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = (a[i] as number) - (b[i] as number);
    sum += d * d;
  }
  return Math.sqrt(sum);
}

export type Candidate = { workerId: string; descriptors: Descriptor[] };
export type MatchResult = { workerId: string; distance: number } | null;

/**
 * Find the closest enrolled worker to `target`. Each worker may have several
 * enrollment samples; we take the smallest distance across all of them.
 */
export function bestMatch(target: Descriptor, candidates: Candidate[]): MatchResult {
  let best: MatchResult = null;
  for (const c of candidates) {
    for (const d of c.descriptors) {
      if (d.length !== target.length) continue;
      const dist = distance(target, d);
      if (!best || dist < best.distance) best = { workerId: c.workerId, distance: dist };
    }
  }
  return best;
}

/** Load an image URL (e.g. a Supabase signed URL) into a CORS-clean element. */
export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load image"));
    img.src = url;
  });
}

/** Load a Blob (a captured photo) into an image element. */
export function loadBlob(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => { resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Could not load image")); };
    img.src = url;
  });
}
