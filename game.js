// Configurações Base e Estado Inicial do Personagem
const INITIAL_POINTS = 15;

const DEFAULT_WEAPON = {
  id: "iron_longsword",
  name: "Espada Longa de Ferro",
  rangeCells: 1,
  rangeMeters: 1.5
};

const character = {
  name: "Valerius",
  race: {
    name: "Humano",
    passive: {
      name: "Ambição",
      description: "Começa com 1 habilidade inata adicional no nível 1."
    }
  },
  innateSkill: {
    id: "enhanced_strength",
    name: "Força Aprimorada",
    description: "Concede +2 pontos de força adicionais ao personagem.",
    bonus: { strength: 2 }
  },
  characterClass: {
    name: "Guerreiro",
    baseVitals: {
      hp: 20,
      mp: 5,
      ep: 100
    }
  },
  equippedWeapon: { ...DEFAULT_WEAPON },
  // Pontos alocados manualmente pelo jogador (iniciam em 0)
  attributes: {
    strength: 0,
    constitution: 0,
    dexterity: 0,
    intelligence: 0,
    charisma: 0,
    wisdom: 0
  },
  unspentPoints: INITIAL_POINTS
};

// Catálogo de Skills de Reação
const REACTION_SKILLS = [
  {
    id: "parry_1",
    name: "Aparar Ataque 1",
    epCost: 15,
    requiresWeapon: true,
    requiresAttackRange: true,
    description: "Você realiza um ataque oposto e usa o resultado do dano para diminuir no dano que vai ser causado."
  }
];

// Estado do Combate e Grid Tático (Roll20 Style) - Dobro do Tamanho (16x10)
const GRID_COLS = 16;
const GRID_ROWS = 10;
const CELL_METERS = 1.5; // 1 quadrado ortogonal = 1,5m
const DIAGONAL_METERS = 3.0; // Movimento na diagonal conta o dobro: 3,0m
const MAX_MOVE_METERS = 9.0; // Deslocamento máximo por turno: 9 metros
const CELL_PIXEL_SIZE = 52; // Tamanho visual de cada quadrado em pixels
const BASIC_ATTACK_EP_COST = 15; // Todo ataque comum gasta 15 de Energia

const tacticalMap = {
  cols: GRID_COLS,
  rows: GRID_ROWS,
  // Obstáculos orgânicos da floresta (árvores densas e pedras)
  obstacles: [
    { x: 3, y: 2 }, { x: 3, y: 3 },
    { x: 5, y: 6 }, { x: 5, y: 7 },
    { x: 7, y: 3 }, { x: 8, y: 3 }, { x: 8, y: 4 },
    { x: 10, y: 1 }, { x: 10, y: 2 },
    { x: 11, y: 7 }, { x: 12, y: 7 },
    { x: 6, y: 8 }
  ]
};

const combatState = {
  player: {
    hp: 20,
    maxHp: 20,
    mp: 5,
    maxMp: 5,
    ep: 100,
    maxEp: 100,
    x: 2,
    y: 5,
    initiative: 0,
    hasMoved: false,
    hasActed: false,
    stunnedTurns: 0
  },
  enemy: {
    name: "Goblin Espadachim",
    hp: 40,
    maxHp: 40,
    ep: 100,
    maxEp: 100,
    dmg: 2, // 2 pontos de dano base
    attackName: "Golpe de Espada Curta",
    heavyBlowCooldown: 0,
    skills: {
      heavyBlow: {
        id: "heavy_blow",
        name: "Golpe Pesado",
        epCost: 25,
        bonusAttack: 4, // +4 no ataque físico (força) -> 2 + 4 = 6 de dano
        pushMeters: 6.0, // Empurra o alvo 6 metros para trás
        stunRounds: 1,   // Atordoa por UMA rodada
        cooldown: 3
      }
    },
    dexterity: 2,
    x: 13,
    y: 5,
    initiative: 0,
    stunnedTurns: 0
  },
  isActive: false,
  isMoveModeActive: false,
  isAnimatingMove: false,
  awaitingReaction: false,
  pendingAttack: null,
  currentTurn: "player", // "player" | "enemy"
  round: 1
};

// Funções de Cálculo dos Valores Derivados
function getCalculatedStrength() {
  const innateBonus = character.innateSkill?.bonus?.strength || 0;
  return character.attributes.strength + innateBonus;
}

function getMaxHp() {
  // Base do Guerreiro (20) + (Constituição * 4)
  return character.characterClass.baseVitals.hp + (character.attributes.constitution * 4);
}

function getMaxMp() {
  // Base do Guerreiro (5) + (Inteligência * 4)
  return character.characterClass.baseVitals.mp + (character.attributes.intelligence * 4);
}

function getMaxEp() {
  // Base fixa do Guerreiro (100) - Energia padrão não aumenta com atributos
  return character.characterClass.baseVitals.ep;
}

function getCarryCapacity() {
  // Base 10kg + (Força Total * 5)
  return 10 + (getCalculatedStrength() * 5);
}

function rollPlayerWeaponDamage() {
  const str = getCalculatedStrength();
  return Math.floor(Math.random() * 2) + 3 + Math.floor(str * 0.8);
}

function toggleWeaponEquipped() {
  if (character.equippedWeapon) {
    character.equippedWeapon = null;
  } else {
    character.equippedWeapon = { ...DEFAULT_WEAPON };
  }
  updateUI();
  if (combatState.isActive) {
    updateCombatUI();
  }
}

// Manipulação de Atributos
function incrementAttribute(attrName) {
  if (character.unspentPoints <= 0) return;

  character.attributes[attrName]++;
  character.unspentPoints--;
  updateUI();
}

function decrementAttribute(attrName) {
  if (character.attributes[attrName] <= 0) return;

  character.attributes[attrName]--;
  character.unspentPoints++;
  updateUI();
}

function resetAttributes() {
  Object.keys(character.attributes).forEach(key => {
    character.attributes[key] = 0;
  });
  character.unspentPoints = INITIAL_POINTS;
  updateUI();
}

// Atualização da Interface Principal
function updateUI() {
  // Pontos restantes
  const pointsEl = document.getElementById("remaining-points");
  if (pointsEl) {
    pointsEl.textContent = character.unspentPoints;
    if (character.unspentPoints === 0) {
      pointsEl.className = "text-3xl font-mono font-black text-emerald-400";
    } else {
      pointsEl.className = "text-3xl font-mono font-black text-amber-300";
    }
  }

  // Atributos normais
  Object.keys(character.attributes).forEach(attr => {
    const el = document.getElementById(`attr-${attr}`);
    if (el) {
      if (attr === "strength") {
        const total = getCalculatedStrength();
        el.textContent = total;
        const sub = el.nextElementSibling;
        if (sub) sub.textContent = `(${character.attributes.strength} + 2)`;
      } else {
        el.textContent = character.attributes[attr];
      }
    }
  });

  // Atributos Vitais
  const maxHp = getMaxHp();
  const maxMp = getMaxMp();
  const maxEp = getMaxEp();

  document.getElementById("val-hp").textContent = maxHp;
  document.getElementById("max-hp").textContent = maxHp;

  document.getElementById("val-mp").textContent = maxMp;
  document.getElementById("max-mp").textContent = maxMp;

  document.getElementById("val-ep").textContent = maxEp;
  document.getElementById("max-ep").textContent = maxEp;

  // Capacidade de Carga
  const carryEl = document.getElementById("carry-capacity");
  if (carryEl) {
    carryEl.textContent = getCarryCapacity();
  }

  // Arma Equipada na Ficha
  const weaponNameEl = document.getElementById("weapon-name-display");
  const weaponStatsEl = document.getElementById("weapon-stats-display");
  const weaponBadgeEl = document.getElementById("weapon-status-badge");
  const toggleWeaponBtn = document.getElementById("btn-toggle-weapon");

  if (weaponNameEl && weaponStatsEl && weaponBadgeEl && toggleWeaponBtn) {
    if (character.equippedWeapon) {
      weaponNameEl.textContent = character.equippedWeapon.name;
      weaponNameEl.className = "text-xs font-serif font-bold text-amber-200";
      weaponStatsEl.textContent = `Corpo a Corpo • Alcance: ${character.equippedWeapon.rangeMeters.toFixed(1).replace('.', ',')}m`;
      weaponBadgeEl.textContent = "EQUIPADA";
      weaponBadgeEl.className = "text-[10px] font-mono font-bold text-emerald-400 bg-emerald-950/70 border border-emerald-800/60 px-2 py-0.5 rounded";
      toggleWeaponBtn.textContent = "Desequipar";
    } else {
      weaponNameEl.textContent = "Desarmado (Mãos Livres)";
      weaponNameEl.className = "text-xs font-serif font-bold text-stone-400";
      weaponStatsEl.textContent = "Sem arma equipada";
      weaponBadgeEl.textContent = "VAZIO";
      weaponBadgeEl.className = "text-[10px] font-mono font-bold text-stone-500 bg-stone-900 border border-stone-700 px-2 py-0.5 rounded";
      toggleWeaponBtn.textContent = "Equipar Espada";
    }
  }

  // Preview de dano do golpe de espada baseado em força
  const strikePreview = document.getElementById("strike-dmg-preview");
  if (strikePreview) {
    const baseDmg = 4 + Math.floor(getCalculatedStrength() * 1.5);
    strikePreview.textContent = `${baseDmg} a ${baseDmg + 3} Dano`;
  }

  // Atualiza estado dos botões de diminuir/aumentar
  document.querySelectorAll(".attribute-row").forEach(row => {
    const decBtn = row.querySelector("button:first-of-type");
    const incBtn = row.querySelector("button:last-of-type");
    
    const onclickStr = decBtn.getAttribute("onclick");
    const match = onclickStr.match(/'([^']+)'/);
    if (match) {
      const attrKey = match[1];
      decBtn.disabled = character.attributes[attrKey] <= 0;
      incBtn.disabled = character.unspentPoints <= 0;
    }
  });
}

// Sistema de Câmera Interativa do Grid (Pan com Mouse + Zoom estilo Roll20)
const BOARD_PIXEL_W = 838; // 16 * 52px + 6px de borda
const BOARD_PIXEL_H = 526; // 10 * 52px + 6px de borda
const MIN_ZOOM = 0.65;
const MAX_ZOOM = 2.4;
const ZOOM_STEP = 0.2;

const cameraState = {
  x: 0,
  y: 0,
  zoom: 1.0,
  isDragging: false,
  wasDragged: false,
  startMouseX: 0,
  startMouseY: 0,
  startCamX: 0,
  startCamY: 0
};

