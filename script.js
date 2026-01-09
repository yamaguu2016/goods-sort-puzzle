const THREE = window.THREE;
const OrbitControls = window.OrbitControls;
let cubeSize = 9;
const selectionGoal = 3;
const rankingSize = 10;
const theme = {
  bgGradient: ["#f2f2f2", "#fafafa", "#eaeaea"],
  panel: "#fff8ee",
  panelStroke: "rgba(120,90,40,0.12)",
  panelShadow: "rgba(60,40,10,0.12)",
  textDark: "#1a1a1a",
  textMid: "#4d4d4d",
  textLight: "#ffffff",
  accent: "#e60012",
  accentStrong: "#e60012",
  gold: "#d9b36c",
  goldLight: "#f4e6c4",
  hudCard: "#fff3df",
  button: "#f0f0f0",
  buttonText: "#1a1a1a",
  activeStroke: "rgba(230,0,18,0.75)",
};
const tileTypes = ["apple", "orange", "grape", "banana", "cherry", "lemon"];
const tileEmoji = {
  apple: "\uD83C\uDF4E",
  orange: "\uD83C\uDF4A",
  grape: "\uD83C\uDF47",
  banana: "\uD83C\uDF4C",
  cherry: "\uD83C\uDF52",
  lemon: "\uD83C\uDF4B",
};
const tileColors = {
  apple: "#ff6b8b",
  orange: "#ff9a4a",
  grape: "#6a6cff",
  banana: "#ffd25c",
  cherry: "#ff5678",
  lemon: "#20c6ff",
};

const root = document.getElementById("three-root");

let renderer;
let scene;
let camera;
let controls;
let width = 0;
let height = 0;

let board = [];
let score = 0;
let comboCount = 0;
let busy = false;
let state = "title";

let tileId = 0;
const tileMeshes = new Map();
const tileHitMeshes = [];
const tileIndexMap = new Map();
const emojiTextures = new Map();

const animations = [];
let selectedIds = [];
let hoverId = null;
let modeLabel = "Hard";
let isRotating = false;
let lastPointer = { x: 0, y: 0 };
const rotateSpeed = 0.005;
let pinchStartDist = 0;
let pinchStartScale = 1;
const scaleLimits = { min: 0.7, max: 1.8 };
const rotationAxes = {
  x: new THREE.Vector3(1, 0, 0),
  y: new THREE.Vector3(0, 1, 0),
};
const rotationQuats = {
  x: new THREE.Quaternion(),
  y: new THREE.Quaternion(),
};
let timerStart = 0;
let elapsedMs = 0;
let lastTimerText = "";
let bestTimeMs = null;
const bestTimeKey = "goodsSortPuzzleBestTimeMs";
const playerNameKey = "goodsSortPuzzlePlayerName";
const rankingKey = "goodsSortPuzzleRanking";
let playerName = "PLAYER";
let ranking = [];
let needsNameInput = false;
let settingsReturnState = "title";
let lastState = null;
let titleIntroStart = 0;
let titleSweepStart = 0;
let currentModeSize = cubeSize;
let tutorialAnimStart = 0;
const touchState = {
  moved: false,
  pointers: new Map(),
};

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let audioCtx = null;

const ui = {
  hud: new THREE.Group(),
  title: new THREE.Group(),
  tutorial: new THREE.Group(),
  end: new THREE.Group(),
  settings: new THREE.Group(),
  combo: null,
  tip: null,
  buttons: {},
  background: null,
};

const boardLayout = {
  step: 0,
  cell: 0,
  gap: 0,
  extent: 0,
};

let boardGroup;
let boardFrame;

init();

function init() {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  root.appendChild(renderer.domElement);
  renderer.domElement.style.touchAction = "none";

  scene = new THREE.Scene();
  camera = new THREE.OrthographicCamera(0, 1, 1, 0, -500, 500);
  camera.zoom = 1;
  scene.add(camera);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.enableZoom = false;
  controls.enableRotate = false;
  controls.rotateSpeed = 0.6;
  controls.zoomSpeed = 0.8;
  controls.minZoom = 0.7;
  controls.maxZoom = 1.8;
  controls.mouseButtons = {
    LEFT: THREE.MOUSE.PAN,
    MIDDLE: THREE.MOUSE.DOLLY,
    RIGHT: THREE.MOUSE.ROTATE,
  };
  controls.touches = {
    ONE: THREE.TOUCH.ROTATE,
    TWO: THREE.TOUCH.DOLLY_ROTATE,
  };

  const ambient = new THREE.AmbientLight(0xffffff, 0.95);
  const dir = new THREE.DirectionalLight(0xffffff, 0.6);
  dir.position.set(0, 0, 40);
  scene.add(ambient, dir);

  ui.background = createBackground();
  scene.add(ui.background);

  boardGroup = new THREE.Group();
  scene.add(boardGroup);
  boardFrame = createBoardFrame();
  boardGroup.add(boardFrame);

  buildHud();
  buildTitleScreen();
  buildTutorialScreen();
  buildEndScreen();
  buildSettingsScreen();
  buildTip();
  buildCombo();

  scene.add(ui.hud, ui.title, ui.tutorial, ui.end, ui.settings);

  loadBestTime();
  loadPlayerName();
  loadRanking();
  createBoard();
  syncTiles();
  layout();
  updateRankingDisplay();

  window.addEventListener("resize", layout);
  renderer.domElement.addEventListener("pointerdown", onPointerDown);
  renderer.domElement.addEventListener("pointermove", onPointerMove);
  renderer.domElement.addEventListener("pointerup", onPointerUp);
  renderer.domElement.addEventListener("wheel", onWheel, { passive: false, capture: true });
  renderer.domElement.addEventListener("mousewheel", onWheel, { passive: false, capture: true });
  window.addEventListener("wheel", onWheel, { passive: false, capture: true });
  renderer.domElement.addEventListener("contextmenu", (event) => {
    event.preventDefault();
  });

  requestAnimationFrame(tick);
}

function layout() {
  const rect = root.getBoundingClientRect();
  width = rect.width;
  height = rect.height;
  renderer.setSize(width, height, false);
  camera.left = 0;
  camera.right = width;
  camera.top = height;
  camera.bottom = 0;
  camera.near = 0.1;
  camera.far = 10000;
  camera.updateProjectionMatrix();

  setRect(ui.background, 0, 0, width, height, -200);

  const hudHeight = 90;
  const maxCube = Math.min(width * 0.7, height - hudHeight - 140);
  boardLayout.extent = Math.max(300, maxCube);
  boardLayout.gap = boardLayout.extent * 0.02;
  boardLayout.cell =
    (boardLayout.extent - boardLayout.gap * (cubeSize - 1)) / cubeSize;
  boardLayout.step = boardLayout.cell + boardLayout.gap;

  boardGroup.position.set(width / 2, height / 2 + 10, 0);
  applyRotation();
  boardFrame.scale.set(boardLayout.extent, boardLayout.extent, boardLayout.extent);
  camera.position.set(0, 0, boardLayout.extent * 1.4);
  camera.lookAt(0, 0, 0);
  if (controls) {
    controls.target.set(0, 0, 0);
    controls.update();
  }

  layoutHud();
  layoutTitleScreen();
  layoutTutorialScreen();
  layoutEndScreen();
  layoutSettingsScreen();
  layoutTip();
  layoutCombo();
  layoutTiles();
}

function createBoard() {
  const total = cubeSize * cubeSize * cubeSize;
  const groups = Math.floor(total / selectionGoal);
  const types = [];
  for (let i = 0; i < groups; i++) {
    const type = randomType();
    for (let j = 0; j < selectionGoal; j++) {
      types.push(type);
    }
  }
  shuffleArray(types);
  board = types.map((type) => makeTile(type));
  updateTileIndexMap();
}

function makeTile(type) {
  tileId += 1;
  return { id: tileId, type: type || randomType() };
}

function randomType() {
  return tileTypes[Math.floor(Math.random() * tileTypes.length)];
}

function updateTileIndexMap() {
  tileIndexMap.clear();
  board.forEach((tileObj, index) => {
    if (tileObj) tileIndexMap.set(tileObj.id, index);
  });
}

function syncTiles() {
  updateTileIndexMap();
  const present = new Set(board.map((tileObj) => tileObj.id));
  board.forEach((tileObj) => {
    if (!tileMeshes.has(tileObj.id)) {
      const mesh = createTileMesh(tileObj);
      tileMeshes.set(tileObj.id, mesh);
      boardGroup.add(mesh);
      tileHitMeshes.push(mesh.userData.hit);
    }
  });
  tileMeshes.forEach((mesh, id) => {
    if (!present.has(id)) {
      boardGroup.remove(mesh);
      tileMeshes.delete(id);
      const idx = tileHitMeshes.indexOf(mesh.userData.hit);
      if (idx >= 0) tileHitMeshes.splice(idx, 1);
    }
  });
}

