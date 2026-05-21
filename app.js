'use strict';

const APP = {
  mode: 'ar',
  handTrack: true,
  arPassthrough: true,
  stereo: false,
  skeletonOverlay: true,
  fpsLimit: 60,
  ipd: 63,
  score: 0,
  streak: 0,
  hands: { left: null, right: null },
  cursor: { x: window.innerWidth / 2, y: window.innerHeight / 2 },
  gestures: { pinch: 0, grab: 0, swipe: 0 },
  vrActive: false,
  training: {
    active: false,
    gestures: ['pinch', 'grab', 'swipe', 'drag'],
    idx: 0,
    countdown: 3,
    timer: null,
    history: []
  }
};

const $ = id => document.getElementById(id);
const splash = $('splash');
const splashBar = $('splashBar');
const splashStatus = $('splashStatus');
const cameraFeed = $('cameraFeed');
const handVideo = $('handVideo');
const handCanvas = $('handCanvas');
const threeCanvas = $('threeCanvas');
const cursor = $('cursor');
const gestureText = $('gestureText');
const fpsCounter = $('fpsCounter');
const vrOverlay = $('vrOverlay');
const handCtx = handCanvas.getContext('2d');

function onResize() {
  const w = window.innerWidth, h = window.innerHeight;
  handCanvas.width = w; handCanvas.height = h;
  threeCanvas.width = w; threeCanvas.height = h;
  if (renderer) {
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
}
window.addEventListener('resize', onResize);

let scene, camera, renderer, clock;
let particles, floatingObjects = [];

function initThree() {
  scene = new THREE.Scene();
  clock = new THREE.Clock();
  camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 1000);
  camera.position.z = 2;
  renderer = new THREE.WebGLRenderer({ canvas: threeCanvas, alpha: true, antialias: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x000000, 0);

  const ambient = new THREE.AmbientLight(0x4fc3f7, 0.4);
  scene.add(ambient);
  const pointLight = new THREE.PointLight(0xa78bfa, 1.5, 8);
  pointLight.position.set(2, 2, 2);
  scene.add(pointLight);

  const geo = new THREE.BufferGeometry();
  const count = 600;
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count * 3; i++) pos[i] = (Math.random() - 0.5) * 12;
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    color: 0x4fc3f7, size: 0.025, transparent: true, opacity: 0.5,
    blending: THREE.AdditiveBlending, depthWrite: false
  });
  particles = new THREE.Points(geo, mat);
  scene.add(particles);

  createFloating3DPanels();
  createSpatialGrid();
}

function createFloating3DPanels() {
  const panelData = [
    { pos: [-1.8, 0.6, -2], color: 0x4fc3f7 },
    { pos: [1.8, 0.4, -2.5], color: 0xa78bfa },
    { pos: [0, -0.8, -1.8], color: 0x34d399 }
  ];
  panelData.forEach(({ pos, color }) => {
    const geo = new THREE.PlaneGeometry(0.9, 0.55);
    const mat = new THREE.MeshPhongMaterial({ color, transparent: true, opacity: 0.08, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(...pos);
    const edges = new THREE.EdgesGeometry(geo);
    const lineMat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.5 });
    const wireframe = new THREE.LineSegments(edges, lineMat);
    mesh.add(wireframe);
    const cornerGeo = new THREE.SphereGeometry(0.012, 8, 8);
    const cornerMat = new THREE.MeshBasicMaterial({ color });
    [[-0.45,-0.275],[0.45,-0.275],[-0.45,0.275],[0.45,0.275]].forEach(([x,y]) => {
      const dot = new THREE.Mesh(cornerGeo, cornerMat);
      dot.position.set(x, y, 0.001);
      mesh.add(dot);
    });
    scene.add(mesh);
    floatingObjects.push(mesh);
  });
}

function createSpatialGrid() {
  const gridHelper = new THREE.GridHelper(8, 16, 0x1a2a3a, 0x0d1520);
  gridHelper.position.y = -1.5;
  gridHelper.material.transparent = true;
  gridHelper.material.opacity = 0.4;
  scene.add(gridHelper);
}