function clampCamera() {
  const viewport = document.getElementById("camera-viewport");
  if (!viewport || viewport.clientWidth === 0) return;

  const vw = viewport.clientWidth;
  const vh = viewport.clientHeight;
  const scaledW = BOARD_PIXEL_W * cameraState.zoom;
  const scaledH = BOARD_PIXEL_H * cameraState.zoom;

  // Permite mover a câmera livremente em qualquer direção, mantendo ao menos 140px do mapa visíveis
  const keepVisibleX = Math.min(160, vw * 0.4);
  const keepVisibleY = Math.min(130, vh * 0.4);

  const minX = keepVisibleX - scaledW;
  const maxX = vw - keepVisibleX;
  const minY = keepVisibleY - scaledH;
  const maxY = vh - keepVisibleY;

  cameraState.x = Math.min(maxX, Math.max(minX, cameraState.x));
  cameraState.y = Math.min(maxY, Math.max(minY, cameraState.y));
}

function applyCameraTransform(smooth = false) {
  const gridEl = document.getElementById("tactical-grid");
  const labelEl = document.getElementById("zoom-level-label");

  clampCamera();

  if (gridEl) {
    if (smooth) {
      gridEl.classList.add("smooth-camera");
    } else {
      gridEl.classList.remove("smooth-camera");
    }
    gridEl.style.transform = `translate(${Math.round(cameraState.x)}px, ${Math.round(cameraState.y)}px) scale(${cameraState.zoom})`;
  }

  if (labelEl) {
    labelEl.textContent = `${Math.round(cameraState.zoom * 100)}%`;
  }
}

function zoomAtPoint(newZoom, pivotX, pivotY, smooth = true) {
  const clampedZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, newZoom));
  if (clampedZoom === cameraState.zoom) return;

  // Coordenada no mundo sob o ponteiro antes do zoom
  const worldX = (pivotX - cameraState.x) / cameraState.zoom;
  const worldY = (pivotY - cameraState.y) / cameraState.zoom;

  cameraState.zoom = clampedZoom;
  cameraState.x = pivotX - worldX * cameraState.zoom;
  cameraState.y = pivotY - worldY * cameraState.zoom;

  applyCameraTransform(smooth);
}

function setZoom(newZoom) {
  const viewport = document.getElementById("camera-viewport");
  const cx = viewport ? viewport.clientWidth / 2 : BOARD_PIXEL_W / 2;
  const cy = viewport ? viewport.clientHeight / 2 : BOARD_PIXEL_H / 2;
  zoomAtPoint(newZoom, cx, cy, true);
}

function zoomIn() {
  setZoom(cameraState.zoom + ZOOM_STEP);
}

function zoomOut() {
  setZoom(cameraState.zoom - ZOOM_STEP);
}

function resetZoom() {
  setZoom(1.0);
}

function centerCamera() {
  const viewport = document.getElementById("camera-viewport");
  if (!viewport) return;

  const vw = viewport.clientWidth;
  const vh = viewport.clientHeight;

  // Escolhe um zoom inicial confortável que encaixe bem na tela (ou 1.0)
  const fitZoom = Math.min(1.0, (vw - 24) / BOARD_PIXEL_W, (vh - 24) / BOARD_PIXEL_H);
  cameraState.zoom = Math.max(MIN_ZOOM, fitZoom >= 0.85 ? fitZoom : 0.9);

  cameraState.x = (vw - BOARD_PIXEL_W * cameraState.zoom) / 2;
  cameraState.y = (vh - BOARD_PIXEL_H * cameraState.zoom) / 2;

  applyCameraTransform(true);
}

// Renderizador da Ordem de Turnos (Initiative Tracker)
function renderInitiativeTracker() {
  const trackerEl = document.getElementById("initiative-tracker-list");
  if (!trackerEl) return;

  const playerObj = {
    id: "player",
    name: character.name,
    avatar: "https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?w=150&auto=format&fit=crop&q=80",
    init: combatState.player.initiative,
    borderColor: "border-amber-500",
    activeColor: "bg-amber-950/80 border-amber-500 shadow-amber-500/50"
  };

  const goblinObj = {
    id: "enemy",
    name: "Goblin",
    avatar: "goblin-art.png",
    init: combatState.enemy.initiative,
    borderColor: "border-emerald-500",
    activeColor: "bg-emerald-950/80 border-emerald-500 shadow-emerald-500/50"
  };

  // Ordena por maior iniciativa
  const order = [playerObj, goblinObj].sort((a, b) => b.init - a.init);

  trackerEl.innerHTML = order.map((c, index) => {
    const isCurrent = combatState.currentTurn === c.id;
    const isStunned = (c.id === "player" && combatState.player.stunnedTurns > 0) || (c.id === "enemy" && combatState.enemy.stunnedTurns > 0);
    return `
      <div class="turn-order-card flex items-center gap-2 px-2.5 py-1 rounded-lg border ${isCurrent ? c.activeColor + ' active ring-1 ring-amber-400' : 'bg-stone-950 border-stone-800 opacity-60'}">
        <span class="text-[10px] font-mono font-bold text-stone-400">#${index + 1}</span>
        <img src="${c.avatar}" alt="${c.name}" class="w-6 h-6 rounded-full border ${c.borderColor} object-cover object-top shadow" />
        <div class="leading-tight">
          <div class="text-[11px] font-bold ${isCurrent ? 'text-amber-200' : 'text-stone-300'}">${c.name} ${isCurrent ? '⭐' : ''} ${isStunned ? '💫' : ''}</div>
          <div class="text-[9px] text-stone-400 font-mono">Iniciativa: <strong>${c.init}</strong></div>
        </div>
      </div>
    `;
  }).join('<i data-lucide="arrow-right" class="w-3.5 h-3.5 text-stone-600 shrink-0"></i>');

  if (window.lucide) lucide.createIcons();
}

function getDistance(x1, y1, x2, y2) {
  // Distância Chebyshev (movimentação em 8 direções padrão de grid de RPG)
  return Math.max(Math.abs(x1 - x2), Math.abs(y1 - y2));
}

function getDistanceMeters(x1, y1, x2, y2) {
  return (getDistance(x1, y1, x2, y2) * CELL_METERS).toFixed(1);
}

function createStunIndicatorElement() {
  const wrapper = document.createElement("div");
  wrapper.className = "stun-indicator-wrapper";
  wrapper.innerHTML = `
    <div class="stun-orbit-ring">
      <svg class="stun-orbit-svg" viewBox="0 0 40 16">
        <ellipse cx="20" cy="8" rx="16" ry="5.5" fill="none" stroke="#facc15" stroke-width="1.3" stroke-dasharray="3 2" opacity="0.85" />
        <g class="stun-stars-spin">
          <polygon points="4,8 5.5,6.5 7,8 5.5,9.5" fill="#fef08a" stroke="#ca8a04" stroke-width="0.6" />
          <polygon points="20,2 22,0 24,2 22,4" fill="#ffffff" stroke="#eab308" stroke-width="0.7" />
          <polygon points="33,9 34.8,7.2 36.6,9 34.8,10.8" fill="#fde047" stroke="#ca8a04" stroke-width="0.6" />
        </g>
      </svg>
    </div>
    <span class="stun-tag-pill">💫 ATORDOADO</span>
  `;
  return wrapper;
}

// Algoritmo de Dijkstra para encontrar todas as células alcançáveis até 9 metros + rota exata
// Regra: Ortogonal = 1,5m | Diagonal = 3,0m (o dobro do deslocamento)
function getReachableCells(startX, startY, maxMeters, blockedCells) {
  const minCost = new Map();
  const parentMap = new Map();
  const startKey = `${startX},${startY}`;
  const queue = [{ x: startX, y: startY, cost: 0 }];
  minCost.set(startKey, 0);

  const directions = [
    // Ortogonais (1,5m)
    { dx: 1, dy: 0, cost: CELL_METERS },
    { dx: -1, dy: 0, cost: CELL_METERS },
    { dx: 0, dy: 1, cost: CELL_METERS },
    { dx: 0, dy: -1, cost: CELL_METERS },
    // Diagonais (3,0m - o dobro do deslocamento!)
    { dx: 1, dy: 1, cost: DIAGONAL_METERS },
    { dx: 1, dy: -1, cost: DIAGONAL_METERS },
    { dx: -1, dy: 1, cost: DIAGONAL_METERS },
    { dx: -1, dy: -1, cost: DIAGONAL_METERS }
  ];

  while (queue.length > 0) {
    queue.sort((a, b) => a.cost - b.cost);
    const current = queue.shift();
    const curKey = `${current.x},${current.y}`;

    if (current.cost > minCost.get(curKey)) {
      continue;
    }

    for (const dir of directions) {
      const nx = current.x + dir.dx;
      const ny = current.y + dir.dy;
      const newCost = current.cost + dir.cost;

      if (nx >= 0 && nx < tacticalMap.cols && ny >= 0 && ny < tacticalMap.rows && newCost <= maxMeters) {
        const isBlocked = blockedCells.some(b => b.x === nx && b.y === ny);
        const key = `${nx},${ny}`;

        if (!isBlocked) {
          if (!minCost.has(key) || newCost < minCost.get(key)) {
            minCost.set(key, newCost);
            parentMap.set(key, curKey);
            queue.push({ x: nx, y: ny, cost: newCost });
          }
        }
      }
    }
  }

  minCost.delete(startKey);

  // Reconstrói o caminho completo (lista de células) para cada destino
  const result = new Map();
  for (const [key, cost] of minCost.entries()) {
    const path = [];
    let trace = key;
    while (trace) {
      const [px, py] = trace.split(",").map(Number);
      path.unshift({ x: px, y: py });
      trace = parentMap.get(trace);
    }
    result.set(key, { cost, path });
  }
  return result;
}

