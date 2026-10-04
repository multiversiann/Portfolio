import * as THREE from 'three';

/* ================= CONFIG ================= */
const PORTRAIT = 'assets/portrait.png'; // put YOUR photo here (transparent PNG works best)
const COUNT = 42000;                    // particle count (lower on slow devices)

/* ================= SCENE ================= */
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
camera.position.z = 8;

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  // keep subject smaller on narrow screens
  group.scale.setScalar(w < 760 ? 0.62 : 1);
  uniforms.uPx.value = renderer.getPixelRatio();
}

const uniforms = {
  uStage: { value: 0 }, uTime: { value: 0 }, uPx: { value: 1 }, uMouse: { value: new THREE.Vector2() }
};
const group = new THREE.Group();
scene.add(group);

/* ============ TARGET SHAPES ============ */

// A) Portrait: sample pixels from image (falls back to a drawn silhouette)
function loadPortrait() {
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => res(null);
    img.src = PORTRAIT;
  });
}
function fallbackPortrait() {
  const c = document.createElement('canvas'); c.width = 300; c.height = 400;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(150, 150, 20, 150, 170, 150);
  grd.addColorStop(0, '#e9b79a'); grd.addColorStop(1, '#8a5a45');
  g.fillStyle = grd; g.beginPath(); g.ellipse(150, 160, 85, 115, 0, 0, Math.PI * 2); g.fill();   // face
  g.fillStyle = '#2a1a14'; g.beginPath(); g.ellipse(150, 85, 90, 55, 0, Math.PI, 0); g.fill();   // hair
  g.fillStyle = '#4a2f26'; g.beginPath(); g.ellipse(150, 330, 130, 110, 0, Math.PI, 0); g.fill(); // shoulders
  return c;
}

function buildFace(source) {
  const W = 220, H = Math.round(220 * (source.height / source.width));
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(source, 0, 0, W, H);
  const d = g.getImageData(0, 0, W, H).data;
  const valid = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4, r = d[i], gg = d[i + 1], b = d[i + 2], a = d[i + 3];
    const lum = (r + gg + b) / 765, sat = Math.max(r, gg, b) - Math.min(r, gg, b);
    if (a > 40 && !(lum > 0.93 && sat < 18)) valid.push([x, y, r, gg, b, lum]); // skip bg
  }
  const worldH = 4.6, worldW = worldH * (W / H);
  const pos = new Float32Array(COUNT * 3), col = new Float32Array(COUNT * 3);
  for (let i = 0; i < COUNT; i++) {
    const p = valid[(Math.random() * valid.length) | 0] || [W / 2, H / 2, 200, 150, 130, .6];
    pos[i * 3]     = ((p[0] + Math.random()) / W - 0.5) * worldW;
    pos[i * 3 + 1] = (0.5 - (p[1] + Math.random()) / H) * worldH + 0.1;
    pos[i * 3 + 2] = (p[5] - 0.5) * 0.7;
    col.set([p[2] / 255, p[3] / 255, p[4] / 255], i * 3);
  }
  return { pos, col };
}

// B) Flowing strands (like the hair-fibre ribbons in the reel)
function buildStrands() {
  const pos = new Float32Array(COUNT * 3), STR = 46;
  for (let i = 0; i < COUNT; i++) {
    const s = i % STR, t = Math.random();
    const off = (s / STR - 0.5);
    const x = -2.6 + t * 6.2 + Math.sin(t * 3 + s * .3) * .25;
    const y = -1.8 + t * 3.6 + Math.sin(t * 5 + s * .4) * .35 + off * 1.4 * (0.25 + t);
    const z = Math.cos(t * 4 + s) * .6 + off * .8;
    pos.set([x + (Math.random() - .5) * .03, y + (Math.random() - .5) * .03, z], i * 3);
  }
  return pos;
}

// C) Sunburst / spiral flower
function buildBurst() {
  const pos = new Float32Array(COUNT * 3), PET = 110;
  for (let i = 0; i < COUNT; i++) {
    const k = (Math.random() * PET) | 0;
    const a = (k / PET) * Math.PI * 2 + (Math.random() - .5) * .018;
    const r = 0.25 + Math.pow(Math.random(), 1.6) * 2.5;
    const swirl = r * 0.45;                         // spiral twist
    const x = Math.cos(a + swirl) * r, y = Math.sin(a + swirl) * r;
    const z = Math.sin(r * 2.2) * .35 * (k % 2 ? 1 : -1);
    pos.set([x, y, z], i * 3);
  }
  return pos;
}

/* ============ BUILD POINTS ============ */
const rnd = new Float32Array(COUNT * 3);
for (let i = 0; i < rnd.length; i++) rnd[i] = Math.random();