function createHandMesh(color) {
  const group = new THREE.Group();
  const joints = [];
  const jointGeo = new THREE.SphereGeometry(0.015, 8, 8);
  const jointMat = new THREE.MeshPhongMaterial({
    color, emissive: color, emissiveIntensity: 0.5, transparent: true, opacity: 0.9
  });
  for (let i = 0; i < 21; i++) {
    const m = new THREE.Mesh(jointGeo, jointMat.clone());
    group.add(m);
    joints.push(m);
  }
  const connections = [
    [0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],
    [0,9],[9,10],[10,11],[11,12],[0,13],[13,14],[14,15],[15,16],
    [0,17],[17,18],[18,19],[19,20],[5,9],[9,13],[13,17]
  ];
  const lineMat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.4 });
  const bones = connections.map(([a, b]) => {
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const line = new THREE.Line(geo, lineMat.clone());
    group.add(line);
    return { line, a, b };
  });
  scene.add(group);
  return { group, joints, bones };
}

let handMeshLeft = null;
let lastFpsTime = performance.now(), frameCount = 0;

function animate3D() {
  requestAnimationFrame(animate3D);
  const dt = clock.getDelta();
  const t = clock.getElapsedTime();
  particles.rotation.y += dt * 0.02;
  particles.rotation.x += dt * 0.005;
  floatingObjects.forEach((obj, i) => {
    obj.rotation.y = Math.sin(t * 0.3 + i) * 0.08;
    obj.position.y += Math.sin(t * 0.5 + i * 1.3) * 0.0004;
  });
  camera.position.x = Math.sin(t * 0.15) * 0.04;
  camera.position.y = Math.cos(t * 0.1) * 0.02;
  renderer.render(scene, camera);
  frameCount++;
  const now = performance.now();
  if (now - lastFpsTime >= 500) {
    const fps = Math.round(frameCount * 1000 / (now - lastFpsTime));
    fpsCounter.textContent = `${fps} FPS`;
    fpsCounter.style.color = fps >= 50 ? 'rgba(52,211,153,0.6)' : fps >= 30 ? 'rgba(251,191,36,0.6)' : 'rgba(239,68,68,0.6)';
    lastFpsTime = now; frameCount = 0;
  }
}

async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 60 } },
      audio: false
    });
    cameraFeed.srcObject = stream;
    const handStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false
    });
    handVideo.srcObject = handStream;
    return true;
  } catch (e) {
    console.warn('Camera error:', e);
    cameraFeed.style.display = 'none';
    return false;
  }
}

let mpHands = null;

async function initMediaPipe() {
  if (typeof Hands === 'undefined') { console.warn('MediaPipe not loaded'); return; }
  mpHands = new Hands({
    locateFile: file => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
  });
  mpHands.setOptions({
    maxNumHands: 2, modelComplexity: 1,
    minDetectionConfidence: 0.7, minTrackingConfidence: 0.6
  });
  mpHands.onResults(onHandResults);
  if (typeof Camera !== 'undefined') {
    const mpCamera = new Camera(handVideo, {
      onFrame: async () => {
        if (APP.handTrack && mpHands) await mpHands.send({ image: handVideo });
      },
      width: 640, height: 480
    });
    mpCamera.start();
  }
}

const HAND_CONNECTIONS = [
  [0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],
  [0,9],[9,10],[10,11],[11,12],[0,13],[13,14],[14,15],[15,16],
  [0,17],[17,18],[18,19],[19,20],[5,9],[9,13],[13,17]
];

function onHandResults(results) {
  handCtx.clearRect(0, 0, handCanvas.width, handCanvas.height);
  if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
    APP.gestures = { pinch: 0, grab: 0, swipe: 0 };
    updateGestureUI();
    updateCursorClass('');
    return;
  }
  results.multiHandLandmarks.forEach((landmarks, idx) => {
    const handedness = results.multiHandedness[idx]?.label || 'Right';
    const color = handedness === 'Left' ? '#a78bfa' : '#4fc3f7';
    if (APP.skeletonOverlay) drawHandSkeleton(landmarks, color);
    const gestures = detectGestures(landmarks);
    APP.gestures = gestures;
    const tip = landmarks[8];
    const cx = (1 - tip.x) * window.innerWidth;
    const cy = tip.y * window.innerHeight;
    APP.cursor.x += (cx - APP.cursor.x) * 0.35;
    APP.cursor.y += (cy - APP.cursor.y) * 0.35;
    updateCursor();
    if (idx === 0 && scene) updateHandMesh(landmarks, handedness, color);
    if (APP.training.active) checkTrainingGesture(gestures);
  });
  updateGestureUI();
}