function createTileMesh(tileObj) {
  const group = new THREE.Group();
  const baseMaterial = new THREE.MeshStandardMaterial({
    map: getEmojiTexture(tileObj.type),
    color: "#ffffff",
    roughness: 0.35,
    metalness: 0.1,
    emissive: new THREE.Color("#000000"),
    transparent: true,
  });
  const base = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), baseMaterial);
  base.userData.tileId = tileObj.id;
  base.userData.isHit = true;
  group.userData = {
    id: tileObj.id,
    type: tileObj.type,
    hit: base,
    target: new THREE.Vector3(),
    locked: false,
    baseScale: new THREE.Vector3(1, 1, 1),
    baseColor: baseMaterial.color.clone(),
  };
  group.add(base);
  return group;
}

function getEmojiTexture(type) {
  if (emojiTextures.has(type)) return emojiTextures.get(type);
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = tileColors[type] || "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = "88px 'Segoe UI Emoji', 'Apple Color Emoji', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(tileEmoji[type] || "?", 64, 72);
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  emojiTextures.set(type, texture);
  return texture;
}

function layoutTiles() {
  updateTileIndexMap();
  const half = (cubeSize - 1) / 2;
  board.forEach((tileObj, index) => {
    const mesh = tileMeshes.get(tileObj.id);
    if (!mesh) return;
    const { x, y, z } = indexToCoord(index);
    const pos = new THREE.Vector3(
      (x - half) * boardLayout.step,
      (y - half) * boardLayout.step,
      (z - half) * boardLayout.step
    );
    mesh.userData.target.copy(pos);
    mesh.userData.baseScale.set(
      boardLayout.cell,
      boardLayout.cell,
      boardLayout.cell
    );
  });
}

function indexToCoord(index) {
  const layerSize = cubeSize * cubeSize;
  const z = Math.floor(index / layerSize);
  const rem = index % layerSize;
  const y = Math.floor(rem / cubeSize);
  const x = rem % cubeSize;
  return { x, y, z };
}

function coordToIndex(x, y, z) {
  return z * cubeSize * cubeSize + y * cubeSize + x;
}

function handleSelection(id) {
  const pos = selectedIds.indexOf(id);
  if (pos >= 0) {
    selectedIds.splice(pos, 1);
    return;
  }
  if (selectedIds.length >= selectionGoal) return;
  selectedIds.push(id);
  if (selectedIds.length === selectionGoal) {
    evaluateSelection();
  }
}

function evaluateSelection() {
  const types = selectedIds.map((id) => {
    const index = tileIndexMap.get(id);
    return index !== undefined && board[index] ? board[index].type : null;
  });
  const valid = types.every((t) => t && t === types[0]);
  if (!valid) {
    busy = true;
    addAnimation(220, () => {}, () => {
      selectedIds = [];
      busy = false;
    });
    return;
  }
  consumeSelection(selectedIds.slice());
  selectedIds = [];
}

function consumeSelection(ids) {
  busy = true;
  comboCount += 1;
  showComboText(comboCount);
  playMatchSound(ids.length);

  const center = getSelectionCenter(ids);
  const duration = 240;
  ids.forEach((id) => {
    const mesh = tileMeshes.get(id);
    if (!mesh) return;
    lockTile(mesh, true);
    const startPos = mesh.position.clone();
    const startScale = mesh.scale.clone();
    addAnimation(
      duration,
      (t) => {
        const eased = easeInOut(t);
        mesh.position.lerpVectors(startPos, center, eased);
        mesh.scale.lerpVectors(
          startScale,
          startScale.clone().multiplyScalar(0.2),
          eased
        );
        mesh.children[0].material.opacity = 1 - eased;
      },
      () => {
        removeTile(id);
      }
    );
  });

  addAnimation(duration, () => {}, () => {
    score += ids.length * 100;
    updateScore();
    checkClear();
    busy = false;
  });
}

function getSelectionCenter(ids) {
  let sum = new THREE.Vector3();
  let count = 0;
  ids.forEach((id) => {
    const mesh = tileMeshes.get(id);
    if (!mesh) return;
    sum.add(mesh.position);
    count += 1;
  });
  if (count === 0) return new THREE.Vector3();
  return sum.multiplyScalar(1 / count);
}

function removeTile(id) {
  const index = findIndexById(id);
  if (index === undefined) return;
  board[index] = null;
  tileIndexMap.delete(id);
  const mesh = tileMeshes.get(id);
  if (!mesh) return;
  boardGroup.remove(mesh);
  tileMeshes.delete(id);
  const hitIdx = tileHitMeshes.indexOf(mesh.userData.hit);
  if (hitIdx >= 0) tileHitMeshes.splice(hitIdx, 1);
  checkClear();
}

function lockTile(mesh, value) {
  mesh.userData.locked = value;
}

function updateTilesVisuals() {
  tileMeshes.forEach((mesh, id) => {
    if (!mesh.userData.locked) {
      mesh.position.lerp(mesh.userData.target, 0.2);
      const baseScale = mesh.userData.baseScale.clone();
      const isSelected = selectedIds.includes(id);
      const isHover = hoverId === id;
      const scale = isSelected ? 1.15 : isHover ? 1.06 : 1;
      mesh.scale.lerp(baseScale.multiplyScalar(scale), 0.25);
      const material = mesh.children[0].material;
      if (isSelected) {
        material.emissive.set("#ffffff");
        material.emissiveIntensity = 0.6;
      } else if (isHover) {
        material.emissive.set("#ffffff");
        material.emissiveIntensity = 0.25;
      } else {
        material.emissive.set("#000000");
        material.emissiveIntensity = 0;
      }
    }
  });
}