function renderTacticalGrid() {
  const gridEl = document.getElementById("tactical-grid");
  if (!gridEl) return;

  gridEl.innerHTML = "";
  const distMeters = getDistanceMeters(combatState.player.x, combatState.player.y, combatState.enemy.x, combatState.enemy.y);
  const distCells = getDistance(combatState.player.x, combatState.player.y, combatState.enemy.x, combatState.enemy.y);
  
  const distEl = document.getElementById("combat-distance-label");
  if (distEl) {
    distEl.textContent = `${distMeters} metros (${distCells} ${distCells === 1 ? 'quadrado - Adjacente!' : 'quadrados'})`;
    if (distCells === 1) {
      distEl.className = "text-emerald-400 font-mono font-bold";
    } else {
      distEl.className = "text-amber-300 font-mono";
    }
  }

  const blocked = [...tacticalMap.obstacles, { x: combatState.enemy.x, y: combatState.enemy.y }];
  
  let reachableMap = new Map();
  if (
    combatState.isMoveModeActive &&
    !combatState.player.hasMoved &&
    !combatState.isAnimatingMove &&
    combatState.player.stunnedTurns <= 0 &&
    combatState.currentTurn === "player" &&
    combatState.isActive
  ) {
    reachableMap = getReachableCells(combatState.player.x, combatState.player.y, MAX_MOVE_METERS, blocked);
  }

  for (let y = 0; y < tacticalMap.rows; y++) {
    for (let x = 0; x < tacticalMap.cols; x++) {
      const cell = document.createElement("div");
      cell.className = "grid-cell flex items-center justify-center relative";
      cell.dataset.x = x;
      cell.dataset.y = y;

      const isObstacle = tacticalMap.obstacles.some(obs => obs.x === x && obs.y === y);
      const isPlayer = combatState.player.x === x && combatState.player.y === y;
      const isEnemy = combatState.enemy.x === x && combatState.enemy.y === y;
      const cellKey = `${x},${y}`;

      if (isObstacle) {
        cell.classList.add("obstacle");
        cell.title = "Árvore Densa / Pedra (Bloqueado)";
      } else if (isPlayer) {
        const token = document.createElement("div");
        token.id = "grid-token-player";
        const stunnedCls = combatState.player.stunnedTurns > 0 ? "token-stunned" : "";
        token.className = `token token-player overflow-hidden ${combatState.player.hp <= 0 ? 'token-defeated' : ''} ${stunnedCls}`;
        token.innerHTML = `<img src="https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?w=150&auto=format&fit=crop&q=80" alt="${character.name}" class="w-full h-full object-cover rounded-full filter brightness-95" draggable="false">`;
        token.title = `${character.name} (Você)${combatState.player.stunnedTurns > 0 ? ' - ATORDOADO' : ''}`;
        cell.appendChild(token);

        if (combatState.player.stunnedTurns > 0 && combatState.player.hp > 0) {
          cell.appendChild(createStunIndicatorElement());
        }
      } else if (isEnemy) {
        const token = document.createElement("div");
        token.id = "grid-token-enemy";
        const stunnedCls = combatState.enemy.stunnedTurns > 0 ? "token-stunned" : "";
        token.className = `token token-enemy overflow-hidden bg-stone-900 ${combatState.enemy.hp <= 0 ? 'token-defeated' : ''} ${stunnedCls}`;
        token.innerHTML = `<img src="goblin-art.png" alt="Goblin" class="w-full h-full object-cover object-top rounded-full scale-125 translate-y-1" draggable="false">`;
        token.title = `Goblin Espadachim (${combatState.enemy.hp} HP)`;
        cell.appendChild(token);

        if (combatState.enemy.stunnedTurns > 0 && combatState.enemy.hp > 0) {
          cell.appendChild(createStunIndicatorElement());
        }
      } else if (reachableMap.has(cellKey)) {
        const nodeInfo = reachableMap.get(cellKey);
        const meters = nodeInfo.cost.toFixed(1);
        cell.classList.add("in-move-range");
        cell.title = `Mover até aqui (${meters}m de deslocamento)`;
        cell.onclick = () => {
          if (cameraState.wasDragged || combatState.isAnimatingMove) return;
          movePlayerTo(x, y, meters, nodeInfo.path);
        };

        const stepBadge = document.createElement("span");
        stepBadge.className = "absolute text-[9px] font-mono font-bold text-sky-100 bottom-0.5 right-1 pointer-events-none drop-shadow";
        stepBadge.textContent = `${meters}m`;
        cell.appendChild(stepBadge);
      }

      gridEl.appendChild(cell);
    }
  }

  if (window.lucide) lucide.createIcons();
}

// Animação sutil e natural de caminhada pelo Grid (passo a passo sem exageros)
function animateTokenAlongPath(pathPoints, tokenType) {
  return new Promise((resolve) => {
    const gridEl = document.getElementById("tactical-grid");
    if (!gridEl || !pathPoints || pathPoints.length < 2) {
      resolve();
      return;
    }

    const staticTokenId = tokenType === "player" ? "grid-token-player" : "grid-token-enemy";
    const staticToken = document.getElementById(staticTokenId);
    if (staticToken) staticToken.style.opacity = "0";

    const actor = document.createElement("div");
    actor.className = `moving-token-actor token ${tokenType === "player" ? "token-player" : "token-enemy bg-stone-900"} overflow-hidden`;
    if (tokenType === "player") {
      actor.innerHTML = `<img src="https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?w=150&auto=format&fit=crop&q=80" class="w-full h-full object-cover rounded-full filter brightness-95" draggable="false">`;
    } else {
      actor.innerHTML = `<img src="goblin-art.png" class="w-full h-full object-cover object-top rounded-full scale-125 translate-y-1" draggable="false">`;
    }

    const tokenOffset = (CELL_PIXEL_SIZE - 44) / 2; // 4px para centralizar 44px em 52px
    actor.style.left = `${pathPoints[0].x * CELL_PIXEL_SIZE + tokenOffset}px`;
    actor.style.top = `${pathPoints[0].y * CELL_PIXEL_SIZE + tokenOffset}px`;
    gridEl.appendChild(actor);

    const stepDurationMs = 95;
    let idx = 1;

    function nextStep() {
      if (idx >= pathPoints.length) {
        actor.remove();
        resolve();
        return;
      }

      const prev = pathPoints[idx - 1];
      const curr = pathPoints[idx];

      // Poeirinha discreta na casa que acabou de pisar
      const dust = document.createElement("div");
      dust.className = "footstep-dust";
      dust.style.left = `${prev.x * CELL_PIXEL_SIZE + CELL_PIXEL_SIZE / 2}px`;
      dust.style.top = `${prev.y * CELL_PIXEL_SIZE + CELL_PIXEL_SIZE - 10}px`;
      gridEl.appendChild(dust);
      setTimeout(() => dust.remove(), 400);

      if (window.GameAudio) {
        GameAudio.playFootsteps(1);
      }

      actor.style.transition = `left ${stepDurationMs}ms linear, top ${stepDurationMs}ms linear, transform ${stepDurationMs / 2}ms ease-out`;
      actor.style.left = `${curr.x * CELL_PIXEL_SIZE + tokenOffset}px`;
      actor.style.top = `${curr.y * CELL_PIXEL_SIZE + tokenOffset}px`;
      // Leve elevação natural de passada (-3px) sem exagero
      actor.style.transform = "translateY(-3px) scale(1.03)";

      setTimeout(() => {
        if (actor.isConnected) {
          actor.style.transform = "translateY(0px) scale(1)";
        }
      }, stepDurationMs / 2);

      idx++;
      setTimeout(nextStep, stepDurationMs);
    }

    requestAnimationFrame(nextStep);
  });
}

function toggleMoveMode() {
  if (
    combatState.currentTurn !== "player" ||
    combatState.player.hasMoved ||
    combatState.player.stunnedTurns > 0 ||
    combatState.isAnimatingMove ||
    !combatState.isActive
  ) return;

  combatState.isMoveModeActive = !combatState.isMoveModeActive;
  
  const statusEl = document.getElementById("move-mode-status");
  if (statusEl) {
    if (combatState.isMoveModeActive) {
      statusEl.textContent = "Clique em uma casa azul para se mover (até 9m)";
      statusEl.className = "text-sky-300 font-mono text-[10px] bg-sky-900/80 border border-sky-500 px-2 py-0.5 rounded animate-pulse";
    } else {
      statusEl.textContent = "Selecione 'Mover' para ver o alcance";
      statusEl.className = "text-sky-400 font-mono text-[10px] bg-sky-950/60 border border-sky-800/40 px-2 py-0.5 rounded";
    }
  }

  renderTacticalGrid();
}

async function movePlayerTo(targetX, targetY, meters, pathPoints) {
  if (
    combatState.currentTurn !== "player" ||
    combatState.player.hasMoved ||
    combatState.player.stunnedTurns > 0 ||
    combatState.isAnimatingMove ||
    !combatState.isActive
  ) return;

  combatState.isAnimatingMove = true;
  combatState.player.hasMoved = true;
  combatState.isMoveModeActive = false;

  const statusEl = document.getElementById("move-mode-status");
  if (statusEl) {
    statusEl.textContent = "Deslocando pelo campo...";
    statusEl.className = "text-sky-300 font-mono text-[10px] bg-stone-900 border border-sky-800 px-2 py-0.5 rounded";
  }

  // Remove destaques azuis mantendo o token na posição inicial para iniciar a caminhada
  renderTacticalGrid();
  updateCombatUI();

  const walkPath = pathPoints && pathPoints.length >= 2
    ? pathPoints
    : [{ x: combatState.player.x, y: combatState.player.y }, { x: targetX, y: targetY }];

  await animateTokenAlongPath(walkPath, "player");

  combatState.player.x = targetX;
  combatState.player.y = targetY;
  combatState.isAnimatingMove = false;

  logCombatMessage(`<span class="text-sky-300 font-bold">[Movimento]</span> Você se deslocou <strong class="text-sky-200">${meters} metros</strong> até (${targetX + 1}, ${targetY + 1}).`);

  if (statusEl) {
    statusEl.textContent = "Movimento do turno utilizado";
    statusEl.className = "text-stone-500 font-mono text-[10px] bg-stone-900 border border-stone-800 px-2 py-0.5 rounded";
  }

  updateCombatUI();
  renderTacticalGrid();
}

