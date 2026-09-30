// Copies MediaPipe WASM runtime from node_modules into public/ so the app has no CDN dependency.
import { cpSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const src = fileURLToPath(new URL('../node_modules/@mediapipe/tasks-vision/wasm', import.meta.url));
const dst = fileURLToPath(new URL('../public/mediapipe', import.meta.url));
mkdirSync(dst, { recursive: true });
for (const name of ['vision_wasm_internal', 'vision_wasm_nosimd_internal']) {
  cpSync(`${src}/${name}.js`, `${dst}/${name}.js`);
  cpSync(`${src}/${name}.wasm`, `${dst}/${name}.wasm`);
}
console.log('MediaPipe wasm copied to public/mediapipe');