function tick(now) {
  updateAnimations(now);
  updateTilesVisuals();
  if (state !== lastState) {
    if (state === "title") {
      titleIntroStart = performance.now();
      titleSweepStart = performance.now();
    }
    if (state === "tutorial") {
      tutorialAnimStart = performance.now();
    }
    lastState = state;
  }
  updateTitleEntrance(now);
  updateTitleHeaderSweep(now);
  updateTutorialAnimation(now);
  updateTitleButtonPulse(now);
  updateScreenVisibility();
  updateTimer(now);
  if (controls) controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

function updateTitleButtonPulse(now) {
  if (state !== "title" || !ui.title.userData) return;
  const t = now * 0.001;
  const pulse = 1 + 0.06 * Math.sin(t * 3.2);
  const base = ui.title.userData.startBase;
  ui.title.userData.btn.bg.scale.set(base.w * pulse, base.h * pulse, 1);
  ui.title.userData.btn.label.mesh.scale.set(
    ui.title.userData.btn.label.mesh.userData.size.w * pulse,
    ui.title.userData.btn.label.mesh.userData.size.h * pulse,
    1
  );
}

function updateTitleEntrance(now) {
  if (state !== "title" || !ui.title.userData || !ui.title.userData.animateItems) return;
  const t = (now - titleIntroStart) / 1000;
  const items = ui.title.userData.animateItems;
  items.forEach((item, idx) => {
    const delay = idx * 0.05;
    const local = clamp((t - delay) / 0.6, 0, 1);
    const eased = easeOutCubic(local);
    const yOffset = (1 - eased) * 18;
    item.mesh.position.set(item.basePos.x, item.basePos.y - yOffset, item.basePos.z);
    const scale = item.baseScale.clone().multiplyScalar(0.98 + 0.02 * eased);
    item.mesh.scale.copy(scale);
    setMeshOpacity(item.mesh, eased);
  });
}

function updateTitleHeaderSweep(now) {
  if (state !== "title" || !ui.title.userData || !ui.title.userData.headerGlow) return;
  const glow = ui.title.userData.headerGlow;
  const header = ui.title.userData.header;
  if (!header) return;
  const duration = 2400;
  const t = ((now - titleSweepStart) % duration) / duration;
  const headerW = header.scale.x;
  const startX = header.position.x - headerW / 2 - 120;
  const endX = header.position.x + headerW / 2 + 120;
  glow.position.x = startX + (endX - startX) * t;
  glow.position.y = header.position.y;
  glow.position.z = header.position.z + 1;
  const alpha = t < 0.5 ? t * 2 : (1 - t) * 2;
  glow.material.opacity = 0.35 * alpha;
}

function setModeOutlineImmediate() {
  if (!ui.title.userData) return;
  const targets = [
    { size: 3, outline: ui.title.userData.easyBtn?.outline },
    { size: 6, outline: ui.title.userData.normalBtn?.outline },
    { size: 9, outline: ui.title.userData.hardBtn?.outline },
  ];
  targets.forEach((target) => {
    if (!target.outline) return;
    target.outline.material.opacity = cubeSize === target.size ? 1 : 0;
  });
}

function updateTutorialAnimation(now) {
  if (state !== "tutorial" || !ui.tutorial.userData) return;
  const { cubeIcon, handIcon } = ui.tutorial.userData;
  if (!cubeIcon || !handIcon || !ui.tutorial.userData.iconBase) return;
  const { cubePos, handPos, cubeScale, handScale } = ui.tutorial.userData.iconBase;
  const elapsed = (now - tutorialAnimStart) / 1000;
  const cycle = 2.4;
  const t = (elapsed % cycle) / cycle;
  let moveT = clamp(t / 0.55, 0, 1);
  let tapT = clamp((t - 0.55) / 0.2, 0, 1);
  let releaseT = clamp((t - 0.75) / 0.2, 0, 1);
  const easedMove = easeOutCubic(moveT);
  const tapScale = 1 - 0.12 * Math.sin(Math.PI * tapT);
  handIcon.mesh.position.set(
    handPos.x - 18 + 18 * easedMove,
    handPos.y + 12 - 12 * easedMove,
    handPos.z
  );
  handIcon.mesh.scale.set(
    handScale.x * tapScale,
    handScale.y * tapScale,
    1
  );
  const cubePulse = 1 + 0.08 * Math.sin(Math.PI * tapT);
  cubeIcon.mesh.scale.set(
    cubeScale.x * cubePulse,
    cubeScale.y * cubePulse,
    1
  );
  if (releaseT > 0) {
    const easedRelease = easeInOut(releaseT);
    handIcon.mesh.position.set(
      handPos.x,
      handPos.y,
      handPos.z
    );
    handIcon.mesh.scale.set(
      handScale.x * (1 + 0.02 * (1 - easedRelease)),
      handScale.y * (1 + 0.02 * (1 - easedRelease)),
      1
    );
    cubeIcon.mesh.scale.set(
      cubeScale.x * (1 + 0.02 * (1 - easedRelease)),
      cubeScale.y * (1 + 0.02 * (1 - easedRelease)),
      1
    );
  }
}

function animateModeOutline(nextSize) {
  if (!ui.title.userData) return;
  const outlines = {
    3: ui.title.userData.easyBtn?.outline,
    6: ui.title.userData.normalBtn?.outline,
    9: ui.title.userData.hardBtn?.outline,
  };
  const prevSize = currentModeSize;
  currentModeSize = nextSize;
  const prevOutline = outlines[prevSize];
  const nextOutline = outlines[nextSize];
  if (!prevOutline && !nextOutline) return;
  if (prevOutline === nextOutline) {
    if (nextOutline) nextOutline.material.opacity = 1;
    return;
  }
  const prevStart = prevOutline ? prevOutline.material.opacity : 0;
  const nextStart = nextOutline ? nextOutline.material.opacity : 0;
  addAnimation(
    220,
    (t) => {
      const eased = easeInOut(t);
      if (prevOutline) prevOutline.material.opacity = prevStart + (0 - prevStart) * eased;
      if (nextOutline) nextOutline.material.opacity = nextStart + (1 - nextStart) * eased;
    },
    () => {
      if (prevOutline) prevOutline.material.opacity = 0;
      if (nextOutline) nextOutline.material.opacity = 1;
    }
  );
}

function updateAnimations(now) {
  for (let i = animations.length - 1; i >= 0; i--) {
    const anim = animations[i];
    const t = Math.min(1, (now - anim.start) / anim.duration);
    anim.update(t);
    if (t >= 1) {
      anim.complete();
      animations.splice(i, 1);
    }
  }
}

function addAnimation(duration, update, complete) {
  animations.push({
    start: performance.now(),
    duration,
    update,
    complete,
  });
}

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

function setMeshOpacity(mesh, value) {
  if (!mesh) return;
  if (mesh.material) {
    if (Array.isArray(mesh.material)) {
      mesh.material.forEach((material) => {
        material.transparent = true;
        material.opacity = value;
      });
    } else {
      mesh.material.transparent = true;
      mesh.material.opacity = value;
    }
  }
  if (mesh.children && mesh.children.length) {
    mesh.children.forEach((child) => setMeshOpacity(child, value));
  }
}

function captureTitleAnimation() {
  if (!ui.title.userData) return;
  const items = [
    ui.title.userData.titleShadow?.mesh,
    ui.title.userData.title?.mesh,
    ui.title.userData.modeBadgeBg,
    ui.title.userData.modeBadgeText?.mesh,
    ui.title.userData.hyperBadgeBg,
    ui.title.userData.hyperBadgeText?.mesh,
    ui.title.userData.goldLine,
    ui.title.userData.sub?.mesh,
    ui.title.userData.easyBtn?.group,
    ui.title.userData.normalBtn?.group,
    ui.title.userData.hardBtn?.group,
    ui.title.userData.btn?.group,
    ui.title.userData.settingsBtn?.group,
  ].filter(Boolean);
  ui.title.userData.animateItems = items.map((mesh) => ({
    mesh,
    basePos: mesh.position.clone(),
    baseScale: mesh.scale.clone(),
  }));
}

function shuffleArray(list) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
}

function onPointerDown(event) {
  const { x, y } = getPointer(event);
  if (event.pointerType === "touch") {
    touchState.pointers.set(event.pointerId, { x, y, startX: x, startY: y });
    if (touchState.pointers.size >= 2) {
      touchState.moved = true;
      if (touchState.pointers.size === 2) {
        const points = Array.from(touchState.pointers.values());
        pinchStartDist = getPointerDistance(points[0], points[1]);
        pinchStartScale = boardGroup.scale.x || 1;
      }
    }
    if (touchState.pointers.size === 1) {
      isRotating = true;
      lastPointer = { x, y };
    }
    return;
  }
  if (event.button === 2) {
    isRotating = true;
    lastPointer = { x, y };
    return;
  }
  if (state === "title") {
    if (hitButton("modeEasy", x, y)) return;
    if (hitButton("modeNormal", x, y)) return;
    if (hitButton("modeHard", x, y)) return;
    if (hitButton("titleSettings", x, y)) return;
    if (hitButton("titleStart", x, y)) return;
  }
  if (state === "tutorial") {
    if (hitButton("tutorialPlay", x, y)) return;
  }
  if (state === "end") {
    if (hitButton("retry", x, y)) return;
  }
  if (state === "settings") {
    if (hitButton("settingsName", x, y)) return;
    if (hitButton("settingsBack", x, y)) return;
  }
  if (state === "game") {
    if (hitButton("home", x, y)) return;
    if (hitButton("settingsHud", x, y)) return;
  }
  if (state !== "game" || busy) return;
  const id = pickTile(event);
  if (id) {
    handleSelection(id);
  }
}

function onPointerMove(event) {
  const { x, y } = getPointer(event);
  if (event.pointerType === "touch") {
    const pointerState = touchState.pointers.get(event.pointerId);
    if (!pointerState) return;
    pointerState.x = x;
    pointerState.y = y;
    if (touchState.pointers.size >= 2) {
      const points = Array.from(touchState.pointers.values());
      const dist = getPointerDistance(points[0], points[1]);
      if (pinchStartDist > 0) {
        const nextScale = clamp(
          pinchStartScale * (dist / pinchStartDist),
          scaleLimits.min,
          scaleLimits.max
        );
        boardGroup.scale.set(nextScale, nextScale, nextScale);
      }
      touchState.moved = true;
      isRotating = false;
      return;
    }
    const dxTotal = x - pointerState.startX;
    const dyTotal = y - pointerState.startY;
    if (Math.abs(dxTotal) > 8 || Math.abs(dyTotal) > 8) {
      touchState.moved = true;
    }
    if (isRotating) {
      const dx = x - lastPointer.x;
      const dy = y - lastPointer.y;
      applyRotationDelta(dx, dy);
      lastPointer = { x, y };
      touchState.moved = true;
    }
    return;
  }
  if (isRotating) {
    const dx = x - lastPointer.x;
    const dy = y - lastPointer.y;
    applyRotationDelta(dx, dy);
    lastPointer = { x, y };
    return;
  }
  if (state !== "game" || busy) return;
  hoverId = pickTile(event);
}

function onPointerUp(event) {
  if (event.pointerType === "touch") {
    touchState.pointers.delete(event.pointerId);
    if (touchState.pointers.size === 0) {
      if (!touchState.moved) {
        const { x, y } = getPointer(event);
        if (state === "title") {
          if (hitButton("modeEasy", x, y)) return;
          if (hitButton("modeNormal", x, y)) return;
          if (hitButton("modeHard", x, y)) return;
          if (hitButton("titleSettings", x, y)) return;
          if (hitButton("titleStart", x, y)) return;
        }
        if (state === "tutorial") {
          if (hitButton("tutorialPlay", x, y)) return;
        }
        if (state === "end") {
          if (hitButton("retry", x, y)) return;
        }
        if (state === "settings") {
          if (hitButton("settingsName", x, y)) return;
          if (hitButton("settingsBack", x, y)) return;
        }
        if (state === "game") {
          if (hitButton("home", x, y)) return;
          if (hitButton("settingsHud", x, y)) return;
        }
        if (state === "game" && !busy) {
          const id = pickTile(event);
          if (id) {
            handleSelection(id);
          }
        }
      }
      touchState.moved = false;
      isRotating = false;
      pinchStartDist = 0;
    }
    return;
  }
  if (event.button === 2) {
    isRotating = false;
    return;
  }
}