function drawHandSkeleton(landmarks, color) {
  const W = handCanvas.width, H = handCanvas.height;
  handCtx.strokeStyle = color;
  handCtx.lineWidth = 2;
  handCtx.globalAlpha = 0.6;
  handCtx.shadowBlur = 8;
  handCtx.shadowColor = color;
  HAND_CONNECTIONS.forEach(([a, b]) => {
    const p1 = landmarks[a], p2 = landmarks[b];
    handCtx.beginPath();
    handCtx.moveTo(p1.x * W, p1.y * H);
    handCtx.lineTo(p2.x * W, p2.y * H);
    handCtx.stroke();
  });
  handCtx.shadowBlur = 12;
  landmarks.forEach((lm, i) => {
    const x = lm.x * W, y = lm.y * H;
    const r = i === 0 ? 6 : (i % 4 === 0 ? 5 : 3.5);
    handCtx.globalAlpha = 0.9;
    handCtx.fillStyle = i === 8 || i === 4 ? '#ffffff' : color;
    handCtx.beginPath();
    handCtx.arc(x, y, r, 0, Math.PI * 2);
    handCtx.fill();
  });
  handCtx.globalAlpha = 1;
  handCtx.shadowBlur = 0;
}

let prevIndexPos = null;

function detectGestures(lm) {
  const thumb = lm[4], index = lm[8];
  const pinchDist = dist(thumb, index);
  const pinchScore = Math.max(0, Math.min(1, 1 - pinchDist / 0.12));
  const fingersCurled = [
    lm[8].y > lm[6].y, lm[12].y > lm[10].y,
    lm[16].y > lm[14].y, lm[20].y > lm[18].y
  ].filter(Boolean).length;
  const grabScore = fingersCurled / 4;
  let swipeScore = 0;
  if (prevIndexPos) {
    const dx = index.x - prevIndexPos.x;
    swipeScore = Math.min(1, Math.abs(dx) / 0.08);
    if (swipeScore > 0.5) APP.lastSwipeDir = dx > 0 ? 'left' : 'right';
  }
  prevIndexPos = { x: index.x, y: index.y };
  return { pinch: pinchScore, grab: grabScore, swipe: swipeScore };
}

function dist(a, b) {
  return Math.sqrt((a.x-b.x)**2 + (a.y-b.y)**2 + ((a.z||0)-(b.z||0))**2);
}

function updateHandMesh(landmarks, handedness, color) {
  if (!handMeshLeft) handMeshLeft = createHandMesh(parseInt(color.replace('#','0x')));
  const { joints, bones } = handMeshLeft;
  landmarks.forEach((lm, i) => {
    joints[i].position.set((lm.x-0.5)*3, -(lm.y-0.5)*3, -lm.z*3-1.5);
  });
  bones.forEach(({ line, a, b }) => {
    const pos = line.geometry.attributes.position;
    pos.setXYZ(0, joints[a].position.x, joints[a].position.y, joints[a].position.z);
    pos.setXYZ(1, joints[b].position.x, joints[b].position.y, joints[b].position.z);
    pos.needsUpdate = true;
  });
}

function updateCursor() {
  cursor.style.left = APP.cursor.x + 'px';
  cursor.style.top = APP.cursor.y + 'px';
}

function updateCursorClass(cls) {
  cursor.classList.toggle('pinch', cls === 'pinch');
  cursor.classList.toggle('grab', cls === 'grab');
}