const vert = /* glsl */`
  attribute vec3 aB; attribute vec3 aC; attribute vec3 aRand; attribute vec3 aCol;
  uniform float uStage, uTime, uPx; uniform vec2 uMouse;
  varying vec3 vCol; varying float vAlpha;
  float ease(float x){ return x*x*(3.0-2.0*x); }
  void main(){
    float t1 = ease(clamp(uStage        - aRand.x*0.55, 0.0, 1.0));
    float t2 = ease(clamp(uStage - 1.0  - aRand.x*0.55, 0.0, 1.0));
    vec3 p = mix(position, aB, t1);
    p = mix(p, aC, t2);

    // turbulence while particles travel between shapes
    float burst = t1*(1.0-t1) + t2*(1.0-t2);
    vec3 dir = normalize(aRand - 0.5 + 0.001);
    p += dir * burst * 3.2;
    p.x += sin(uTime*0.6 + aRand.y*20.0) * 0.015;
    p.y += cos(uTime*0.5 + aRand.z*20.0) * 0.015;

    // gentle mouse push on the portrait
    vec2 m = uMouse * vec2(3.0, 1.8);
    float dm = distance(p.xy, m);
    p.xy += normalize(p.xy - m + 0.0001) * smoothstep(1.0, 0.0, dm) * 0.22 * (1.0 - t1);

    // colour: portrait -> cream strands -> orange-cored burst
    float rad = length(aC.xy);
    vec3 cB = mix(vec3(1.0,0.93,0.86), vec3(0.95,0.7,0.6), aRand.y);
    vec3 cC = mix(vec3(1.0,0.45,0.1), vec3(1.0,0.93,0.86), smoothstep(0.2,1.6,rad));
    vec3 c = mix(aCol, cB, t1);
    c = mix(c, cC, t2);
    vCol = c;
    vAlpha = 0.9;

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = (2.6 + aRand.z*1.6) * uPx * (8.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }`;
const frag = /* glsl */`
  varying vec3 vCol; varying float vAlpha;
  void main(){
    float d = length(gl_PointCoord - 0.5);
    if(d > 0.5) discard;
    gl_FragColor = vec4(vCol, vAlpha * smoothstep(0.5, 0.2, d));
  }`;

async function init() {
  const img = (await loadPortrait()) || fallbackPortrait();
  const face = buildFace(img);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(face.pos, 3));
  geo.setAttribute('aCol', new THREE.BufferAttribute(face.col, 3));
  geo.setAttribute('aB', new THREE.BufferAttribute(buildStrands(), 3));
  geo.setAttribute('aC', new THREE.BufferAttribute(buildBurst(), 3));
  geo.setAttribute('aRand', new THREE.BufferAttribute(rnd, 3));
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: vert, fragmentShader: frag, transparent: true, depthWrite: false });
  group.add(new THREE.Points(geo, mat));
  resize();
  loop();
}

/* ============ SCROLL + MOUSE ============ */
let target = 0, smooth = 0;
const mouse = { x: 0, y: 0, sx: 0, sy: 0 };
addEventListener('mousemove', e => { mouse.x = e.clientX / innerWidth * 2 - 1; mouse.y = -(e.clientY / innerHeight * 2 - 1); });
addEventListener('resize', resize);

const bar = document.getElementById('bar');
function onScroll() {
  const max = document.documentElement.scrollHeight - innerHeight;
  const p = scrollY / max;
  bar.style.width = p * 100 + '%';
  // map scroll -> morph stage (0 portrait, 1 strands, 2 burst). Finishes before the light sections.
  target = Math.min(p / 0.55, 1) * 2;
}
addEventListener('scroll', onScroll, { passive: true });
onScroll();

const clock = new THREE.Clock();
function loop() {
  requestAnimationFrame(loop);
  smooth += (target - smooth) * 0.06;
  uniforms.uStage.value = smooth;
  uniforms.uTime.value = clock.getElapsedTime();
  mouse.sx += (mouse.x - mouse.sx) * 0.05; mouse.sy += (mouse.y - mouse.sy) * 0.05;
  uniforms.uMouse.value.set(mouse.x * 1.5, mouse.y * 1.5);
  group.rotation.y = mouse.sx * 0.25;
  group.rotation.x = -mouse.sy * 0.12 + smooth * 0.05;
  // portrait sits lower-centre; shift right as it becomes strands; fade out for light sections
  const fade = Math.max(0, 1 - Math.max(0, scrollY / (document.documentElement.scrollHeight - innerHeight) - 0.72) / 0.12);
  canvas.style.opacity = fade;
  group.position.x = smooth > 1 ? (smooth - 1) * 1.6 : 0;
  renderer.render(scene, camera);
}

/* ============ REVEAL + COUNTERS ============ */
const io = new IntersectionObserver((es) => es.forEach(e => {
  if (e.isIntersecting) {
    e.target.classList.add('in');
    if (e.target.classList.contains('count')) countUp(e.target);
    io.unobserve(e.target);
  }
}), { threshold: 0.2 });
document.querySelectorAll('.reveal, .count').forEach(el => io.observe(el));

function countUp(el) {
  const to = +el.dataset.to, dur = 1800, t0 = performance.now();
  (function tick(t) {
    const k = Math.min((t - t0) / dur, 1), v = Math.floor(to * (1 - Math.pow(1 - k, 4)));
    el.textContent = v.toLocaleString() + (k === 1 && to < 100 ? '+' : '');
    if (k < 1) requestAnimationFrame(tick);
  })(t0);
}

init();