function onWheel(event) {
  if (state !== "game" || !boardGroup) return;
  event.preventDefault();
  event.stopPropagation();
  const current = boardGroup.scale.x || 1;
  const modeScale = event.deltaMode === 1 ? 3 : 1;
  const delta = Math.sign(-event.deltaY) * 0.08 * modeScale;
  const nextScale = clamp(current + delta, scaleLimits.min, scaleLimits.max);
  boardGroup.scale.set(nextScale, nextScale, nextScale);
}

function getPointer(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}

function pickTile(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(tileHitMeshes, false);
  if (hits.length > 0) {
    return hits[0].object.userData.tileId;
  }
  return null;
}

function hitButton(key, x, y) {
  const btn = ui.buttons[key];
  if (!btn) return false;
  const { rect, onClick } = btn;
  if (x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h) {
    onClick();
    return true;
  }
  return false;
}

function updateScreenVisibility() {
  ui.title.visible = state === "title";
  ui.tutorial.visible = state === "tutorial";
  ui.end.visible = state === "end";
  ui.settings.visible = state === "settings";
  boardGroup.visible = state === "game";
  ui.hud.visible = state === "game";
  if (controls) controls.enabled = state === "game";
  if (ui.tip) ui.tip.mesh.visible = state === "game";
  if (ui.combo) ui.combo.mesh.visible = state === "game" && ui.combo.mesh.visible;
}

function buildHud() {
  const scoreCard = createHudCard("スコア", "0");
  const timeCard = createHudCard("時間", "00:00");
  const targetCard = createHudCard("最速", "--");
  const homeBtn = createButton("ホーム", {
    bgColor: "#e7c889",
    textColor: "#2b1b00",
    radius: 24,
    style: "button",
  });
  const settingsBtn = createButton("設定", {
    bgColor: "#e7c889",
    textColor: "#2b1b00",
    radius: 24,
    style: "button",
  });
  ui.hud.add(
    scoreCard.group,
    timeCard.group,
    targetCard.group,
    settingsBtn.group,
    homeBtn.group
  );
  ui.hud.userData = { scoreCard, timeCard, targetCard, homeBtn, settingsBtn };
  ui.buttons.home = {
    rect: { x: 0, y: 0, w: 0, h: 0 },
    onClick: () => {
      goHome();
    },
  };
  ui.buttons.settingsHud = {
    rect: { x: 0, y: 0, w: 0, h: 0 },
    onClick: () => {
      openSettings("game");
    },
  };
}

function layoutHud() {
  const compact = width < 420;
  const cardWidth = compact ? 92 : 120;
  const cardHeight = compact ? 58 : 68;
  const padding = compact ? 12 : 20;
  const gap = compact ? 8 : 14;
  const startX = padding;
  const y = 20;

  const cards = [
    ui.hud.userData.scoreCard,
    ui.hud.userData.timeCard,
    ui.hud.userData.targetCard,
  ];

  cards.forEach((card, idx) => {
    const x = startX + idx * (cardWidth + gap);
    setRect(card.bg, x, y, cardWidth, cardHeight, 2);
    card.label.setPosition(x + 12, y + 8);
    card.value.setPosition(x + 12, y + 32);
  });

  const buttonW = compact ? 96 : 110;
  const buttonH = compact ? 40 : 44;
  const buttonGap = compact ? 8 : 10;
  const buttonsTotal = buttonW * 2 + buttonGap;
  const buttonsLeft = width - padding - buttonsTotal;
  const minLeft = startX + cards.length * (cardWidth + gap) + gap;
  const startButtonsX = clamp(buttonsLeft, padding, Math.max(padding, minLeft));
  const homeY = y + (cardHeight - buttonH) / 2;
  const settingsRect = setRect(
    ui.hud.userData.settingsBtn.bg,
    startButtonsX,
    homeY,
    buttonW,
    buttonH,
    2
  );
  ui.hud.userData.settingsBtn.label.setCentered(
    startButtonsX + buttonW / 2,
    homeY + buttonH / 2
  );
  const homeX = startButtonsX + buttonW + buttonGap;
  const homeRect = setRect(ui.hud.userData.homeBtn.bg, homeX, homeY, buttonW, buttonH, 2);
  ui.hud.userData.homeBtn.label.setCentered(homeX + buttonW / 2, homeY + buttonH / 2);
  ui.buttons.settingsHud.rect = settingsRect;
  ui.buttons.home.rect = homeRect;
}

function updateScore() {
  ui.hud.userData.scoreCard.value.update(String(score));
  layoutHud();
}

function loadBestTime() {
  try {
    const stored = window.localStorage.getItem(bestTimeKey);
    bestTimeMs = stored ? Number(stored) : null;
  } catch {
    bestTimeMs = null;
  }
  updateBestTimeDisplay();
}

function saveBestTime(ms) {
  bestTimeMs = ms;
  try {
    window.localStorage.setItem(bestTimeKey, String(ms));
  } catch {
    // ignore storage errors
  }
  updateBestTimeDisplay();
}

function updateBestTimeDisplay() {
  if (!ui.hud.userData) return;
  const value = bestTimeMs ? formatElapsed(bestTimeMs) : "--";
  ui.hud.userData.targetCard.value.update(value);
  layoutHud();
}

function loadPlayerName() {
  try {
    const stored = window.localStorage.getItem(playerNameKey);
    if (stored && stored.trim()) {
      const normalized = normalizePlayerName(stored);
      if (normalized) {
        playerName = normalized;
      } else {
        needsNameInput = true;
      }
    } else {
      needsNameInput = true;
    }
  } catch {
    needsNameInput = true;
  }
}

function savePlayerName(name) {
  playerName = name;
  try {
    window.localStorage.setItem(playerNameKey, name);
  } catch {
    // ignore storage errors
  }
  updateSettingsNameDisplay();
}

function loadRanking() {
  try {
    const stored = window.localStorage.getItem(rankingKey);
    ranking = stored ? JSON.parse(stored) : [];
    if (!Array.isArray(ranking)) ranking = [];
  } catch {
    ranking = [];
  }
}

function saveRanking() {
  try {
    window.localStorage.setItem(rankingKey, JSON.stringify(ranking));
  } catch {
    // ignore storage errors
  }
}

function addRankingEntry(timeMs) {
  ranking.push({ name: playerName, timeMs });
  ranking.sort((a, b) => a.timeMs - b.timeMs);
  ranking = ranking.slice(0, rankingSize);
  saveRanking();
  updateRankingDisplay();
}

function updateRankingDisplay() {
  if (!ui.end.userData) return;
  ui.end.userData.rankingLines.forEach((line, idx) => {
    const entry = ranking[idx];
    if (entry) {
      line.update(`${idx + 1}. ${entry.name} ${formatElapsed(entry.timeMs)}`);
    } else {
      line.update(`${idx + 1}. ---`);
    }
  });
  layoutEndScreen();
}

function containsEmoji(value) {
  try {
    const emojiRegex = new RegExp("\\p{Extended_Pictographic}", "u");
    return emojiRegex.test(value);
  } catch {
    return /[\uD800-\uDBFF][\uDC00-\uDFFF]/.test(value);
  }
}

function normalizePlayerName(raw) {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const length = Array.from(trimmed).length;
  if (length < 1 || length > 10) return null;
  if (containsEmoji(trimmed)) return null;
  return trimmed;
}

function promptPlayerName({ allowCancel }) {
  while (true) {
    const input = window.prompt("プレイヤー名を入力 (1〜10文字)", playerName);
    if (input === null) {
      return allowCancel ? null : "PLAYER";
    }
    const normalized = normalizePlayerName(input);
    if (normalized === "") return "PLAYER";
    if (normalized) return normalized;
    window.alert("1〜10文字（絵文字NG）で入力してください。");
  }
}

function updateTimer(now) {
  if (state !== "game" || timerStart === 0) return;
  elapsedMs = now - timerStart;
  const text = formatElapsed(elapsedMs);
  if (text !== lastTimerText) {
    ui.hud.userData.timeCard.value.update(text);
    layoutHud();
    lastTimerText = text;
  }
}