function updateGestureUI() {
  const { pinch, grab, swipe } = APP.gestures;
  $('fillPinch').style.setProperty('--fill', `${pinch * 100}%`);
  $('fillGrab').style.setProperty('--fill', `${grab * 100}%`);
  $('fillSwipe').style.setProperty('--fill', `${swipe * 100}%`);
  let label = '—', cursorCls = '';
  if (pinch > 0.7) { label = '👌 Pinch'; cursorCls = 'pinch'; }
  else if (grab > 0.7) { label = '✊ Grab'; cursorCls = 'grab'; }
  else if (swipe > 0.5) { label = `👆 Swipe ${APP.lastSwipeDir || ''}`.trim(); }
  gestureText.textContent = label;
  updateCursorClass(cursorCls);
}

const GESTURES_DEF = {
  pinch: { icon: '👌', label: 'PINCH', desc: 'Touch thumb and index finger together', key: 'pinch', threshold: 0.65 },
  grab:  { icon: '✊', label: 'GRAB',  desc: 'Curl all fingers into a fist',         key: 'grab',  threshold: 0.75 },
  swipe: { icon: '👋', label: 'SWIPE', desc: 'Move hand quickly side to side',       key: 'swipe', threshold: 0.5  },
  drag:  { icon: '🖐️', label: 'DRAG',  desc: 'Open hand then move steadily',         key: 'grab',  threshold: 0.2, invert: true }
};

function startTraining() {
  APP.training.active = true;
  APP.training.idx = 0;
  APP.score = 0; APP.streak = 0;
  APP.training.history = [];
  showGesture(0);
  nextTrainingCycle();
}

function showGesture(idx) {
  const def = GESTURES_DEF[APP.training.gestures[idx % APP.training.gestures.length]];
  $('trainIcon').textContent = def.icon;
  $('trainLabel').textContent = def.label;
  $('trainDesc').textContent = def.desc;
}

function nextTrainingCycle() {
  if (APP.training.timer) clearInterval(APP.training.timer);
  APP.training.countdown = 3;
  $('trainCountdown').textContent = APP.training.countdown;
  APP.training.timer = setInterval(() => {
    APP.training.countdown--;
    $('trainCountdown').textContent = APP.training.countdown;
    if (APP.training.countdown <= 0) {
      clearInterval(APP.training.timer);
      evaluateGesture();
    }
  }, 1000);
}

function checkTrainingGesture(gestures) {
  $('fillPinch').style.setProperty('--fill', `${gestures.pinch * 100}%`);
}

function evaluateGesture() {
  const key = APP.training.gestures[APP.training.idx % APP.training.gestures.length];
  const def = GESTURES_DEF[key];
  const score = APP.gestures[def.key] || 0;
  const pass = def.invert ? score < def.threshold : score >= def.threshold;
  if (pass) { APP.score += 10 + APP.streak * 2; APP.streak++; }
  else { APP.streak = 0; }
  APP.training.history.unshift({ key, pass });
  if (APP.training.history.length > 8) APP.training.history.pop();
  updateTrainingUI();
  APP.training.idx++;
  showGesture(APP.training.idx);
  nextTrainingCycle();
}

function updateTrainingUI() {
  const pct = Math.min(100, APP.score / 2);
  $('scoreArc').style.strokeDashoffset = 213.6 - (pct / 100) * 213.6;
  $('scoreNum').textContent = APP.score;
  $('streakVal').textContent = `🔥 ${APP.streak}`;
  $('trainHistory').innerHTML = APP.training.history.slice(0, 8).map(h =>
    `<div class="hist-tag ${h.pass ? 'ok' : 'miss'}">${GESTURES_DEF[h.key].label}</div>`
  ).join('');
}

function enterVR() {
  APP.vrActive = true;
  vrOverlay.classList.remove('hidden');
  const el = document.documentElement;
  if (el.requestFullscreen) el.requestFullscreen();
  else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
  if (screen.orientation?.lock) screen.orientation.lock('landscape').catch(() => {});
  const leftEye = $('vrLeft');
  const rightEye = $('vrRight');
  leftEye.innerHTML = `<video autoplay playsinline muted style="width:100%;height:100%;object-fit:cover;transform:scaleX(-1);"></video>`;
  rightEye.innerHTML = `<video autoplay playsinline muted style="width:100%;height:100%;object-fit:cover;transform:scaleX(-1);"></video>`;
  const lv = leftEye.querySelector('video');
  const rv = rightEye.querySelector('video');
  if (cameraFeed.srcObject) { lv.srcObject = cameraFeed.srcObject; rv.srcObject = cameraFeed.srcObject; }
  if (navigator.xr) {
    navigator.xr.isSessionSupported('immersive-vr').then(supported => {
      if (supported) navigator.xr.requestSession('immersive-vr', { requiredFeatures: ['viewer'] }).catch(() => {});
    });
  }
}

