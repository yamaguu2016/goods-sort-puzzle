const THREE = window.THREE;
const OrbitControls = window.OrbitControls;
let cubeSize = 9;
const selectionGoal = 3;
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
  apple: "#ff7ad9",
  orange: "#ff9f4f",
  grape: "#7a6bff",
  banana: "#ffd36b",
  cherry: "#ff6b8b",
  lemon: "#00d6ff",
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
  buildTip();
  buildCombo();

  scene.add(ui.hud, ui.title, ui.tutorial, ui.end);

  createBoard();
  syncTiles();
  layout();

  window.addEventListener("resize", layout);
  renderer.domElement.addEventListener("pointerdown", onPointerDown);
  renderer.domElement.addEventListener("pointermove", onPointerMove);
  renderer.domElement.addEventListener("pointerup", onPointerUp);
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
  boardGroup.rotation.set(-0.6, 0.6, 0.08);
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
  updateTitleButtonPulse(now);
  updateScreenVisibility();
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
    if (hitButton("titleStart", x, y)) return;
  }
  if (state === "tutorial") {
    if (hitButton("tutorialPlay", x, y)) return;
  }
  if (state === "end") {
    if (hitButton("retry", x, y)) return;
  }
  if (state === "game") {
    if (hitButton("home", x, y)) return;
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
      boardGroup.rotation.y += dx * rotateSpeed;
      boardGroup.rotation.x += dy * rotateSpeed;
      boardGroup.rotation.x = Math.max(-1.2, Math.min(0.2, boardGroup.rotation.x));
      lastPointer = { x, y };
      touchState.moved = true;
    }
    return;
  }
  if (isRotating) {
    const dx = x - lastPointer.x;
    const dy = y - lastPointer.y;
    boardGroup.rotation.y += dx * rotateSpeed;
    boardGroup.rotation.x += dy * rotateSpeed;
    boardGroup.rotation.x = Math.max(-1.2, Math.min(0.2, boardGroup.rotation.x));
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
          if (hitButton("titleStart", x, y)) return;
        }
        if (state === "tutorial") {
          if (hitButton("tutorialPlay", x, y)) return;
        }
        if (state === "end") {
          if (hitButton("retry", x, y)) return;
        }
        if (state === "game") {
          if (hitButton("home", x, y)) return;
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
  boardGroup.visible = state === "game";
  ui.hud.visible = state === "game";
  if (controls) controls.enabled = state === "game";
  if (ui.tip) ui.tip.mesh.visible = state === "game";
  if (ui.combo) ui.combo.mesh.visible = state === "game" && ui.combo.mesh.visible;
}

function buildHud() {
  const scoreCard = createHudCard("スコア", "0");
  const timeCard = createHudCard("時間", "--");
  const targetCard = createHudCard("目標", "--");
  const homeBtn = createButton("ホーム");
  homeBtn.bg.material.color.set("#ffffff");
  ui.hud.add(scoreCard.group, timeCard.group, targetCard.group, homeBtn.group);
  ui.hud.userData = { scoreCard, timeCard, targetCard, homeBtn };
  ui.buttons.home = {
    rect: { x: 0, y: 0, w: 0, h: 0 },
    onClick: () => {
      goHome();
    },
  };
}

function layoutHud() {
  const compact = width < 420;
  const cardWidth = compact ? 92 : 120;
  const cardHeight = compact ? 52 : 60;
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
    card.label.setPosition(x + 12, y + 10);
    card.value.setPosition(x + 12, y + 30);
  });

  const buttonW = compact ? 96 : 110;
  const buttonH = compact ? 40 : 44;
  const homeRight = width - padding - buttonW;
  const homeLeft = startX + cards.length * (cardWidth + gap) + gap;
  const homeX = clamp(homeLeft, padding, Math.max(padding, homeRight));
  const homeY = y + (cardHeight - buttonH) / 2;
  const btnRect = setRect(ui.hud.userData.homeBtn.bg, homeX, homeY, buttonW, buttonH, 2);
  ui.hud.userData.homeBtn.label.setCentered(homeX + buttonW / 2, homeY + buttonH / 2);
  ui.buttons.home.rect = btnRect;
}

function updateScore() {
  ui.hud.userData.scoreCard.value.update(String(score));
  layoutHud();
}

function createHudCard(label, value) {
  const group = new THREE.Group();
  const bg = createPanel("#ffffffff", 0.95);
  const labelText = createTextSprite(label, {
    fontSize: 18,
    color: "#2b2233",
    weight: "700",
  });
  const valueText = createTextSprite(value, {
    fontSize: 26,
    color: "#1a0f2e",
    weight: "900",
  });
  group.add(bg, labelText.mesh, valueText.mesh);
  return { group, bg, label: labelText, value: valueText };
}