function formatElapsed(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function createHudCard(label, value) {
  const group = new THREE.Group();
  const bg = createPanel(theme.hudCard, 0.95);
  const labelText = createTextSprite(label, {
    fontSize: 16,
    color: theme.textMid,
    weight: "700",
  });
  const valueText = createTextSprite(value, {
    fontSize: 24,
    color: theme.textDark,
    weight: "900",
  });
  group.add(bg, labelText.mesh, valueText.mesh);
  return { group, bg, label: labelText, value: valueText };
}

function buildTitleScreen() {
  const overlay = createPanel("#000000", 0.35);
  const panel = createPanel(theme.panel, 0.98, 24, "panel");
  const header = createPanel(theme.accent, 1, 24, "panel");
  const headerGlow = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({
      map: makeHeaderSweepTexture(),
      transparent: true,
      opacity: 0,
    })
  );
  const headerIconOuter = new THREE.Mesh(
    new THREE.CircleGeometry(1, 48),
    new THREE.MeshBasicMaterial({ color: "#ffffff" })
  );
  const headerIconInner = new THREE.Mesh(
    new THREE.CircleGeometry(1, 48),
    new THREE.MeshBasicMaterial({ color: theme.accent })
  );
  const titleShadow = createTextSprite("\u30B0\u30C3\u30BA\u30BD\u30FC\u30C8\u30D1\u30BA\u30EB", {
    fontSize: 28,
    color: "rgba(0,0,0,0.25)",
    weight: "900",
  });
  const title = createTextSprite("\u30B0\u30C3\u30BA\u30BD\u30FC\u30C8\u30D1\u30BA\u30EB", {
    fontSize: 28,
    color: theme.textLight,
    weight: "900",
  });
  const modeBadgeBg = createPanel(theme.textLight, 1, 16, "panel");
  const modeBadgeText = createTextSprite("9x9x9", {
    fontSize: 16,
    color: theme.accent,
    weight: "900",
  });
  const hyperBadgeBg = createPanel(theme.gold, 1, 16, "panel");
  const hyperBadgeText = createTextSprite("HYPER CASUAL", {
    fontSize: 14,
    color: "#1a1a1a",
    weight: "900",
  });
  const goldLine = createPanel(theme.goldLight, 1, 8, "flat");
  const sub = createTextSprite(
    "\u30BF\u30C3\u30D7\u3057\u30663\u3064\u63C3\u3048\u308B\u3060\u3051",
    {
      fontSize: 18,
      color: theme.textMid,
      weight: "700",
    }
  );
  const easyBtn = createButton("かんたん 3x3x3", {
    bgColor: "#e7c889",
    textColor: "#2b1b00",
    radius: 26,
    style: "button",
  });
  const normalBtn = createButton("ふつう 6x6x6", {
    bgColor: "#e7c889",
    textColor: "#2b1b00",
    radius: 26,
    style: "button",
  });
  const hardBtn = createButton("むずかしい 9x9x9", {
    bgColor: "#e7c889",
    textColor: "#2b1b00",
    radius: 26,
    style: "button",
  });
  const btn = createButton("スタート", {
    bgColor: theme.accentStrong,
    textColor: theme.textLight,
    radius: 26,
    style: "button",
  });
  const settingsBtn = createButton("設定", { radius: 24, style: "button" });
  ui.title.add(
    overlay,
    panel,
    header,
    headerGlow,
    headerIconOuter,
    headerIconInner,
    titleShadow.mesh,
    title.mesh,
    modeBadgeBg,
    modeBadgeText.mesh,
    hyperBadgeBg,
    hyperBadgeText.mesh,
    goldLine,
    sub.mesh,
    easyBtn.group,
    easyBtn.outline,
    normalBtn.group,
    normalBtn.outline,
    hardBtn.group,
    hardBtn.outline,
    btn.group,
    settingsBtn.group
  );
  ui.title.userData = {
    overlay,
    panel,
    header,
    headerGlow,
    headerIconOuter,
    headerIconInner,
    titleShadow,
    title,
    modeBadgeBg,
    modeBadgeText,
    hyperBadgeBg,
    hyperBadgeText,
    goldLine,
    sub,
    btn,
    settingsBtn,
    easyBtn,
    normalBtn,
    hardBtn,
    startPulse: 0,
    startBase: { w: 180, h: 56 },
  };
  ui.buttons.titleStart = {
    rect: { x: 0, y: 0, w: 0, h: 0 },
    onClick: () => {
      state = "tutorial";
    },
  };
  ui.buttons.titleSettings = {
    rect: { x: 0, y: 0, w: 0, h: 0 },
    onClick: () => {
      openSettings("title");
    },
  };
  ui.buttons.modeEasy = {
    rect: { x: 0, y: 0, w: 0, h: 0 },
    onClick: () => {
      setMode("Easy", 3);
    },
  };
  ui.buttons.modeNormal = {
    rect: { x: 0, y: 0, w: 0, h: 0 },
    onClick: () => {
      setMode("Normal", 6);
    },
  };
  ui.buttons.modeHard = {
    rect: { x: 0, y: 0, w: 0, h: 0 },
    onClick: () => {
      setMode("Hard", 9);
    },
  };
}

function layoutTitleScreen() {
  const overlay = ui.title.userData.overlay;
  setRect(overlay, 0, 0, width, height, 50);
  const panelW = Math.min(560, width - 40);
  const panelH = 380;
  const panelX = (width - panelW) / 2;
  const panelY = (height - panelH) / 2;
  setRect(ui.title.userData.panel, panelX, panelY, panelW, panelH, 60);
  const headerRect = setRect(
    ui.title.userData.header,
    panelX,
    panelY,
    panelW,
    64,
    65
  );
  ui.title.userData.header.position.z = 65;
  setRect(ui.title.userData.headerGlow, panelX - 120, panelY, 120, 64, 66);
  ui.title.userData.headerGlow.material.opacity = 0;
  setCircle(
    ui.title.userData.headerIconOuter,
    headerRect.x + 44,
    headerRect.y + 32,
    16,
    66
  );
  setCircle(
    ui.title.userData.headerIconInner,
    headerRect.x + 44,
    headerRect.y + 32,
    7,
    67
  );
  const titleSize = ui.title.userData.title.mesh.userData.size;
  const titleX = panelX + panelW / 2;
  const titleY = panelY + 16 + titleSize.h / 2;
  ui.title.userData.titleShadow.setCentered(titleX + 2, titleY + 2);
  const subSize = ui.title.userData.sub.mesh.userData.size;
  ui.title.userData.title.setCentered(
    titleX,
    titleY
  );
  const badgeW = 96;
  const badgeH = 26;
  setRect(ui.title.userData.modeBadgeBg, panelX + panelW - badgeW - 20, panelY + 18, badgeW, badgeH, 70);
  ui.title.userData.modeBadgeText.setCentered(
    panelX + panelW - badgeW / 2 - 20,
    panelY + 31
  );
  const hyperW = 130;
  const hyperH = 24;
  setRect(ui.title.userData.hyperBadgeBg, panelX + 24, panelY + 86, hyperW, hyperH, 60);
  ui.title.userData.hyperBadgeText.setCentered(panelX + 24 + hyperW / 2, panelY + 98);
  setRect(ui.title.userData.goldLine, panelX + 24, panelY + 120, panelW - 48, 6, 55);
  ui.title.userData.sub.setCentered(
    panelX + panelW / 2,
    panelY + 128 + subSize.h / 2
  );
  const buttonW = 180;
  const buttonH = 44;
  const buttonGap = 12;
  const startY = panelY + 170;
  const centerX = panelX + panelW / 2;
  const easyRect = setRect(
    ui.title.userData.easyBtn.bg,
    centerX - buttonW / 2,
    startY,
    buttonW,
    buttonH,
    65
  );
  ui.title.userData.easyBtn.label.setCentered(centerX, startY + 22);
  const easyOutlineRect = setRect(
    ui.title.userData.easyBtn.outline,
    centerX - buttonW / 2 - 3,
    startY - 3,
    buttonW + 6,
    buttonH + 6,
    66
  );
  const normalRect = setRect(
    ui.title.userData.normalBtn.bg,
    centerX - buttonW / 2,
    startY + buttonH + buttonGap,
    buttonW,
    buttonH,
    65
  );
  ui.title.userData.normalBtn.label.setCentered(
    centerX,
    startY + buttonH + buttonGap + 22
  );
  const normalOutlineRect = setRect(
    ui.title.userData.normalBtn.outline,
    centerX - buttonW / 2 - 3,
    startY + buttonH + buttonGap - 3,
    buttonW + 6,
    buttonH + 6,
    66
  );
  const hardRect = setRect(
    ui.title.userData.hardBtn.bg,
    centerX - buttonW / 2,
    startY + (buttonH + buttonGap) * 2,
    buttonW,
    buttonH,
    65
  );
  ui.title.userData.hardBtn.label.setCentered(
    centerX,
    startY + (buttonH + buttonGap) * 2 + 22
  );
  const hardOutlineRect = setRect(
    ui.title.userData.hardBtn.outline,
    centerX - buttonW / 2 - 3,
    startY + (buttonH + buttonGap) * 2 - 3,
    buttonW + 6,
    buttonH + 6,
    66
  );
  const startYOutside = panelY + panelH + 18;
  const btnRect = setRect(
    ui.title.userData.btn.bg,
    centerX - 90,
    startYOutside,
    180,
    56,
    65
  );
  ui.title.userData.btn.label.setCentered(centerX, startYOutside + 28);
  const settingsRect = setRect(
    ui.title.userData.settingsBtn.bg,
    centerX - 70,
    startYOutside + 68,
    140,
    44,
    65
  );
  ui.title.userData.settingsBtn.label.setCentered(centerX, startYOutside + 90);
  ui.buttons.titleStart.rect = btnRect;
  ui.buttons.titleSettings.rect = settingsRect;
  ui.buttons.modeEasy.rect = easyRect;
  ui.buttons.modeNormal.rect = normalRect;
  ui.buttons.modeHard.rect = hardRect;
  setModeOutlineImmediate();
  captureTitleAnimation();
}