window.exitVR = function() {
  APP.vrActive = false;
  vrOverlay.classList.add('hidden');
  if (document.exitFullscreen) document.exitFullscreen();
  else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
  if (screen.orientation?.unlock) screen.orientation.unlock();
};

function initDeviceMotion() {
  if (typeof DeviceOrientationEvent !== 'undefined' &&
      typeof DeviceOrientationEvent.requestPermission === 'function') {
    document.addEventListener('touchend', async () => {
      try {
        const perm = await DeviceOrientationEvent.requestPermission();
        if (perm === 'granted') listenOrientation();
      } catch (e) {}
    }, { once: true });
  } else {
    listenOrientation();
  }
}

function listenOrientation() {
  window.addEventListener('deviceorientation', e => {
    if (scene) {
      const b = (e.beta || 0) * Math.PI / 180;
      const g = (e.gamma || 0) * Math.PI / 180;
      camera.rotation.x = THREE.MathUtils.lerp(camera.rotation.x, b * 0.3, 0.1);
      camera.rotation.z = THREE.MathUtils.lerp(camera.rotation.z, -g * 0.3, 0.1);
    }
  });
}

function initUI() {
  document.querySelectorAll('.dock-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.dock-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const mode = btn.dataset.mode;
      APP.mode = mode;
      $('trainPanel').classList.add('hidden');
      $('settingsPanel').classList.add('hidden');
      if (mode === 'train') {
        $('trainPanel').classList.remove('hidden');
        if (!APP.training.active) startTraining();
      } else if (mode === 'settings') {
        $('settingsPanel').classList.remove('hidden');
      } else if (mode === 'vr') {
        enterVR();
      }
    });
  });

  document.querySelectorAll('.win-close').forEach(btn => {
    btn.addEventListener('click', () => { $(btn.dataset.close).classList.add('hidden'); });
  });

  $('togHands').addEventListener('change', e => { APP.handTrack = e.target.checked; });
  $('togAR').addEventListener('change', e => {
    APP.arPassthrough = e.target.checked;
    cameraFeed.style.display = e.target.checked ? '' : 'none';
  });
  $('togStereo').addEventListener('change', e => { APP.stereo = e.target.checked; });
  $('togSkeleton').addEventListener('change', e => { APP.skeletonOverlay = e.target.checked; });
  $('fpsSlider').addEventListener('input', e => { APP.fpsLimit = +e.target.value; $('fpsLabel').textContent = APP.fpsLimit; });
  $('ipdSlider').addEventListener('input', e => { APP.ipd = +e.target.value; $('ipdLabel').textContent = APP.ipd; });
  $('btnEnterVR').addEventListener('click', enterVR);
}

async function loadWithProgress(steps) {
  for (let i = 0; i < steps.length; i++) {
    splashStatus.textContent = steps[i].label;
    splashBar.style.width = (i / steps.length * 100) + '%';
    await steps[i].fn();
    splashBar.style.width = ((i + 1) / steps.length * 100) + '%';
    await sleep(60);
  }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  onResize();
  await loadWithProgress([
    { label: 'Initializing Three.js renderer…', fn: () => { initThree(); } },
    { label: 'Starting camera stream…',         fn: async () => { await startCamera(); } },
    { label: 'Loading MediaPipe Hands…',         fn: async () => { await initMediaPipe(); } },
    { label: 'Setting up device motion…',        fn: () => { initDeviceMotion(); } },
    { label: 'Building spatial UI…',             fn: () => { initUI(); } },
    { label: 'Calibrating spatial engine…',      fn: () => sleep(400) },
  ]);
  splash.classList.add('hidden');
  animate3D();
  cursor.style.left = (window.innerWidth / 2) + 'px';
  cursor.style.top = (window.innerHeight / 2) + 'px';
}

main().catch(console.error);