function buildTitleScreen() {
  const overlay = createPanel("#000000", 0.5);
  const panel = createPanel("#ffffff", 0.96);
  const title = createTextSprite(
    "\u30B0\u30C3\u30BA\u30BD\u30FC\u30C8\u30D1\u30BA\u30EB 9x9x9",
    {
      fontSize: 26,
      color: "#2b2233",
      weight: "900",
    }
  );
  const sub = createTextSprite(
    "\u540C\u3058\u30D5\u30EB\u30FC\u30C4\u30923\u3064\u9078\u3093\u3067\u6D88\u3059",
    {
      fontSize: 18,
      color: "#44405a",
      weight: "700",
    }
  );
  const easyBtn = createButton("かんたん 3x3x3");
  const normalBtn = createButton("ふつう 6x6x6");
  const hardBtn = createButton("むずかしい 9x9x9");
  const btn = createButton("スタート");
  btn.bg.material.color.set("#76f28c");
  ui.title.add(
    overlay,
    panel,
    title.mesh,
    sub.mesh,
    easyBtn.group,
    normalBtn.group,
    hardBtn.group,
    btn.group
  );
  ui.title.userData = {
    overlay,
    panel,
    title,
    sub,
    btn,
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
  const panelH = 320;
  const panelX = (width - panelW) / 2;
  const panelY = (height - panelH) / 2;
  setRect(ui.title.userData.panel, panelX, panelY, panelW, panelH, 60);
  const titleSize = ui.title.userData.title.mesh.userData.size;
  const subSize = ui.title.userData.sub.mesh.userData.size;
  ui.title.userData.title.setCentered(
    panelX + panelW / 2,
    panelY + 36 + titleSize.h / 2
  );
  ui.title.userData.sub.setCentered(
    panelX + panelW / 2,
    panelY + 86 + subSize.h / 2
  );
  const buttonW = 180;
  const buttonH = 44;
  const buttonGap = 12;
  const startY = panelY + 130;
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
  ui.buttons.titleStart.rect = btnRect;
  ui.buttons.modeEasy.rect = easyRect;
  ui.buttons.modeNormal.rect = normalRect;
  ui.buttons.modeHard.rect = hardRect;
}

function buildTutorialScreen() {
  const overlay = createPanel("#000000", 0.55);
  const panel = createPanel("#ffffff", 0.98);
  const title = createTextSprite("\u30C1\u30E5\u30FC\u30C8\u30EA\u30A2\u30EB", {
    fontSize: 24,
    color: "#2b2233",
    weight: "900",
  });
  const step1 = createTextSprite(
    "\u30BF\u30A4\u30EB\u3092\u30AF\u30EA\u30C3\u30AF\u3057\u30663\u3064\u9078\u629E",
    {
      fontSize: 20,
      color: "#2b2233",
      weight: "800",
    }
  );
  const step2 = createTextSprite(
    "\u540C\u3058\u30D5\u30EB\u30FC\u30C4\u3067\u3042\u308C\u3070\u6D88\u53BB",
    {
      fontSize: 20,
      color: "#2b2233",
      weight: "800",
    }
  );
  const step3 = createTextSprite(
    "\u3069\u3053\u3067\u3082OK\u30FB3\u3064\u63C3\u3048\u308B\u3068\u52A0\u70B9",
    {
      fontSize: 20,
      color: "#2b2233",
      weight: "800",
    }
  );
  const btn = createButton("プレイ");
  ui.tutorial.add(
    overlay,
    panel,
    title.mesh,
    step1.mesh,
    step2.mesh,
    step3.mesh,
    btn.group
  );
  ui.tutorial.userData = { overlay, panel, title, step1, step2, step3, btn };
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
  const panelH = 320;
  const panelX = (width - panelW) / 2;
  const panelY = (height - panelH) / 2;
  setRect(ui.tutorial.userData.panel, panelX, panelY, panelW, panelH, 60);
  ui.tutorial.userData.title.setPosition(panelX + 24, panelY + 30);
  ui.tutorial.userData.step1.setPosition(panelX + 24, panelY + 90);
  ui.tutorial.userData.step2.setPosition(panelX + 24, panelY + 140);
  ui.tutorial.userData.step3.setPosition(panelX + 24, panelY + 190);
  const btnRect = setRect(
    ui.tutorial.userData.btn.bg,
    panelX + panelW / 2 - 90,
    panelY + 240,
    180,
    56,
    65
  );
  ui.tutorial.userData.btn.label.setCentered(
    panelX + panelW / 2,
    panelY + 268
  );
  ui.buttons.tutorialPlay.rect = btnRect;
}

function buildEndScreen() {
  const overlay = createPanel("#000000", 0.5);
  const panel = createPanel("#ffffff", 0.95);
  const title = createTextSprite("結果", {
    fontSize: 24,
    color: "#2b2233",
    weight: "900",
  });
  const result = createTextSprite("スコア: 0", {
    fontSize: 20,
    color: "#2b2233",
    weight: "800",
  });
  const btn = createButton("もう一度");
  ui.end.add(overlay, panel, title.mesh, result.mesh, btn.group);
  ui.end.userData = { overlay, panel, title, result, btn };
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
  const panelW = Math.min(420, width - 40);
  const panelH = 220;
  const panelX = (width - panelW) / 2;
  const panelY = (height - panelH) / 2;
  setRect(ui.end.userData.panel, panelX, panelY, panelW, panelH, 60);
  ui.end.userData.title.setPosition(panelX + 24, panelY + 32);
  ui.end.userData.result.setPosition(panelX + 24, panelY + 90);
  const btnRect = setRect(
    ui.end.userData.btn.bg,
    panelX + panelW / 2 - 80,
    panelY + 130,
    160,
    52,
    65
  );
  ui.end.userData.btn.label.setCentered(panelX + panelW / 2, panelY + 156);
  ui.buttons.retry.rect = btnRect;
}

function buildTip() {
  ui.tip = createTextSprite(
    "同じフルーツを3つ選んで消そう。",
    {
      fontSize: 18,
      color: "#003cffff",
      weight: "700",
    }
  );
  scene.add(ui.tip.mesh);
}

function layoutTip() {
  if (!ui.tip) return;
  const inset = width < 420 ? 64 : 40;
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
  if (ui.combo) ui.combo.mesh.visible = false;
  layout();
}

function setMode(label, size) {
  modeLabel = label;
  cubeSize = size;
  const title = ui.title.userData.title;
  title.update(`\u30B0\u30C3\u30BA\u30BD\u30FC\u30C8\u30D1\u30BA\u30EB ${size}x${size}x${size}`);
  layout();
  createBoard();
  syncTiles();
  layoutTiles();
}

function endGame() {
  state = "end";
  playClearEffect();
  const result = ui.end.userData.result;
  if (result) {
    result.update(`スコア: ${score}`);
    layoutEndScreen();
  }
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
  const plane = createPanel("#ffffff", 1);
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
  gradient.addColorStop(0, "#ffe3f4");
  gradient.addColorStop(0.5, "#fff8b8");
  gradient.addColorStop(1, "#bdf7ff");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 512, 512);
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

function createPanel(color, opacity, radius = 18) {
  const texture = makeRoundedPanelTexture(color, radius);
  return new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity,
    })
  );
}