function buildTutorialScreen() {
  const overlay = createPanel("#000000", 0.35);
  const panel = createPanel(theme.panel, 0.98, 24, "panel");
  const title = createTextSprite("\u30C1\u30E5\u30FC\u30C8\u30EA\u30A2\u30EB", {
    fontSize: 24,
    color: theme.textDark,
    weight: "900",
  });
  const iconGroup = new THREE.Group();
  const cubeIcon = createIconSprite(makeCubeIconTexture());
  const handIcon = createIconSprite(makeHandIconTexture());
  iconGroup.add(cubeIcon.mesh, handIcon.mesh);
  const step1 = createTextSprite(
    "\u30BF\u30A4\u30EB\u3092\u30AF\u30EA\u30C3\u30AF\u3057\u30663\u3064\u9078\u629E",
    {
      fontSize: 20,
      color: theme.textDark,
      weight: "800",
    }
  );
  const step2 = createTextSprite(
    "\u540C\u3058\u30D5\u30EB\u30FC\u30C4\u3067\u3042\u308C\u3070\u6D88\u53BB",
    {
      fontSize: 20,
      color: theme.textDark,
      weight: "800",
    }
  );
  const step3 = createTextSprite(
    "\u3069\u3053\u3067\u3082OK\u30FB3\u3064\u63C3\u3048\u308B\u3068\u52A0\u70B9",
    {
      fontSize: 20,
      color: theme.textDark,
      weight: "800",
    }
  );
  const btn = createButton("プレイ");
  ui.tutorial.add(
    overlay,
    panel,
    title.mesh,
    iconGroup,
    step1.mesh,
    step2.mesh,
    step3.mesh,
    btn.group
  );
  ui.tutorial.userData = {
    overlay,
    panel,
    title,
    iconGroup,
    cubeIcon,
    handIcon,
    step1,
    step2,
    step3,
    btn,
  };
  ui.buttons.tutorialPlay = {
    rect: { x: 0, y: 0, w: 0, h: 0 },
    onClick: () => {
      startGame();
    },
  };
}

function layoutTutorialScreen() {
  const overlay = ui.tutorial.userData.overlay;
  setRect(overlay, 0, 0, width, height, 50);
  const panelW = Math.min(620, width - 40);
  const panelH = 360;
  const panelX = (width - panelW) / 2;
  const panelY = (height - panelH) / 2;
  setRect(ui.tutorial.userData.panel, panelX, panelY, panelW, panelH, 60);
  ui.tutorial.userData.title.setPosition(panelX + 24, panelY + 24);
  const iconCenterX = panelX + panelW / 2;
  const iconCenterY = panelY + 90;
  ui.tutorial.userData.iconGroup.position.set(0, 0, 0);
  ui.tutorial.userData.cubeIcon.setCentered(iconCenterX - 60, iconCenterY);
  ui.tutorial.userData.handIcon.setCentered(iconCenterX + 20, iconCenterY + 8);
  ui.tutorial.userData.iconBase = {
    cubePos: ui.tutorial.userData.cubeIcon.mesh.position.clone(),
    handPos: ui.tutorial.userData.handIcon.mesh.position.clone(),
    cubeScale: ui.tutorial.userData.cubeIcon.mesh.scale.clone(),
    handScale: ui.tutorial.userData.handIcon.mesh.scale.clone(),
  };
  ui.tutorial.userData.step1.setPosition(panelX + 24, panelY + 140);
  ui.tutorial.userData.step2.setPosition(panelX + 24, panelY + 190);
  ui.tutorial.userData.step3.setPosition(panelX + 24, panelY + 240);
  const btnRect = setRect(
    ui.tutorial.userData.btn.bg,
    panelX + panelW / 2 - 90,
    panelY + 290,
    180,
    56,
    65
  );
  ui.tutorial.userData.btn.label.setCentered(
    panelX + panelW / 2,
    panelY + 318
  );
  ui.buttons.tutorialPlay.rect = btnRect;
}

function buildSettingsScreen() {
  const overlay = createPanel("#000000", 0.35);
  const panel = createPanel(theme.panel, 0.98, 24, "panel");
  const title = createTextSprite("設定", {
    fontSize: 24,
    color: theme.textDark,
    weight: "900",
  });
  const nameLabel = createTextSprite("プレイヤー名", {
    fontSize: 18,
    color: theme.textMid,
    weight: "800",
  });
  const nameValue = createTextSprite(playerName, {
    fontSize: 22,
    color: theme.textDark,
    weight: "900",
  });
  const changeBtn = createButton("名前変更", { radius: 24, style: "button" });
  const backBtn = createButton("ゲームに戻る", { radius: 22, style: "button" });
  ui.settings.add(
    overlay,
    panel,
    title.mesh,
    nameLabel.mesh,
    nameValue.mesh,
    changeBtn.group,
    backBtn.group
  );
  ui.settings.userData = { overlay, panel, title, nameLabel, nameValue, changeBtn, backBtn };
  ui.buttons.settingsName = {
    rect: { x: 0, y: 0, w: 0, h: 0 },
    onClick: () => {
      const next = promptPlayerName({ allowCancel: true });
      if (next) savePlayerName(next);
    },
  };
  ui.buttons.settingsBack = {
    rect: { x: 0, y: 0, w: 0, h: 0 },
    onClick: () => {
      state = settingsReturnState;
    },
  };
}

function layoutSettingsScreen() {
  const overlay = ui.settings.userData.overlay;
  setRect(overlay, 0, 0, width, height, 50);
  const panelW = Math.min(420, width - 40);
  const panelH = 260;
  const panelX = (width - panelW) / 2;
  const panelY = (height - panelH) / 2;
  setRect(ui.settings.userData.panel, panelX, panelY, panelW, panelH, 60);
  ui.settings.userData.title.setPosition(panelX + 24, panelY + 28);
  ui.settings.userData.nameLabel.setPosition(panelX + 24, panelY + 88);
  ui.settings.userData.nameValue.setPosition(panelX + 24, panelY + 118);
  const changeRect = setRect(
    ui.settings.userData.changeBtn.bg,
    panelX + panelW / 2 - 90,
    panelY + 160,
    180,
    48,
    65
  );
  ui.settings.userData.changeBtn.label.setCentered(panelX + panelW / 2, panelY + 184);
  const backRect = setRect(
    ui.settings.userData.backBtn.bg,
    panelX + panelW / 2 - 70,
    panelY + panelH - 60,
    140,
    42,
    65
  );
  ui.settings.userData.backBtn.label.setCentered(panelX + panelW / 2, panelY + panelH - 39);
  ui.buttons.settingsName.rect = changeRect;
  ui.buttons.settingsBack.rect = backRect;
}

function updateSettingsNameDisplay() {
  if (!ui.settings.userData) return;
  ui.settings.userData.nameValue.update(playerName);
  layoutSettingsScreen();
}

function openSettings(returnState) {
  settingsReturnState = returnState || "title";
  updateSettingsNameDisplay();
  state = "settings";
}

function buildEndScreen() {
  const overlay = createPanel("#000000", 0.35);
  const panel = createPanel(theme.panel, 0.95, 24, "panel");
  const title = createTextSprite("結果", {
    fontSize: 24,
    color: theme.textDark,
    weight: "900",
  });
  const result = createTextSprite("スコア: 0", {
    fontSize: 20,
    color: theme.textDark,
    weight: "800",
  });
  const rankingTitle = createTextSprite("ランキング", {
    fontSize: 20,
    color: theme.textDark,
    weight: "800",
  });
  const rankingLines = [];
  for (let i = 0; i < rankingSize; i++) {
    rankingLines.push(
      createTextSprite(`${i + 1}. ---`, {
        fontSize: 18,
        color: i === 0 ? theme.accent : theme.textMid,
        weight: "700",
      })
    );
  }
  const btn = createButton("もう一度");
  ui.end.add(
    overlay,
    panel,
    title.mesh,
    result.mesh,
    rankingTitle.mesh,
    btn.group
  );
  rankingLines.forEach((line) => ui.end.add(line.mesh));
  ui.end.userData = {
    overlay,
    panel,
    title,
    result,
    rankingTitle,
    rankingLines,
    btn,
  };
  ui.buttons.retry = {
    rect: { x: 0, y: 0, w: 0, h: 0 },
    onClick: () => {
      startGame();
    },
  };
}