// Animação Visual de Corte de Espada (Slash VFX + Bote + Impacto + Dano Flutuante)
function playSlashAnimation(attackerPos, targetPos, damage, attackerTokenId, targetTokenId) {
  if (window.GameAudio) {
    GameAudio.playSwordSlash();
  }

  const gridEl = document.getElementById("tactical-grid");
  if (!gridEl) return;

  // 1. Bote (Lunge) do atacante em direção ao alvo
  const attackerEl = document.getElementById(attackerTokenId);
  if (attackerEl) {
    const lungeX = (targetPos.x - attackerPos.x) * 20;
    const lungeY = (targetPos.y - attackerPos.y) * 20;
    attackerEl.style.transition = "transform 0.12s cubic-bezier(0.2, 0.9, 0.3, 1.2)";
    attackerEl.style.transform = `translate(${lungeX}px, ${lungeY}px) scale(1.14)`;

    setTimeout(() => {
      if (attackerEl) {
        attackerEl.style.transition = "transform 0.22s ease-out";
        attackerEl.style.transform = "translate(0px, 0px) scale(1)";
      }
    }, 140);
  }

  // 2. Tremor e Flash de Impacto no token atingido
  const targetEl = document.getElementById(targetTokenId);
  if (targetEl) {
    targetEl.classList.remove("token-hit-anim");
    void targetEl.offsetWidth;
    targetEl.classList.add("token-hit-anim");
  }

  // 3. Arco Luminoso de Corte (Slash SVG) + Faíscas sobre o quadrado do alvo
  const centerX = targetPos.x * CELL_PIXEL_SIZE + CELL_PIXEL_SIZE / 2;
  const centerY = targetPos.y * CELL_PIXEL_SIZE + CELL_PIXEL_SIZE / 2;

  // Calcula ângulo do golpe baseado na posição relativa + inclinação diagonal de corte
  const baseAngleDeg = Math.atan2(targetPos.y - attackerPos.y, targetPos.x - attackerPos.x) * (180 / Math.PI);
  const slashContainer = document.createElement("div");
  slashContainer.className = "slash-vfx-container";
  slashContainer.style.left = `${centerX - 48}px`;
  slashContainer.style.top = `${centerY - 48}px`;
  slashContainer.style.transform = `rotate(${baseAngleDeg - 25}deg)`;

  const gradId = `slashGrad_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  slashContainer.innerHTML = `
    <div class="slash-impact-burst"></div>
    <svg class="slash-arc-svg" viewBox="0 0 100 100">
      <defs>
        <linearGradient id="${gradId}" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#ef4444" stop-opacity="0.1" />
          <stop offset="45%" stop-color="#f59e0b" stop-opacity="1" />
          <stop offset="80%" stop-color="#fef08a" stop-opacity="1" />
          <stop offset="100%" stop-color="#ffffff" stop-opacity="0.95" />
        </linearGradient>
      </defs>
      <!-- Rastro principal curvo da lâmina -->
      <path class="slash-blade-main" d="M 14 84 Q 56 54 86 14" fill="none" stroke="url(#${gradId})" stroke-width="10" stroke-linecap="round" />
      <!-- Fio branco incandescente no centro do corte -->
      <path class="slash-blade-core" d="M 18 80 Q 55 53 84 16" fill="none" stroke="#ffffff" stroke-width="3.5" stroke-linecap="round" />
    </svg>
    <span class="slash-spark" style="--spark-angle: -35deg;"></span>
    <span class="slash-spark" style="--spark-angle: -5deg;"></span>
    <span class="slash-spark" style="--spark-angle: 28deg;"></span>
    <span class="slash-spark" style="--spark-angle: 145deg;"></span>
    <span class="slash-spark" style="--spark-angle: -140deg;"></span>
  `;
  gridEl.appendChild(slashContainer);

  // 4. Número de Dano Flutuante (-X)
  const dmgText = document.createElement("div");
  dmgText.className = "floating-dmg-text";
  dmgText.style.left = `${centerX}px`;
  dmgText.style.top = `${centerY - 18}px`;
  dmgText.textContent = `-${damage}`;
  gridEl.appendChild(dmgText);

  // Limpa os elementos temporários de VFX após o término das animações
  setTimeout(() => {
    slashContainer.remove();
    dmgText.remove();
  }, 900);
}

// Animação Exclusiva de "Aparar Ataque" (Colisão de Lâminas em X + Escudo Defletor + Faíscas)
function playParryAnimation(enemyPos, playerPos, parryRollDmg, finalDamage) {
  if (window.GameAudio) {
    GameAudio.playParryClang();
  }

  const gridEl = document.getElementById("tactical-grid");
  if (!gridEl) return;

  const enemyToken = document.getElementById("grid-token-enemy");
  const playerToken = document.getElementById("grid-token-player");

  // 1. Ambos os combatentes avançam simultaneamente para o choque de lâminas!
  if (enemyToken && playerToken) {
    const dx = (playerPos.x - enemyPos.x) * 16;
    const dy = (playerPos.y - enemyPos.y) * 16;

    enemyToken.style.transition = "transform 0.11s cubic-bezier(0.2, 0.9, 0.3, 1)";
    playerToken.style.transition = "transform 0.11s cubic-bezier(0.2, 0.9, 0.3, 1)";

    enemyToken.style.transform = `translate(${dx}px, ${dy}px) scale(1.1)`;
    playerToken.style.transform = `translate(${-dx}px, ${-dy}px) scale(1.14)`;

    // O inimigo é repelido pelo impacto do Aparar!
    setTimeout(() => {
      if (enemyToken) {
        enemyToken.style.transition = "transform 0.24s cubic-bezier(0.2, 0.8, 0.3, 1.3)";
        enemyToken.style.transform = `translate(${-dx * 0.45}px, ${-dy * 0.45}px) scale(0.95)`;
      }
      if (playerToken) {
        playerToken.style.transition = "transform 0.22s ease-out";
        playerToken.style.transform = "translate(0px, 0px) scale(1)";
      }
    }, 130);

    setTimeout(() => {
      if (enemyToken) {
        enemyToken.style.transition = "transform 0.18s ease-out";
        enemyToken.style.transform = "translate(0px, 0px) scale(1)";
      }
    }, 390);
  }

  // 2. Ponto exato de colisão entre o jogador e o inimigo (levemente puxado para a frente do defensor)
  const playerCenterX = playerPos.x * CELL_PIXEL_SIZE + CELL_PIXEL_SIZE / 2;
  const playerCenterY = playerPos.y * CELL_PIXEL_SIZE + CELL_PIXEL_SIZE / 2;
  const enemyCenterX = enemyPos.x * CELL_PIXEL_SIZE + CELL_PIXEL_SIZE / 2;
  const enemyCenterY = enemyPos.y * CELL_PIXEL_SIZE + CELL_PIXEL_SIZE / 2;

  const clashX = playerCenterX * 0.62 + enemyCenterX * 0.38;
  const clashY = playerCenterY * 0.62 + enemyCenterY * 0.38;

  const parryContainer = document.createElement("div");
  parryContainer.className = "parry-vfx-container";
  parryContainer.style.left = `${clashX - 56}px`;
  parryContainer.style.top = `${clashY - 56}px`;

  const uid = `${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  parryContainer.innerHTML = `
    <div class="parry-shield-ring"></div>
    <svg class="parry-clash-svg" viewBox="0 0 112 112">
      <defs>
        <linearGradient id="enemyBlade_${uid}" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#ef4444" stop-opacity="0.2" />
          <stop offset="55%" stop-color="#f97316" stop-opacity="1" />
          <stop offset="100%" stop-color="#fef08a" stop-opacity="1" />
        </linearGradient>
        <linearGradient id="playerBlade_${uid}" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#0284c7" stop-opacity="0.25" />
          <stop offset="50%" stop-color="#38bdf8" stop-opacity="1" />
          <stop offset="85%" stop-color="#fef08a" stop-opacity="1" />
          <stop offset="100%" stop-color="#ffffff" stop-opacity="1" />
        </linearGradient>
      </defs>
      <!-- Golpe inimigo interceptado -->
      <path class="parry-enemy-blade" d="M 18 20 Q 56 54 88 86" fill="none" stroke="url(#enemyBlade_${uid})" stroke-width="8" stroke-linecap="round" />
      <!-- Espada defensora cruzando em ataque oposto (Aparar!) -->
      <path class="parry-player-blade" d="M 16 90 Q 54 54 94 18" fill="none" stroke="url(#playerBlade_${uid})" stroke-width="10" stroke-linecap="round" />
      <path class="parry-player-blade" d="M 20 86 Q 55 54 90 22" fill="none" stroke="#ffffff" stroke-width="3.5" stroke-linecap="round" />
      <!-- Estrela central de impacto aço-contra-aço -->
      <circle cx="56" cy="54" r="6" fill="#ffffff" />
    </svg>
    <span class="parry-clash-spark" style="--spark-angle: 0deg;"></span>
    <span class="parry-clash-spark" style="--spark-angle: 45deg;"></span>
    <span class="parry-clash-spark" style="--spark-angle: 90deg;"></span>
    <span class="parry-clash-spark" style="--spark-angle: 135deg;"></span>
    <span class="parry-clash-spark" style="--spark-angle: 180deg;"></span>
    <span class="parry-clash-spark" style="--spark-angle: -45deg;"></span>
    <span class="parry-clash-spark" style="--spark-angle: -90deg;"></span>
    <span class="parry-clash-spark" style="--spark-angle: -135deg;"></span>
  `;
  gridEl.appendChild(parryContainer);

  // 3. Texto Flutuante indicando o resultado do Aparar
  const parryText = document.createElement("div");
  parryText.className = "floating-parry-text";
  parryText.style.left = `${playerCenterX}px`;
  parryText.style.top = `${playerCenterY - 22}px`;
  if (finalDamage === 0) {
    parryText.textContent = `⚔️ APARADO! (0 Dano)`;
  } else {
    parryText.textContent = `⚔️ APAROU (-${parryRollDmg}) • -${finalDamage} HP`;
  }
  gridEl.appendChild(parryText);

  setTimeout(() => {
    parryContainer.remove();
    parryText.remove();
  }, 1100);
}

function executePlayerAttack() {
  if (combatState.currentTurn !== "player" || combatState.player.hasActed || !combatState.isActive || combatState.awaitingReaction) return;

  if (!character.equippedWeapon) {
    logCombatMessage(`<span class="text-amber-400 font-semibold">⚠️ Você está desarmado! Equipe uma arma na ficha para atacar com a espada.</span>`);
    return;
  }

  // Todo ataque comum exige e consome 15 de Energia
  if (combatState.player.ep < BASIC_ATTACK_EP_COST) {
    logCombatMessage(`<span class="text-amber-400 font-semibold">⚠️ Energia insuficiente! O ataque comum exige <strong>${BASIC_ATTACK_EP_COST} de Energia</strong>.</span>`);
    return;
  }

  const dist = getDistance(combatState.player.x, combatState.player.y, combatState.enemy.x, combatState.enemy.y);
  if (dist > character.equippedWeapon.rangeCells) {
    logCombatMessage(`<span class="text-red-400 font-semibold">❌ Inimigo fora de alcance! Você precisa estar a 1,5m (1 quadrado) para atacar com ${character.equippedWeapon.name}.</span>`);
    return;
  }

  // Consumir 1 Ação e 15 de Energia
  combatState.player.hasActed = true;
  combatState.player.ep = Math.max(0, combatState.player.ep - BASIC_ATTACK_EP_COST);

  // Dano baseado em Força
  const dmg = rollPlayerWeaponDamage();

  combatState.enemy.hp = Math.max(0, combatState.enemy.hp - dmg);
  logCombatMessage(
    `<span class="text-amber-300 font-bold">[Ação de Ataque]</span> Você desfere um corte de espada causando <strong class="text-red-400 font-bold">${dmg} de dano</strong> no Goblin! <span class="text-amber-400/90 text-[11px]">(-${BASIC_ATTACK_EP_COST} Energia)</span>`
  );

  if (combatState.enemy.hp <= 0) {
    combatState.enemy.hp = 0;
    combatState.isActive = false;
    logCombatMessage(`<div class="text-emerald-400 font-bold mt-2">🏆 VITÓRIA! O Goblin Espadachim foi eliminado! Você conquistou 25 Moedas de Ouro e 20 XP!</div>`);
    if (window.GameAudio) {
      setTimeout(() => GameAudio.playVictoryFanfare(), 320);
    }
  }

  updateCombatUI();
  renderTacticalGrid();

  // Dispara a animação de corte sobre o Goblin após renderizar o grid atualizado
  playSlashAnimation(
    { x: combatState.player.x, y: combatState.player.y },
    { x: combatState.enemy.x, y: combatState.enemy.y },
    dmg,
    "grid-token-player",
    "grid-token-enemy"
  );
}

function endPlayerTurn() {
  if (combatState.currentTurn !== "player" || !combatState.isActive || combatState.isAnimatingMove) return;

  if (combatState.player.stunnedTurns > 0) {
    combatState.player.stunnedTurns = Math.max(0, combatState.player.stunnedTurns - 1);
    logCombatMessage(`<span class="text-amber-300 font-semibold">✨ [Fim da Rodada] Você recobrou os sentidos e não está mais atordoado!</span>`);
  } else {
    logCombatMessage(`<span class="text-stone-400 italic">[Fim do Turno] Você encerra seu turno.</span>`);
  }
  
  // Passa para o turno do Goblin
  combatState.currentTurn = "enemy";
  updateCombatUI();
  renderTacticalGrid();

  // Executa o turno do Goblin com pequeno delay para fluidez visual
  setTimeout(() => {
    executeGoblinTurn();
  }, 850);
}

// Calcula a trajetória de empurrão (6 metros para trás = 4 casas ortogonais ou 2 diagonais)
function calculateKnockbackTrajectory(attackerPos, targetPos, pushMeters) {
  const stepX = Math.sign(targetPos.x - attackerPos.x);
  const stepY = Math.sign(targetPos.y - attackerPos.y);

  if (stepX === 0 && stepY === 0) {
    return { path: [{ ...targetPos }], metersPushed: 0, hitObstacle: false };
  }

  const isDiagonal = stepX !== 0 && stepY !== 0;
  const costPerCell = isDiagonal ? DIAGONAL_METERS : CELL_METERS; // 3.0m diagonal | 1.5m ortogonal

  const path = [{ x: targetPos.x, y: targetPos.y }];
  let currX = targetPos.x;
  let currY = targetPos.y;
  let metersPushed = 0;
  let hitObstacle = false;

  while (metersPushed + costPerCell <= pushMeters + 0.001) {
    const nx = currX + stepX;
    const ny = currY + stepY;

    // Verifica bordas da arena (16x10)
    if (nx < 0 || nx >= tacticalMap.cols || ny < 0 || ny >= tacticalMap.rows) {
      hitObstacle = true;
      break;
    }

    // Verifica colisão com árvores/pedras ou com o próprio atacante
    const blocked =
      tacticalMap.obstacles.some(o => o.x === nx && o.y === ny) ||
      (nx === attackerPos.x && ny === attackerPos.y);

    if (blocked) {
      hitObstacle = true;
      break;
    }

    currX = nx;
    currY = ny;
    metersPushed += costPerCell;
    path.push({ x: currX, y: currY });
  }

  return { path, metersPushed, hitObstacle };
}

// Animação do Golpe Pesado + Token sendo Empurrado 6m para trás + Atordoamento
function playHeavyBlowImpactVFX(attackerPos, targetPos, damage, showDamageText = true) {
  if (window.GameAudio) {
    GameAudio.playHeavySmash();
  }

  const viewport = document.getElementById("camera-viewport");
  if (viewport) {
    viewport.classList.remove("viewport-shake");
    void viewport.offsetWidth;
    viewport.classList.add("viewport-shake");
  }

  const gridEl = document.getElementById("tactical-grid");
  if (!gridEl) return;

  // Bote pesado do Goblin
  const attackerEl = document.getElementById("grid-token-enemy");
  if (attackerEl) {
    const lx = (targetPos.x - attackerPos.x) * 24;
    const ly = (targetPos.y - attackerPos.y) * 24;
    attackerEl.style.transition = "transform 0.13s cubic-bezier(0.2, 0.95, 0.3, 1.25)";
    attackerEl.style.transform = `translate(${lx}px, ${ly}px) scale(1.2)`;
    setTimeout(() => {
      if (attackerEl) {
        attackerEl.style.transition = "transform 0.24s ease-out";
        attackerEl.style.transform = "translate(0px, 0px) scale(1)";
      }
    }, 160);
  }

  const centerX = targetPos.x * CELL_PIXEL_SIZE + CELL_PIXEL_SIZE / 2;
  const centerY = targetPos.y * CELL_PIXEL_SIZE + CELL_PIXEL_SIZE / 2;
  const angleDeg = Math.atan2(targetPos.y - attackerPos.y, targetPos.x - attackerPos.x) * (180 / Math.PI);

  const vfx = document.createElement("div");
  vfx.className = "heavy-blow-vfx";
  vfx.style.left = `${centerX - 58}px`;
  vfx.style.top = `${centerY - 58}px`;
  vfx.style.transform = `rotate(${angleDeg - 20}deg)`;

  const gid = `heavyGrad_${Date.now()}`;
  vfx.innerHTML = `
    <div class="heavy-shockwave-ring"></div>
    <svg class="slash-arc-svg" viewBox="0 0 116 116">
      <defs>
        <linearGradient id="${gid}" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#991b1b" stop-opacity="0.3" />
          <stop offset="45%" stop-color="#ef4444" stop-opacity="1" />
          <stop offset="80%" stop-color="#fb923c" stop-opacity="1" />
          <stop offset="100%" stop-color="#fef08a" stop-opacity="1" />
        </linearGradient>
      </defs>
      <path class="slash-blade-main" d="M 12 96 Q 62 60 102 14" fill="none" stroke="url(#${gid})" stroke-width="15" stroke-linecap="round" />
      <path class="slash-blade-core" d="M 18 90 Q 60 58 98 18" fill="none" stroke="#fef08a" stroke-width="5" stroke-linecap="round" />
    </svg>
    <span class="slash-spark" style="--spark-angle: -40deg;"></span>
    <span class="slash-spark" style="--spark-angle: 0deg;"></span>
    <span class="slash-spark" style="--spark-angle: 35deg;"></span>
    <span class="slash-spark" style="--spark-angle: 95deg;"></span>
    <span class="slash-spark" style="--spark-angle: -95deg;"></span>
  `;
  gridEl.appendChild(vfx);

  if (showDamageText) {
    const dmgText = document.createElement("div");
    dmgText.className = "floating-dmg-text";
    dmgText.style.left = `${centerX}px`;
    dmgText.style.top = `${centerY - 22}px`;
    dmgText.textContent = `💥 -${damage}`;
    gridEl.appendChild(dmgText);
    setTimeout(() => dmgText.remove(), 950);
  }

  setTimeout(() => vfx.remove(), 700);
}

function animateTokenKnockback(pathPoints) {
  return new Promise((resolve) => {
    const gridEl = document.getElementById("tactical-grid");
    if (!gridEl || !pathPoints || pathPoints.length < 2) {
      resolve();
      return;
    }

    const staticToken = document.getElementById("grid-token-player");
    if (staticToken) staticToken.style.opacity = "0";

    const actor = document.createElement("div");
    actor.className = "moving-token-actor token token-player overflow-hidden";
    actor.innerHTML = `<img src="https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?w=150&auto=format&fit=crop&q=80" class="w-full h-full object-cover rounded-full filter brightness-110" draggable="false">`;

    const tokenOffset = (CELL_PIXEL_SIZE - 44) / 2;
    actor.style.left = `${pathPoints[0].x * CELL_PIXEL_SIZE + tokenOffset}px`;
    actor.style.top = `${pathPoints[0].y * CELL_PIXEL_SIZE + tokenOffset}px`;
    gridEl.appendChild(actor);

    // Gera poeira de derrapagem em cada casa arrastada
    pathPoints.forEach((pt, idx) => {
      if (idx === pathPoints.length - 1) return;
      setTimeout(() => {
        if (!gridEl.isConnected) return;
        const skid = document.createElement("div");
        skid.className = "knockback-dust";
        skid.style.left = `${pt.x * CELL_PIXEL_SIZE + CELL_PIXEL_SIZE / 2}px`;
        skid.style.top = `${pt.y * CELL_PIXEL_SIZE + CELL_PIXEL_SIZE / 2}px`;
        gridEl.appendChild(skid);
        setTimeout(() => skid.remove(), 580);
      }, idx * 65);
    });

    const dest = pathPoints[pathPoints.length - 1];
    const totalDuration = Math.max(220, (pathPoints.length - 1) * 78);

    requestAnimationFrame(() => {
      actor.style.transition = `left ${totalDuration}ms cubic-bezier(0.12, 0.92, 0.24, 1.06), top ${totalDuration}ms cubic-bezier(0.12, 0.92, 0.24, 1.06), transform ${totalDuration}ms ease-out`;
      actor.style.left = `${dest.x * CELL_PIXEL_SIZE + tokenOffset}px`;
      actor.style.top = `${dest.y * CELL_PIXEL_SIZE + tokenOffset}px`;
      actor.style.transform = "scale(0.92) rotate(-12deg)";
    });

    setTimeout(() => {
      actor.remove();
      resolve();
    }, totalDuration + 35);
  });
}

async function executeGoblinTurn() {
  if (!combatState.isActive) return;

  logCombatMessage(`<span class="text-red-400 font-bold">⚔️ TURNO DO GOBLIN ESPADACHIM</span>`);

  // Reduz recarga das habilidades do Goblin a cada turno dele
  if (combatState.enemy.heavyBlowCooldown > 0) {
    combatState.enemy.heavyBlowCooldown--;
  }

  let dist = getDistance(combatState.player.x, combatState.player.y, combatState.enemy.x, combatState.enemy.y);

  // 1. Movimentação do Goblin (até 9 metros, diagonais custando 3m, animada passo a passo!)
  if (dist > 1) {
    let metersSpent = 0;
    const maxGoblinMeters = MAX_MOVE_METERS;
    const goblinPath = [{ x: combatState.enemy.x, y: combatState.enemy.y }];
    let simX = combatState.enemy.x;
    let simY = combatState.enemy.y;

    while (metersSpent < maxGoblinMeters && dist > 1) {
      let stepX = 0;
      let stepY = 0;

      if (combatState.player.x > simX) stepX = 1;
      else if (combatState.player.x < simX) stepX = -1;

      if (combatState.player.y > simY) stepY = 1;
      else if (combatState.player.y < simY) stepY = -1;

      const isDiagonal = (stepX !== 0 && stepY !== 0);
      let stepCost = isDiagonal ? DIAGONAL_METERS : CELL_METERS;

      if (metersSpent + stepCost > maxGoblinMeters && isDiagonal) {
        if (Math.abs(combatState.player.x - simX) >= Math.abs(combatState.player.y - simY)) {
          stepY = 0;
        } else {
          stepX = 0;
        }
        stepCost = CELL_METERS;
      }

      if (metersSpent + stepCost > maxGoblinMeters) break;

      const nextX = simX + stepX;
      const nextY = simY + stepY;

      const isObstacle = tacticalMap.obstacles.some(o => o.x === nextX && o.y === nextY);
      const isPlayerCell = (nextX === combatState.player.x && nextY === combatState.player.y);

      if (!isObstacle && !isPlayerCell) {
        simX = nextX;
        simY = nextY;
        goblinPath.push({ x: simX, y: simY });
        metersSpent += stepCost;
        dist = getDistance(combatState.player.x, combatState.player.y, simX, simY);
      } else {
        break;
      }
    }

    if (goblinPath.length > 1) {
      combatState.isAnimatingMove = true;
      await animateTokenAlongPath(goblinPath, "enemy");
      combatState.enemy.x = simX;
      combatState.enemy.y = simY;
      combatState.isAnimatingMove = false;
      logCombatMessage(`<span class="text-red-300 text-xs">🐾 O Goblin avança pela vegetação (${metersSpent.toFixed(1)}m percorridos).</span>`);
      renderTacticalGrid();
    }
  }

  // 2. Ação do Goblin (Prioriza "Golpe Pesado" quando fora de recarga; caso contrário usa ataque comum)
  combatState.enemy.ep = Math.min(combatState.enemy.maxEp, combatState.enemy.ep + 20);
  dist = getDistance(combatState.player.x, combatState.player.y, combatState.enemy.x, combatState.enemy.y);

  const heavySkill = combatState.enemy.skills.heavyBlow;
  const canUseHeavy = dist <= 1 && combatState.enemy.heavyBlowCooldown <= 0 && combatState.enemy.ep >= heavySkill.epCost;
  const canUseBasic = dist <= 1 && combatState.enemy.ep >= BASIC_ATTACK_EP_COST;

  if (canUseHeavy) {
    combatState.enemy.ep -= heavySkill.epCost;
    combatState.enemy.heavyBlowCooldown = heavySkill.cooldown;
    // Ataque básico (2) + bônus de +4 de ataque físico = 6 de dano
    const heavyDmg = combatState.enemy.dmg + heavySkill.bonusAttack;

    logCombatMessage(
      `<span class="text-orange-400 font-bold">💥 [Skill Inimiga!]</span> O Goblin ergue a lâmina com fúria e usa <strong>"${heavySkill.name}"</strong> (+${heavySkill.bonusAttack} Físico, Empurrão 6m e Atordoamento)!`
    );

    openReactionPrompt({
      attackerName: combatState.enemy.name,
      attackName: heavySkill.name,
      incomingDamage: heavyDmg,
      isHeavyBlow: true,
      bonusAttack: heavySkill.bonusAttack,
      pushMeters: heavySkill.pushMeters,
      stunRounds: heavySkill.stunRounds
    });
    return;
  } else if (canUseBasic) {
    combatState.enemy.ep -= BASIC_ATTACK_EP_COST;
    const attackName = combatState.enemy.attackName || "Golpe de Espada Curta";
    const goblinDmg = combatState.enemy.dmg;

    logCombatMessage(
      `<span class="text-amber-300 font-bold">⚠️ [Ataque Iminente]</span> O inimigo usa <strong>"${attackName}"</strong>! Escolha como você vai reagir.`
    );

    openReactionPrompt({
      attackerName: combatState.enemy.name,
      attackName: attackName,
      incomingDamage: goblinDmg,
      isHeavyBlow: false
    });
    return;
  } else {
    logCombatMessage(`<span class="text-stone-400 italic text-[11px]">O Goblin não conseguiu alcançar você para atacar neste turno.</span>`);
  }

  // Sem ataque pendente: finaliza turno do Goblin e devolve a vez ao jogador
  setTimeout(() => {
    if (combatState.isActive && !combatState.awaitingReaction) {
      startPlayerTurn();
    }
  }, 900);
}

// =========================================================================
// SISTEMA DE SKILLS DE REAÇÃO (ANTES DO ATAQUE INIMIGO)
// =========================================================================
function evaluateReactionSkill(skill) {
  const hasEnergy = combatState.player.ep >= skill.epCost;
  const hasWeapon = !skill.requiresWeapon || character.equippedWeapon !== null;
  const dist = getDistance(combatState.player.x, combatState.player.y, combatState.enemy.x, combatState.enemy.y);
  const weaponRange = character.equippedWeapon ? character.equippedWeapon.rangeCells : 0;
  const inRange = !skill.requiresAttackRange || (character.equippedWeapon !== null && dist <= weaponRange);
  const notStunned = combatState.player.stunnedTurns <= 0;

  return {
    canUse: hasEnergy && hasWeapon && inRange && notStunned,
    checks: { hasEnergy, hasWeapon, inRange, notStunned }
  };
}

function openReactionPrompt(attackData) {
  combatState.awaitingReaction = true;
  combatState.pendingAttack = attackData;

  const overlayEl = document.getElementById("reaction-prompt-overlay");
  const titleEl = document.getElementById("reaction-prompt-title");
  const listEl = document.getElementById("reaction-options-list");

  if (titleEl) {
    const extraTag = attackData.isHeavyBlow
      ? `<div class="text-[11px] font-mono text-orange-300 mt-1">💥 Dano: <strong>${attackData.incomingDamage}</strong> (+${attackData.bonusAttack} Força) &bull; Empurra 6m &bull; Atordoa 1 rodada</div>`
      : `<div class="text-[11px] font-mono text-stone-400 mt-0.5">Dano físico base: <strong>${attackData.incomingDamage}</strong></div>`;

    titleEl.innerHTML = `O inimigo usa <span class="${attackData.isHeavyBlow ? 'text-orange-400' : 'text-red-400'}">"${attackData.attackName}"</span>, como você vai reagir?${extraTag}`;
  }

  if (listEl) {
    listEl.innerHTML = REACTION_SKILLS.map(skill => {
      const evalResult = evaluateReactionSkill(skill);
      const { hasEnergy, hasWeapon, inRange, notStunned } = evalResult.checks;

      const reqBadge = (ok, label) =>
        ok
          ? `<span class="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950/80 border border-emerald-700/60 text-emerald-300">✓ ${label}</span>`
          : `<span class="text-[10px] font-mono px-2 py-0.5 rounded bg-red-950/80 border border-red-700/60 text-red-300">✗ ${label}</span>`;

      return `
        <button
          onclick="resolveEnemyAttackWithReaction('${skill.id}')"
          ${evalResult.canUse ? "" : "disabled"}
          class="w-full text-left p-3 rounded-xl border-2 transition flex flex-col gap-2 ${
            evalResult.canUse
              ? "bg-gradient-to-r from-sky-950/90 via-stone-900 to-amber-950/60 hover:from-sky-900/90 hover:to-amber-900/70 border-sky-500/80 shadow-lg cursor-pointer active:scale-[0.99]"
              : "bg-stone-900/60 border-stone-800 opacity-55 cursor-not-allowed"
          }"
        >
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-2">
              <span class="w-7 h-7 rounded-lg bg-sky-950 border border-sky-500/70 flex items-center justify-center text-sky-300 font-bold text-xs">⚔️</span>
              <span class="font-serif font-bold text-sm text-amber-200">${skill.name}</span>
            </div>
            <span class="text-[11px] font-mono font-bold text-amber-300 bg-amber-950/80 border border-amber-700/60 px-2 py-0.5 rounded">
              -${skill.epCost} Energia
            </span>
          </div>
          <p class="text-xs text-stone-300 leading-relaxed">${skill.description}</p>
          <div class="flex flex-wrap items-center gap-1.5 pt-0.5">
            ${reqBadge(hasEnergy, `${skill.epCost} Energia`)}
            ${reqBadge(inRange, "Alcance p/ Atacar")}
            ${reqBadge(hasWeapon, "Arma Equipada")}
            ${!notStunned ? reqBadge(false, "Atordoado") : ""}
          </div>
        </button>
      `;
    }).join("");
  }

  if (overlayEl) {
    overlayEl.classList.remove("hidden");
  }

  if (window.GameAudio) {
    GameAudio.playReactionAlert();
  }

  updateCombatUI();
  if (window.lucide) lucide.createIcons();
}

function closeReactionPrompt() {
  combatState.awaitingReaction = false;
  const overlayEl = document.getElementById("reaction-prompt-overlay");
  if (overlayEl) {
    overlayEl.classList.add("hidden");
  }
}

async function applyHeavyBlowKnockbackAndStun(attack) {
  if (!attack.isHeavyBlow || combatState.player.hp <= 0) return;

  const kb = calculateKnockbackTrajectory(
    { x: combatState.enemy.x, y: combatState.enemy.y },
    { x: combatState.player.x, y: combatState.player.y },
    attack.pushMeters || 6.0
  );

  // Anima o token sendo empurrado até 6 metros para trás!
  if (kb.path.length > 1) {
    combatState.isAnimatingMove = true;
    await animateTokenKnockback(kb.path);
    const finalPos = kb.path[kb.path.length - 1];
    combatState.player.x = finalPos.x;
    combatState.player.y = finalPos.y;
    combatState.isAnimatingMove = false;
  }

  // Aplica o Atordoamento por UMA rodada
  combatState.player.stunnedTurns = Math.max(combatState.player.stunnedTurns, attack.stunRounds || 1);

  updateCombatUI();
  renderTacticalGrid();

  // Texto flutuante de Empurrão + Atordoamento na posição onde parou
  const gridEl = document.getElementById("tactical-grid");
  if (gridEl) {
    const cx = combatState.player.x * CELL_PIXEL_SIZE + CELL_PIXEL_SIZE / 2;
    const cy = combatState.player.y * CELL_PIXEL_SIZE + CELL_PIXEL_SIZE / 2;
    const stunPopup = document.createElement("div");
    stunPopup.className = "floating-parry-text";
    stunPopup.style.left = `${cx}px`;
    stunPopup.style.top = `${cy - 26}px`;
    stunPopup.style.color = "#fef08a";
    stunPopup.textContent = kb.metersPushed > 0
      ? `💨 EMPURRADO ${kb.metersPushed.toFixed(1)}m • 💫 ATORDOADO!`
      : `💫 ATORDOADO! (1 Rodada)`;
    gridEl.appendChild(stunPopup);
    setTimeout(() => stunPopup.remove(), 1150);
  }

  const pushMsg = kb.metersPushed > 0
    ? `empurrado <strong>${kb.metersPushed.toFixed(1)} metros</strong> para trás${kb.hitObstacle ? ' (barrado por obstáculo/borda)' : ''}`
    : `encurralado contra o obstáculo`;

  logCombatMessage(
    `<span class="text-yellow-300 font-bold">💫 [Golpe Pesado]</span> Você foi ${pushMsg} e está <strong class="text-yellow-200">ATORDOADO por 1 rodada</strong>!`
  );
}

async function resolveEnemyAttackWithReaction(reactionId) {
  if (!combatState.awaitingReaction || !combatState.pendingAttack || !combatState.isActive) return;

  const attack = combatState.pendingAttack;
  combatState.pendingAttack = null;
  closeReactionPrompt();

  const initialPlayerPos = { x: combatState.player.x, y: combatState.player.y };
  const enemyPos = { x: combatState.enemy.x, y: combatState.enemy.y };

  if (reactionId === "parry_1") {
    const skill = REACTION_SKILLS.find(s => s.id === "parry_1");
    const evalResult = evaluateReactionSkill(skill);

    if (skill && evalResult.canUse) {
      combatState.player.ep = Math.max(0, combatState.player.ep - skill.epCost);

      // Ataque oposto: diminui no dano que vai ser causado
      const parryRollDmg = rollPlayerWeaponDamage();
      const finalDamage = Math.max(0, attack.incomingDamage - parryRollDmg);

      combatState.player.hp = Math.max(0, combatState.player.hp - finalDamage);

      if (finalDamage === 0) {
        logCombatMessage(
          `<span class="text-sky-300 font-bold">🛡️ [Aparar Ataque 1]</span> Ataque oposto de <strong>${parryRollDmg}</strong> contra "${attack.attackName}" (${attack.incomingDamage} dano) &rarr; <strong class="text-emerald-400">Dano reduzido a 0!</strong> <span class="text-amber-400/90 text-[11px]">(-${skill.epCost} Energia)</span>`
        );
      } else {
        logCombatMessage(
          `<span class="text-sky-300 font-bold">🛡️ [Aparar Ataque 1]</span> Ataque oposto abateu <strong>-${parryRollDmg}</strong> de "${attack.attackName}" (${attack.incomingDamage} dano) &rarr; Você sofreu <strong class="text-red-400">${finalDamage} de dano</strong>! <span class="text-amber-400/90 text-[11px]">(-${skill.epCost} Energia)</span>`
        );
      }

      updateCombatUI();
      renderTacticalGrid();

      playParryAnimation(enemyPos, initialPlayerPos, parryRollDmg, finalDamage);

      // Se foi Golpe Pesado, após o choque da espada o impacto pesado empurra 6m e atordoa!
      if (attack.isHeavyBlow && combatState.player.hp > 0) {
        await new Promise(r => setTimeout(r, 340));
        playHeavyBlowImpactVFX(enemyPos, initialPlayerPos, finalDamage, false);
        await applyHeavyBlowKnockbackAndStun(attack);
      }

      finishEnemyAttackResolution();
      return;
    }
  }

  // Caso padrão ("none"): jogador não reagiu e recebe o golpe integralmente
  const goblinDmg = attack.incomingDamage;
  combatState.player.hp = Math.max(0, combatState.player.hp - goblinDmg);
  logCombatMessage(
    `<span class="text-red-400 font-bold">[Ataque do Goblin]</span> O Goblin acerta <strong>"${attack.attackName}"</strong> causando <strong class="text-red-400 font-bold">${goblinDmg} de dano</strong> a você!`
  );

  updateCombatUI();
  renderTacticalGrid();

  if (attack.isHeavyBlow) {
    playHeavyBlowImpactVFX(enemyPos, initialPlayerPos, goblinDmg, true);
    await new Promise(r => setTimeout(r, 180));
    await applyHeavyBlowKnockbackAndStun(attack);
  } else {
    playSlashAnimation(
      enemyPos,
      initialPlayerPos,
      goblinDmg,
      "grid-token-enemy",
      "grid-token-player"
    );
  }

  finishEnemyAttackResolution();
}

function finishEnemyAttackResolution() {
  if (combatState.player.hp <= 0) {
    combatState.player.hp = 0;
    combatState.isActive = false;
    logCombatMessage(`<div class="text-red-500 font-bold mt-2">💀 DERROTA! Você sucumbiu aos ferimentos.</div>`);
    if (window.GameAudio) {
      setTimeout(() => GameAudio.playDefeatSound(), 280);
    }
    updateCombatUI();
    renderTacticalGrid();
    return;
  }

  // Finaliza turno do Goblin após a animação e devolve a vez ao jogador com +20 EP
  setTimeout(() => {
    if (combatState.isActive && !combatState.awaitingReaction) {
      startPlayerTurn();
    }
  }, 950);
}

function startPlayerTurn() {
  combatState.currentTurn = "player";
  combatState.isMoveModeActive = false;
  combatState.round++;

  // Regeneração passiva de +20 EP por rodada
  const previousEp = combatState.player.ep;
  combatState.player.ep = Math.min(combatState.player.maxEp, combatState.player.ep + 20);
  const actualRegen = combatState.player.ep - previousEp;

  const statusEl = document.getElementById("move-mode-status");

  // Verifica se o jogador está ATORDOADO nesta rodada
  if (combatState.player.stunnedTurns > 0) {
    combatState.player.hasMoved = true;
    combatState.player.hasActed = true;

    logCombatMessage(`<div class="text-yellow-300 font-bold mt-2">💫 RODADA ${combatState.round} — VOCÊ ESTÁ ATORDOADO!</div>`);
    logCombatMessage(`<span class="text-yellow-200/90 text-xs">Você perdeu o Movimento e a Ação desta rodada devido ao Golpe Pesado. Clique em <strong>"Passar Turno"</strong> para se recuperar!</span>`);
    if (actualRegen > 0) {
      logCombatMessage(`<span class="text-amber-400 text-[11px]">⚡ Energia regenerada passivamente: <strong class="text-amber-300">+${actualRegen} Energia</strong>.</span>`);
    }

    if (statusEl) {
      statusEl.textContent = "💫 Atordoado nesta rodada! Passe o turno para se recuperar";
      statusEl.className = "text-yellow-300 font-mono text-[11px] bg-yellow-950/80 border border-yellow-600/70 px-2.5 py-0.5 rounded animate-pulse";
    }
  } else {
    combatState.player.hasMoved = false;
    combatState.player.hasActed = false;

    logCombatMessage(`<div class="text-emerald-400 font-bold mt-2">🛡️ SEU TURNO (Rodada ${combatState.round})</div>`);
    if (actualRegen > 0) {
      logCombatMessage(`<span class="text-amber-400 text-[11px]">⚡ Você recuperou <strong class="text-amber-300">+${actualRegen} Energia</strong> no início da rodada.</span>`);
    }

    if (statusEl) {
      statusEl.textContent = "Selecione 'Mover' para ver o alcance";
      statusEl.className = "text-sky-400 font-mono text-[10px] bg-sky-950/60 border border-sky-800/40 px-2 py-0.5 rounded";
    }
  }

  updateCombatUI();
  renderTacticalGrid();
}

// INÍCIO DO COMBATE & ROLAGEM DE INICIATIVA
function openCombatModal() {
  try {
    const modalEl = document.getElementById("combat-modal");
    if (!modalEl) {
      console.error("Modal de combate não encontrado");
      return;
    }

    const nameInput = document.getElementById("character-name");
    if (nameInput && nameInput.value.trim() !== "") {
      character.name = nameInput.value.trim();
    }

    const playerNameEl = document.getElementById("combat-player-name");
    if (playerNameEl) {
      playerNameEl.textContent = `${character.name} (Guerreiro)`;
    }
    
    // Sincronizar vitais
    combatState.player.maxHp = getMaxHp();
    combatState.player.hp = combatState.player.maxHp;
    combatState.player.maxEp = getMaxEp();
    combatState.player.ep = combatState.player.maxEp;

    // Reset do Goblin e Status
    combatState.enemy.hp = combatState.enemy.maxHp;
    combatState.enemy.ep = combatState.enemy.maxEp;
    combatState.enemy.heavyBlowCooldown = 0;
    combatState.enemy.stunnedTurns = 0;

    // Posições Iniciais no Grid (16x10)
    combatState.player.x = 2;
    combatState.player.y = 5;
    combatState.enemy.x = 13;
    combatState.enemy.y = 5;

    combatState.isActive = true;
    combatState.isMoveModeActive = false;
    combatState.isAnimatingMove = false;
    combatState.awaitingReaction = false;
    combatState.pendingAttack = null;
    combatState.player.hasMoved = false;
    combatState.player.hasActed = false;
    combatState.player.stunnedTurns = 0;
    combatState.round = 1;
    closeReactionPrompt();

    // Exibir o Modal Imediatamente e Iniciar Trilha Sonora + Trompa de Guerra
    modalEl.classList.remove("hidden");
    if (window.GameAudio) {
      GameAudio.playCombatStartHorn();
      GameAudio.startBattleMusic();
    }

    // Anúncio no Canto Superior Central: "COMBATE INICIADO"
    const bannerAlert = document.getElementById("combat-banner-alert");
    if (bannerAlert) {
      bannerAlert.classList.remove("hidden");
      bannerAlert.classList.remove("animate-combat-banner");
      void bannerAlert.offsetWidth; // Trigger reflow
      bannerAlert.classList.add("animate-combat-banner");
    }

    // ETAPA 2: Rolagem de Iniciativa baseada em Destreza
    const playerDex = character.attributes.dexterity;
    const playerRoll = Math.floor(Math.random() * 20) + 1;
    const playerTotalInit = playerRoll + playerDex;

    const goblinDex = combatState.enemy.dexterity;
    const goblinRoll = Math.floor(Math.random() * 20) + 1;
    const goblinTotalInit = goblinRoll + goblinDex;

    combatState.player.initiative = playerTotalInit;
    combatState.enemy.initiative = goblinTotalInit;

    const logEl = document.getElementById("combat-log");
    if (logEl) {
      logEl.innerHTML = `
        <div class="text-amber-400 font-bold">⚔️ COMBATE INICIADO!</div>
        <div class="text-stone-300 text-xs">🎲 Iniciativa: ${character.name} rolou [${playerRoll}] + ${playerDex} (Destreza) = <strong>${playerTotalInit}</strong> | Goblin rolou [${goblinRoll}] + ${goblinDex} = <strong>${goblinTotalInit}</strong></div>
      `;
    }

    if (playerTotalInit >= goblinTotalInit) {
      combatState.currentTurn = "player";
      logCombatMessage(`<div class="text-emerald-400 font-bold">⚡ ${character.name} age primeiro na ordem dos turnos!</div>`);
    } else {
      combatState.currentTurn = "enemy";
      logCombatMessage(`<div class="text-red-400 font-bold">⚡ O Goblin foi mais rápido e age primeiro!</div>`);
    }

    updateCombatUI();
    renderTacticalGrid();

    // Centraliza a câmera perfeitamente assim que o modal é renderizado
    requestAnimationFrame(() => {
      centerCamera();
    });

    if (window.lucide) lucide.createIcons();

    // Se o Goblin tirou iniciativa mais alta, executa a vez dele
    if (combatState.currentTurn === "enemy") {
      setTimeout(() => {
        executeGoblinTurn();
      }, 1500);
    }
  } catch (err) {
    console.error("Erro ao abrir combate:", err);
  }
}

function closeCombatModal() {
  combatState.isActive = false;
  combatState.pendingAttack = null;
  closeReactionPrompt();
  if (window.GameAudio) {
    GameAudio.stopBattleMusic();
  }
  const modal = document.getElementById("combat-modal");
  if (modal) modal.classList.add("hidden");
  const bannerAlert = document.getElementById("combat-banner-alert");
  if (bannerAlert) bannerAlert.classList.add("hidden");
}

function restartCombat() {
  openCombatModal();
}

function updateCombatUI() {
  // Arma equipada no placar de combate
  const combatWeaponBadge = document.getElementById("combat-weapon-badge");
  if (combatWeaponBadge) {
    if (character.equippedWeapon) {
      combatWeaponBadge.textContent = `🗡️ Espada Longa (1,5m)`;
      combatWeaponBadge.className = "text-[10px] text-amber-300 bg-amber-950/70 border border-amber-800/50 px-1.5 py-0.5 rounded font-mono shrink-0";
    } else {
      combatWeaponBadge.textContent = `✋ Desarmado`;
      combatWeaponBadge.className = "text-[10px] text-stone-400 bg-stone-900 border border-stone-700 px-1.5 py-0.5 rounded font-mono shrink-0";
    }
  }

  // Vida e Energia do Jogador com checagens seguras
  const pHpEl = document.getElementById("combat-p-hp");
  if (pHpEl) pHpEl.textContent = Math.max(0, combatState.player.hp);

  const pMaxHpEl = document.getElementById("combat-p-maxhp");
  if (pMaxHpEl) pMaxHpEl.textContent = combatState.player.maxHp;

  const pBarHp = document.getElementById("combat-bar-p-hp");
  if (pBarHp) {
    const hpPct = Math.max(0, (combatState.player.hp / combatState.player.maxHp) * 100);
    pBarHp.style.width = `${hpPct}%`;
  }

  const pEpEl = document.getElementById("combat-p-ep");
  if (pEpEl) pEpEl.textContent = Math.max(0, combatState.player.ep);

  const pMaxEpEl = document.getElementById("combat-p-maxep");
  if (pMaxEpEl) pMaxEpEl.textContent = combatState.player.maxEp;

  const pBarEp = document.getElementById("combat-bar-p-ep");
  if (pBarEp) {
    const epPct = Math.max(0, (combatState.player.ep / combatState.player.maxEp) * 100);
    pBarEp.style.width = `${epPct}%`;
  }

  // Vida do Goblin
  const eHpEl = document.getElementById("combat-e-hp");
  if (eHpEl) eHpEl.textContent = Math.max(0, combatState.enemy.hp);

  const eMaxHpEl = document.getElementById("combat-e-maxhp");
  if (eMaxHpEl) eMaxHpEl.textContent = combatState.enemy.maxHp;

  const eBarHp = document.getElementById("combat-bar-e-hp");
  if (eBarHp) {
    const eHpPct = Math.max(0, (combatState.enemy.hp / combatState.enemy.maxHp) * 100);
    eBarHp.style.width = `${eHpPct}%`;
  }

  // Atualiza Ordem de Turnos
  renderInitiativeTracker();

  // Indicador de Turno
  const turnBadge = document.getElementById("turn-indicator-badge");
  if (turnBadge) {
    if (combatState.awaitingReaction) {
      turnBadge.textContent = "⚡ SUA REAÇÃO!";
      turnBadge.className = "px-4 py-1.5 rounded-lg border font-serif font-black text-xs uppercase tracking-wider transition-all duration-300 shadow bg-amber-950/90 border-amber-500 text-amber-200 shadow-amber-950/80 animate-pulse";
    } else if (combatState.currentTurn === "player" && combatState.player.stunnedTurns > 0) {
      turnBadge.textContent = "💫 ATORDOADO!";
      turnBadge.className = "px-4 py-1.5 rounded-lg border font-serif font-black text-xs uppercase tracking-wider transition-all duration-300 shadow bg-yellow-950/90 border-yellow-500 text-yellow-200 shadow-yellow-950/80 animate-pulse";
    } else if (combatState.currentTurn === "player") {
      turnBadge.textContent = "SEU TURNO";
      turnBadge.className = "px-4 py-1.5 rounded-lg border font-serif font-black text-xs uppercase tracking-wider transition-all duration-300 shadow bg-emerald-950/80 border-emerald-600 text-emerald-300 shadow-emerald-950/80";
    } else {
      turnBadge.textContent = "TURNO DO GOBLIN";
      turnBadge.className = "px-4 py-1.5 rounded-lg border font-serif font-black text-xs uppercase tracking-wider transition-all duration-300 shadow bg-red-950/80 border-red-600 text-red-300 shadow-red-950/80 animate-pulse";
    }
  }

  // Status dos recursos da rodada (Movimentação e Ação)
  const movStatus = document.getElementById("status-movement");
  if (movStatus) {
    if (combatState.player.stunnedTurns > 0 && combatState.currentTurn === "player") {
      movStatus.textContent = "💫 ATORDOADO";
      movStatus.className = "font-bold text-yellow-400 text-xs";
    } else if (combatState.player.hasMoved) {
      movStatus.textContent = "✗ UTILIZADO";
      movStatus.className = "font-bold text-stone-500 text-xs";
    } else {
      movStatus.textContent = "✓ DISPONÍVEL (9m)";
      movStatus.className = "font-bold text-emerald-400 text-xs";
    }
  }

  const actStatus = document.getElementById("status-action");
  if (actStatus) {
    if (combatState.player.stunnedTurns > 0 && combatState.currentTurn === "player") {
      actStatus.textContent = "💫 ATORDOADO";
      actStatus.className = "font-bold text-yellow-400 text-xs";
    } else if (combatState.player.hasActed) {
      actStatus.textContent = "✗ UTILIZADA";
      actStatus.className = "font-bold text-stone-500 text-xs";
    } else {
      actStatus.textContent = "✓ DISPONÍVEL";
      actStatus.className = "font-bold text-emerald-400 text-xs";
    }
  }

  // Botões de Ação
  const isPlayerTurn = combatState.currentTurn === "player" && combatState.isActive && !combatState.awaitingReaction && !combatState.isAnimatingMove;
  const isStunned = combatState.player.stunnedTurns > 0;
  const moveBtn = document.getElementById("btn-toggle-move");
  const attackBtn = document.getElementById("btn-attack-action");
  const endTurnBtn = document.getElementById("btn-end-turn");

  if (moveBtn) moveBtn.disabled = !isPlayerTurn || isStunned || combatState.player.hasMoved;
  if (attackBtn) attackBtn.disabled = !isPlayerTurn || isStunned || combatState.player.hasActed || combatState.player.ep < BASIC_ATTACK_EP_COST || !character.equippedWeapon;
  if (endTurnBtn) endTurnBtn.disabled = !isPlayerTurn;
}

function logCombatMessage(html) {
  const logEl = document.getElementById("combat-log");
  if (!logEl) return;
  const line = document.createElement("div");
  line.innerHTML = html;
  logEl.appendChild(line);
  logEl.scrollTop = logEl.scrollHeight;
}

// Inicialização da página + Câmera do Grid (Pan com Mouse & Zoom no Cursor)
document.addEventListener("DOMContentLoaded", () => {
  updateUI();
  if (window.lucide) {
    lucide.createIcons();
  }

  const viewport = document.getElementById("camera-viewport");
  if (!viewport) return;

  // Impede menu de contexto ao arrastar com botão direito no mapa (padrão Roll20)
  viewport.addEventListener("contextmenu", (e) => e.preventDefault());

  // Início do Arrasto (Mouse) - funciona com botão esquerdo, meio ou direito
  viewport.addEventListener("mousedown", (e) => {
    if (e.target.closest && e.target.closest("#reaction-prompt-overlay")) return;
    if (e.button !== 0 && e.button !== 1 && e.button !== 2) return;
    if (e.button === 1) e.preventDefault(); // Evita autoscroll do navegador

    cameraState.isDragging = true;
    cameraState.wasDragged = false;
    cameraState.startMouseX = e.clientX;
    cameraState.startMouseY = e.clientY;
    cameraState.startCamX = cameraState.x;
    cameraState.startCamY = cameraState.y;
  });

  // Movimento do Arrasto (Mouse em qualquer lugar da janela)
  window.addEventListener("mousemove", (e) => {
    if (!cameraState.isDragging) return;

    const dx = e.clientX - cameraState.startMouseX;
    const dy = e.clientY - cameraState.startMouseY;

    // Só considera arrasto se moveu mais de 4px (preserva cliques normais nas células)
    if (!cameraState.wasDragged && Math.hypot(dx, dy) > 4) {
      cameraState.wasDragged = true;
      viewport.classList.add("is-dragging");
    }

    if (cameraState.wasDragged) {
      cameraState.x = cameraState.startCamX + dx;
      cameraState.y = cameraState.startCamY + dy;
      applyCameraTransform(false);
    }
  });

  // Fim do Arrasto (Mouse)
  window.addEventListener("mouseup", () => {
    if (!cameraState.isDragging) return;
    cameraState.isDragging = false;
    viewport.classList.remove("is-dragging");

    // Reseta flag de arrasto logo após o ciclo de evento click terminar
    setTimeout(() => {
      cameraState.wasDragged = false;
    }, 0);
  });

  // Suporte a Touch (Arrastar câmera em celular/tablet)
  viewport.addEventListener("touchstart", (e) => {
    if (e.target.closest && e.target.closest("#reaction-prompt-overlay")) return;
    if (e.touches.length !== 1) return;
    cameraState.isDragging = true;
    cameraState.wasDragged = false;
    cameraState.startMouseX = e.touches[0].clientX;
    cameraState.startMouseY = e.touches[0].clientY;
    cameraState.startCamX = cameraState.x;
    cameraState.startCamY = cameraState.y;
  }, { passive: true });

  viewport.addEventListener("touchmove", (e) => {
    if (!cameraState.isDragging || e.touches.length !== 1) return;
    const dx = e.touches[0].clientX - cameraState.startMouseX;
    const dy = e.touches[0].clientY - cameraState.startMouseY;

    if (!cameraState.wasDragged && Math.hypot(dx, dy) > 5) {
      cameraState.wasDragged = true;
    }

    if (cameraState.wasDragged) {
      e.preventDefault();
      cameraState.x = cameraState.startCamX + dx;
      cameraState.y = cameraState.startCamY + dy;
      applyCameraTransform(false);
    }
  }, { passive: false });

  viewport.addEventListener("touchend", () => {
    cameraState.isDragging = false;
    setTimeout(() => {
      cameraState.wasDragged = false;
    }, 0);
  });

  // Zoom suave com a Roda do Mouse (focado exatamente onde o cursor aponta!)
  viewport.addEventListener("wheel", (e) => {
    e.preventDefault();
    const rect = viewport.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const delta = e.deltaY < 0 ? 0.12 : -0.12;
    zoomAtPoint(cameraState.zoom + delta, mouseX, mouseY, false);
  }, { passive: false });

  // Reajusta limites caso a janela seja redimensionada
  window.addEventListener("resize", () => {
    const modal = document.getElementById("combat-modal");
    if (modal && !modal.classList.contains("hidden")) {
      applyCameraTransform(false);
    }
  });
});