function makeRoundedPanelTexture(color, radius) {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = color;
  ctx.beginPath();
  const r = Math.max(4, Math.min(radius, size / 2));
  roundedRect(ctx, 0, 0, size, size, r);
  ctx.fill();
  // Glossy highlight
  const gradient = ctx.createLinearGradient(0, 0, 0, size * 0.7);
  gradient.addColorStop(0, "rgba(255,255,255,0.65)");
  gradient.addColorStop(0.5, "rgba(255,255,255,0.1)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.beginPath();
  roundedRect(ctx, 6, 6, size - 12, size * 0.55, r * 0.8);
  ctx.fill();
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

function createButton(label) {
  const bg = createPanel("#ffe36e", 1);
  const labelText = createTextSprite(label, {
    fontSize: 22,
    color: "#1c0f2e",
    weight: "900",
  });
  const group = new THREE.Group();
  group.add(bg, labelText.mesh);
  return { group, bg, label: labelText };
}

function createTextSprite(text, options) {
  const settings = {
    fontSize: options.fontSize || 24,
    color: options.color || "#2b2233",
    weight: options.weight || "700",
    glow: options.glow || false,
  };
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const padding = 12;
  ctx.font = `${settings.weight} ${settings.fontSize}px "Trebuchet MS", "Segoe UI", sans-serif`;
  const metrics = ctx.measureText(text);
  const textWidth = Math.ceil(metrics.width);
  const textHeight = Math.ceil(settings.fontSize * 1.2);
  canvas.width = textWidth + padding * 2;
  canvas.height = textHeight + padding * 2;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = `${settings.weight} ${settings.fontSize}px "Trebuchet MS", "Segoe UI", sans-serif`;
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
  ctx.font = `${settings.weight} ${settings.fontSize}px "Trebuchet MS", "Segoe UI", sans-serif`;
  const metrics = ctx.measureText(text);
  const textWidth = Math.ceil(metrics.width);
  const textHeight = Math.ceil(settings.fontSize * 1.2);
  canvas.width = textWidth + padding * 2;
  canvas.height = textHeight + padding * 2;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = `${settings.weight} ${settings.fontSize}px "Trebuchet MS", "Segoe UI", sans-serif`;
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

function setRect(mesh, x, y, w, h, z = 0) {
  mesh.scale.set(w, h, 1);
  mesh.position.set(x + w / 2, height - (y + h / 2), z);
  return { x, y, w, h };
}

function getPointerDistance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