function layoutEndScreen() {
  const overlay = ui.end.userData.overlay;
  setRect(overlay, 0, 0, width, height, 50);
  const panelW = Math.min(480, width - 40);
  const panelH = 460;
  const panelX = (width - panelW) / 2;
  const panelY = (height - panelH) / 2;
  setRect(ui.end.userData.panel, panelX, panelY, panelW, panelH, 60);
  ui.end.userData.title.setPosition(panelX + 24, panelY + 24);
  ui.end.userData.result.setPosition(panelX + 24, panelY + 70);
  ui.end.userData.rankingTitle.setPosition(panelX + 24, panelY + 120);
  const listStartY = panelY + 150;
  const lineGap = 22;
  ui.end.userData.rankingLines.forEach((line, idx) => {
    line.setPosition(panelX + 24, listStartY + idx * lineGap);
  });
  const btnRect = setRect(
    ui.end.userData.btn.bg,
    panelX + panelW / 2 - 80,
    panelY + panelH - 66,
    160,
    52,
    65
  );
  ui.end.userData.btn.label.setCentered(panelX + panelW / 2, panelY + panelH - 40);
  ui.buttons.retry.rect = btnRect;
}

function buildTip() {
  ui.tip = createTextSprite(
    "同じフルーツを3つ選んで消そう。",
    {
      fontSize: 18,
      color: theme.accent,
      weight: "700",
    }
  );
  scene.add(ui.tip.mesh);
}

function layoutTip() {
  if (!ui.tip) return;
  const compact = width < 420;
  const inset = compact ? Math.min(height * 0.18, 120) : 40;
  ui.tip.setCentered(width / 2, height - inset);
}

function buildCombo() {
  ui.combo = createTextSprite("", {
    fontSize: 42,
    color: "#ffffff",
    weight: "900",
    glow: true,
  });
  ui.combo.mesh.visible = false;
  scene.add(ui.combo.mesh);
}

function layoutCombo() {
  if (!ui.combo) return;
  ui.combo.setCentered(width / 2, height / 2);
}

function showComboText(count) {
  const labels = ["ナイス！", "グレート！", "すごい！", "ファンタスティック！", "レジェンド！"];
  const label = labels[Math.min(labels.length - 1, count - 1)];
  ui.combo.update(`${label} +${count}`);
  layoutCombo();
  ui.combo.mesh.visible = true;
  ui.combo.mesh.material.opacity = 1;
  const startScale = new THREE.Vector3(0.6, 0.6, 1);
  const endScale = new THREE.Vector3(1.2, 1.2, 1);
  ui.combo.mesh.scale.copy(startScale);
  addAnimation(520, (t) => {
    const eased = easeInOut(t);
    ui.combo.mesh.scale.lerpVectors(startScale, endScale, eased);
    ui.combo.mesh.material.opacity = 1 - t;
  }, () => {
    ui.combo.mesh.visible = false;
  });
}

function startGame() {
  state = "game";
  score = 0;
  comboCount = 0;
  selectedIds = [];
  hoverId = null;
  busy = false;
  timerStart = performance.now();
  elapsedMs = 0;
  lastTimerText = "";
  ui.hud.userData.timeCard.value.update("00:00");
  updateScore();
  createBoard();
  syncTiles();
  layoutTiles();
}

function goHome() {
  state = "title";
  busy = false;
  selectedIds = [];
  hoverId = null;
  timerStart = 0;
  elapsedMs = 0;
  lastTimerText = "";
  if (ui.combo) ui.combo.mesh.visible = false;
  layout();
}

function setMode(label, size) {
  modeLabel = label;
  cubeSize = size;
  const badgeText = ui.title.userData.modeBadgeText;
  if (badgeText) badgeText.update(`${size}x${size}x${size}`);
  animateModeOutline(size);
  layout();
  createBoard();
  syncTiles();
  layoutTiles();
}

function endGame() {
  state = "end";
  playClearEffect();
  const result = ui.end.userData.result;
  if (result) result.update(`スコア: ${score}  時間: ${formatElapsed(elapsedMs)}`);
  if (needsNameInput) {
    const next = promptPlayerName({ allowCancel: false });
    savePlayerName(next);
    needsNameInput = false;
  }
  addRankingEntry(elapsedMs);
  if (!bestTimeMs || elapsedMs < bestTimeMs) {
    saveBestTime(elapsedMs);
  }
  layoutEndScreen();
}

function playClearEffect() {
  const overlay = ui.end.userData.overlay;
  const panel = ui.end.userData.panel;
  overlay.material.opacity = 0;
  panel.material.opacity = 0;
  addAnimation(
    520,
    (t) => {
      const eased = easeInOut(t);
      overlay.material.opacity = 0.5 * eased;
      panel.material.opacity = 0.95 * eased;
    },
    () => {}
  );
}

function checkClear() {
  if (state !== "game") return;
  const remaining = board.some((tileObj) => tileObj);
  if (!remaining || tileMeshes.size === 0) {
    endGame();
  }
}

function findIndexById(id) {
  const mapped = tileIndexMap.get(id);
  if (mapped !== undefined) return mapped;
  for (let i = 0; i < board.length; i++) {
    const tile = board[i];
    if (tile && tile.id === id) return i;
  }
  return undefined;
}

function playMatchSound(count) {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  const base = 340 + count * 10;
  osc.type = "triangle";
  osc.frequency.setValueAtTime(base, now);
  osc.frequency.exponentialRampToValueAtTime(base * 1.6, now + 0.12);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.16, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start(now);
  osc.stop(now + 0.2);
}

function createBackground() {
  const plane = createPanel("#ffffff", 1, 0, "flat");
  const texture = makeGradientTexture();
  plane.material.map = texture;
  plane.material.needsUpdate = true;
  return plane;
}

function makeGradientTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createLinearGradient(0, 0, 512, 512);
  gradient.addColorStop(0, theme.bgGradient[0]);
  gradient.addColorStop(0.5, theme.bgGradient[1]);
  gradient.addColorStop(1, theme.bgGradient[2]);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 512, 512);
  ctx.globalAlpha = 0.2;
  for (let i = 0; i < 28; i++) {
    const radius = 14 + Math.random() * 28;
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 0.15;
  for (let i = 0; i < 140; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    ctx.fillStyle = "#dcdcdc";
    ctx.fillRect(x, y, 2, 2);
  }
  ctx.globalAlpha = 1;
  return new THREE.CanvasTexture(canvas);
}

function makeHeaderSweepTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
  gradient.addColorStop(0, "rgba(255,255,255,0)");
  gradient.addColorStop(0.4, "rgba(255,255,255,0.18)");
  gradient.addColorStop(0.55, "rgba(255,255,255,0.5)");
  gradient.addColorStop(0.7, "rgba(255,255,255,0.12)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return new THREE.CanvasTexture(canvas);
}

function createBoardFrame() {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const edges = new THREE.EdgesGeometry(geometry);
  return new THREE.LineSegments(
    edges,
    new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 })
  );
}

function createPanel(color, opacity, radius = 18, style = "panel") {
  const texture = makeRoundedPanelTexture(color, radius, style);
  return new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity,
    })
  );
}

function hexToRgb(hex) {
  const value = hex.replace("#", "");
  if (value.length !== 6) return { r: 255, g: 255, b: 255 };
  const num = parseInt(value, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

function adjustHexColor(hex, amount) {
  const { r, g, b } = hexToRgb(hex);
  const clampChannel = (val) => Math.max(0, Math.min(255, val));
  const next = {
    r: clampChannel(Math.round(r + 255 * amount)),
    g: clampChannel(Math.round(g + 255 * amount)),
    b: clampChannel(Math.round(b + 255 * amount)),
  };
  return `rgb(${next.r}, ${next.g}, ${next.b})`;
}

function makeRoundedPanelTexture(color, radius, style) {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, size, size);
  const r = Math.max(4, Math.min(radius, size / 2));
  if (style === "outline") {
    ctx.shadowColor = "rgba(255,255,255,0.6)";
    ctx.shadowBlur = 16;
    ctx.strokeStyle = "rgba(255,255,255,0.8)";
    ctx.lineWidth = 6;
    ctx.beginPath();
    roundedRect(ctx, 10, 10, size - 20, size - 20, r);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgba(217,179,108,0.9)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    roundedRect(ctx, 12, 12, size - 24, size - 24, r);
    ctx.stroke();
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }
  if (style !== "flat") {
    ctx.shadowColor = theme.panelShadow;
    ctx.shadowBlur = style === "panel" ? 16 : 12;
    ctx.shadowOffsetY = style === "panel" ? 6 : 4;
  }
  if (style === "button") {
    const top = adjustHexColor(color, 0.12);
    const bottom = adjustHexColor(color, -0.08);
    const gradient = ctx.createLinearGradient(0, 0, 0, size);
    gradient.addColorStop(0, top);
    gradient.addColorStop(1, bottom);
    ctx.fillStyle = gradient;
  } else if (style === "mode") {
    const top = adjustHexColor(color, 0.06);
    const bottom = adjustHexColor(color, -0.04);
    const gradient = ctx.createLinearGradient(0, 0, 0, size);
    gradient.addColorStop(0, top);
    gradient.addColorStop(1, bottom);
    ctx.fillStyle = gradient;
  } else {
    ctx.fillStyle = color;
  }
  ctx.beginPath();
  roundedRect(ctx, 8, 8, size - 16, size - 16, r);
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  if (style !== "flat") {
    if (style === "panel" || style === "mode" || style === "button") {
      const gradient = ctx.createLinearGradient(0, 0, 0, size * 0.7);
      gradient.addColorStop(0, "rgba(255,255,255,0.7)");
      gradient.addColorStop(0.42, "rgba(255,255,255,0.2)");
      gradient.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = gradient;
      ctx.beginPath();
      roundedRect(ctx, 16, 16, size - 32, size * 0.45, r * 0.7);
      ctx.fill();
    }
    if (style === "button") {
      const sheen = ctx.createLinearGradient(0, 0, size, 0);
      sheen.addColorStop(0, "rgba(255,255,255,0)");
      sheen.addColorStop(0.42, "rgba(255,255,255,0.2)");
      sheen.addColorStop(0.54, "rgba(255,255,255,0.5)");
      sheen.addColorStop(0.68, "rgba(255,255,255,0.16)");
      sheen.addColorStop(1, "rgba(255,255,255,0)");
      ctx.save();
      ctx.translate(size * 0.12, size * 0.02);
      ctx.rotate(-0.12);
      ctx.fillStyle = sheen;
      ctx.beginPath();
      roundedRect(ctx, 20, 30, size - 40, size * 0.4, r * 0.7);
      ctx.fill();
      ctx.restore();
    }
    if (style === "button") {
      ctx.strokeStyle = "rgba(0,0,0,0.08)";
      ctx.lineWidth = 2;
    } else {
      ctx.strokeStyle = style === "mode" ? "rgba(0,0,0,0.1)" : theme.panelStroke;
      ctx.lineWidth = style === "panel" ? 3 : 2;
    }
    ctx.beginPath();
    roundedRect(ctx, 10, 10, size - 20, size - 20, r);
    ctx.stroke();
    if (style === "button") {
      ctx.strokeStyle = "rgba(0,0,0,0.12)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      roundedRect(ctx, 12, 20, size - 24, size - 36, r * 0.7);
      ctx.stroke();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

function roundedRect(ctx, x, y, w, h, r) {
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
}

function createButton(label, options = {}) {
  const bgColor = options.bgColor || theme.button;
  const textColor = options.textColor || theme.buttonText;
  const fontSize = options.fontSize || 22;
  const radius = options.radius ?? 22;
  const style = options.style || "button";
  const bg = createPanel(bgColor, 1, radius, style);
  const labelText = createTextSprite(label, {
    fontSize,
    color: textColor,
    weight: "900",
  });
  const outline = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({
      map: makeRoundedPanelTexture("rgba(0,0,0,0)", radius, "outline"),
      transparent: true,
      opacity: 0,
    })
  );
  const group = new THREE.Group();
  group.add(bg, labelText.mesh);
  return { group, bg, label: labelText, outline };
}

function createTextSprite(text, options) {
  const settings = {
    fontSize: options.fontSize || 24,
    color: options.color || theme.textDark,
    weight: options.weight || "700",
    glow: options.glow || false,
  };
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const padding = 12;
  ctx.font = `${settings.weight} ${settings.fontSize}px "Hiragino Kaku Gothic ProN", "Yu Gothic", "Meiryo", "Trebuchet MS", sans-serif`;
  const metrics = ctx.measureText(text);
  const textWidth = Math.ceil(metrics.width);
  const textHeight = Math.ceil(settings.fontSize * 1.2);
  canvas.width = textWidth + padding * 2;
  canvas.height = textHeight + padding * 2;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = `${settings.weight} ${settings.fontSize}px "Hiragino Kaku Gothic ProN", "Yu Gothic", "Meiryo", "Trebuchet MS", sans-serif`;
  ctx.textBaseline = "top";
  if (settings.glow) {
    ctx.shadowColor = "rgba(255, 255, 255, 0.8)";
    ctx.shadowBlur = 16;
  }
  ctx.fillStyle = settings.color;
  ctx.fillText(text, padding, padding);
  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);

  mesh.userData.size = { w: canvas.width, h: canvas.height };
  return {
    mesh,
    update(value) {
      updateTextTexture(mesh, value, settings);
    },
    setPosition(x, y) {
      const { w, h } = mesh.userData.size;
      setRect(mesh, x, y, w, h, 80);
    },
    setCentered(cx, cy) {
      const { w, h } = mesh.userData.size;
      setRect(mesh, cx - w / 2, cy - h / 2, w, h, 80);
    },
  };
}

function updateTextTexture(mesh, text, settings) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const padding = 12;
  ctx.font = `${settings.weight} ${settings.fontSize}px "Hiragino Kaku Gothic ProN", "Yu Gothic", "Meiryo", "Trebuchet MS", sans-serif`;
  const metrics = ctx.measureText(text);
  const textWidth = Math.ceil(metrics.width);
  const textHeight = Math.ceil(settings.fontSize * 1.2);
  canvas.width = textWidth + padding * 2;
  canvas.height = textHeight + padding * 2;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = `${settings.weight} ${settings.fontSize}px "Hiragino Kaku Gothic ProN", "Yu Gothic", "Meiryo", "Trebuchet MS", sans-serif`;
  ctx.textBaseline = "top";
  if (settings.glow) {
    ctx.shadowColor = "rgba(255, 255, 255, 0.8)";
    ctx.shadowBlur = 16;
  }
  ctx.fillStyle = settings.color;
  ctx.fillText(text, padding, padding);
  const texture = new THREE.CanvasTexture(canvas);
  mesh.material.map = texture;
  mesh.material.needsUpdate = true;
  mesh.scale.set(canvas.width, canvas.height, 1);
  mesh.userData.size = { w: canvas.width, h: canvas.height };
}

function createIconSprite(texture) {
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
  const size = { w: texture.image.width, h: texture.image.height };
  mesh.userData.size = size;
  return {
    mesh,
    setPosition(x, y) {
      setRect(mesh, x, y, size.w, size.h, 80);
    },
    setCentered(cx, cy) {
      setRect(mesh, cx - size.w / 2, cy - size.h / 2, size.w, size.h, 80);
    },
  };
}

function makeCubeIconTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const centerX = 64;
  const centerY = 68;
  const size = 34;
  const top = [
    { x: centerX, y: centerY - size },
    { x: centerX + size, y: centerY - size * 0.4 },
    { x: centerX, y: centerY + size * 0.2 },
    { x: centerX - size, y: centerY - size * 0.4 },
  ];
  const left = [
    { x: centerX - size, y: centerY - size * 0.4 },
    { x: centerX, y: centerY + size * 0.2 },
    { x: centerX, y: centerY + size * 1.2 },
    { x: centerX - size, y: centerY + size * 0.6 },
  ];
  const right = [
    { x: centerX + size, y: centerY - size * 0.4 },
    { x: centerX, y: centerY + size * 0.2 },
    { x: centerX, y: centerY + size * 1.2 },
    { x: centerX + size, y: centerY + size * 0.6 },
  ];
  ctx.fillStyle = theme.accent;
  ctx.beginPath();
  top.forEach((p, idx) => {
    if (idx === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = adjustHexColor(theme.accent, -0.1);
  ctx.beginPath();
  left.forEach((p, idx) => {
    if (idx === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = adjustHexColor(theme.accent, -0.2);
  ctx.beginPath();
  right.forEach((p, idx) => {
    if (idx === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.2)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  [...top, ...right, ...left].forEach((p, idx) => {
    if (idx === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
  ctx.stroke();
  return new THREE.CanvasTexture(canvas);
}

function makeHandIconTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "rgba(0,0,0,0.18)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  roundedRect(ctx, 34, 40, 60, 46, 16);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.fillStyle = "#ffffff";
  ctx.arc(54, 34, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "rgba(0,0,0,0.08)";
  ctx.beginPath();
  roundedRect(ctx, 40, 52, 48, 28, 12);
  ctx.fill();
  return new THREE.CanvasTexture(canvas);
}

function setRect(mesh, x, y, w, h, z = 0) {
  mesh.scale.set(w, h, 1);
  mesh.position.set(x + w / 2, height - (y + h / 2), z);
  return { x, y, w, h };
}

function setCircle(mesh, cx, cy, radius, z = 0) {
  mesh.scale.set(radius, radius, 1);
  mesh.position.set(cx, height - cy, z);
}

function applyRotationDelta(dx, dy) {
  if (!boardGroup) return;
  rotationQuats.y.setFromAxisAngle(rotationAxes.y, dx * rotateSpeed);
  rotationQuats.x.setFromAxisAngle(rotationAxes.x, dy * rotateSpeed);
  boardGroup.quaternion.premultiply(rotationQuats.y);
  boardGroup.quaternion.premultiply(rotationQuats.x);
}

function applyRotation() {
  if (!boardGroup) return;
  const euler = new THREE.Euler(-0.6, 0.6, 0.08, "YXZ");
  boardGroup.quaternion.setFromEuler(euler);
}

function getPointerDistance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
