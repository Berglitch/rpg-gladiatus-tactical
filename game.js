// Configurações Base e Estado Inicial do Personagem
const INITIAL_POINTS = 15;

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

// Estado do Combate e Grid Tático (Roll20 Style) - Dobro do Tamanho (16x10)
const GRID_COLS = 16;
const GRID_ROWS = 10;
const CELL_METERS = 1.5; // 1 quadrado ortogonal = 1,5m
const DIAGONAL_METERS = 3.0; // Movimento na diagonal conta o dobro: 3,0m
const MAX_MOVE_METERS = 9.0; // Deslocamento máximo por turno: 9 metros

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
    hasActed: false
  },
  enemy: {
    name: "Goblin Espadachim",
    hp: 5,
    maxHp: 5,
    dmg: 2, // 2 pontos de dano fixo
    dexterity: 2,
    x: 13,
    y: 5,
    initiative: 0
  },
  isActive: false,
  isMoveModeActive: false,
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

// Controle de Zoom Interativo do Grid (Roll20 Style)
let currentZoom = 1.0; // 1.0 = 100%, 1.4 = 140%, 1.8 = 180%
const MIN_ZOOM = 0.7;
const MAX_ZOOM = 2.2;
const ZOOM_STEP = 0.2;

function setZoom(newZoom) {
  currentZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, newZoom));
  const gridEl = document.getElementById("tactical-grid");
  const labelEl = document.getElementById("zoom-level-label");

  if (gridEl) {
    gridEl.style.transform = `scale(${currentZoom})`;
    gridEl.style.transformOrigin = "top left";
  }

  if (labelEl) {
    labelEl.textContent = `${Math.round(currentZoom * 100)}%`;
  }
}

function zoomIn() {
  setZoom(currentZoom + ZOOM_STEP);
}

function zoomOut() {
  setZoom(currentZoom - ZOOM_STEP);
}

function resetZoom() {
  setZoom(1.0);
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
    return `
      <div class="turn-order-card flex items-center gap-2 px-2.5 py-1 rounded-lg border ${isCurrent ? c.activeColor + ' active ring-1 ring-amber-400' : 'bg-stone-950 border-stone-800 opacity-60'}">
        <span class="text-[10px] font-mono font-bold text-stone-400">#${index + 1}</span>
        <img src="${c.avatar}" alt="${c.name}" class="w-6 h-6 rounded-full border ${c.borderColor} object-cover object-top shadow" />
        <div class="leading-tight">
          <div class="text-[11px] font-bold ${isCurrent ? 'text-amber-200' : 'text-stone-300'}">${c.name} ${isCurrent ? '⭐' : ''}</div>
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

// Algoritmo de Dijkstra para encontrar todas as células alcançáveis até 9 metros
// Regra: Ortogonal = 1,5m | Diagonal = 3,0m (o dobro do deslocamento)
function getReachableCells(startX, startY, maxMeters, blockedCells) {
  const minCost = new Map();
  const queue = [{ x: startX, y: startY, cost: 0 }];
  minCost.set(`${startX},${startY}`, 0);

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
    // Ordena para pegar o menor custo acumulado (Dijkstra)
    queue.sort((a, b) => a.cost - b.cost);
    const current = queue.shift();

    if (current.cost > minCost.get(`${current.x},${current.y}`)) {
      continue;
    }

    for (const dir of directions) {
      const nx = current.x + dir.dx;
      const ny = current.y + dir.dy;
      const newCost = current.cost + dir.cost;

      // Verifica limites do mapa (16x10) e custo máximo (9 metros)
      if (nx >= 0 && nx < tacticalMap.cols && ny >= 0 && ny < tacticalMap.rows && newCost <= maxMeters) {
        const isBlocked = blockedCells.some(b => b.x === nx && b.y === ny);
        const key = `${nx},${ny}`;

        if (!isBlocked) {
          if (!minCost.has(key) || newCost < minCost.get(key)) {
            minCost.set(key, newCost);
            queue.push({ x: nx, y: ny, cost: newCost });
          }
        }
      }
    }
  }

  // Remove a própria posição inicial
  minCost.delete(`${startX},${startY}`);
  return minCost;
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

  // Células bloqueadas (obstáculos + inimigo)
  const blocked = [...tacticalMap.obstacles, { x: combatState.enemy.x, y: combatState.enemy.y }];
  
  // Se modo de mover estiver ativo e o jogador ainda puder se mover
  let reachableMap = new Map();
  if (combatState.isMoveModeActive && !combatState.player.hasMoved && combatState.currentTurn === "player" && combatState.isActive) {
    reachableMap = getReachableCells(combatState.player.x, combatState.player.y, MAX_MOVE_METERS, blocked);
  }

  for (let y = 0; y < tacticalMap.rows; y++) {
    for (let x = 0; x < tacticalMap.cols; x++) {
      const cell = document.createElement("div");
      cell.className = "grid-cell rounded border border-stone-800/80 flex items-center justify-center relative";
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
        token.className = "token token-player overflow-hidden";
        token.innerHTML = `<img src="https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?w=150&auto=format&fit=crop&q=80" alt="${character.name}" class="w-full h-full object-cover rounded-full filter brightness-95">`;
        token.title = `${character.name} (Você)`;
        cell.appendChild(token);
      } else if (isEnemy) {
        const token = document.createElement("div");
        token.className = "token token-enemy overflow-hidden bg-stone-900";
        token.innerHTML = `<img src="goblin-art.png" alt="Goblin" class="w-full h-full object-cover object-top rounded-full scale-125 translate-y-1">`;
        token.title = "Goblin Espadachim (5 HP)";
        cell.appendChild(token);
      } else if (reachableMap.has(cellKey)) {
        // Célula dentro do alcance de movimentação de 9 metros
        const meters = reachableMap.get(cellKey).toFixed(1);
        cell.classList.add("in-move-range");
        cell.title = `Mover até aqui (${meters}m de deslocamento)`;
        cell.onclick = () => movePlayerTo(x, y, meters);

        // Indicador de custo em metros na célula
        const stepBadge = document.createElement("span");
        stepBadge.className = "absolute text-[8px] font-mono font-bold text-sky-200 bottom-0.5 right-0.5 pointer-events-none drop-shadow";
        stepBadge.textContent = `${meters}m`;
        cell.appendChild(stepBadge);
      }

      gridEl.appendChild(cell);
    }
  }

  if (window.lucide) lucide.createIcons();
}

function toggleMoveMode() {
  if (combatState.currentTurn !== "player" || combatState.player.hasMoved || !combatState.isActive) return;

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

function movePlayerTo(targetX, targetY, meters) {
  if (combatState.currentTurn !== "player" || combatState.player.hasMoved || !combatState.isActive) return;

  combatState.player.x = targetX;
  combatState.player.y = targetY;
  combatState.player.hasMoved = true;
  combatState.isMoveModeActive = false;

  logCombatMessage(`<span class="text-sky-300 font-bold">[Movimento]</span> Você se deslocou <strong class="text-sky-200">${meters} metros</strong> até (${targetX + 1}, ${targetY + 1}).`);

  const statusEl = document.getElementById("move-mode-status");
  if (statusEl) {
    statusEl.textContent = "Movimento do turno utilizado";
    statusEl.className = "text-stone-500 font-mono text-[10px] bg-stone-900 border border-stone-800 px-2 py-0.5 rounded";
  }

  updateCombatUI();
  renderTacticalGrid();
}

function executePlayerAttack() {
  if (combatState.currentTurn !== "player" || combatState.player.hasActed || !combatState.isActive) return;

  const dist = getDistance(combatState.player.x, combatState.player.y, combatState.enemy.x, combatState.enemy.y);
  if (dist > 1) {
    logCombatMessage(`<span class="text-red-400 font-semibold">❌ Inimigo fora de alcance! Você precisa estar a 1,5m (1 quadrado) para atacar com a espada. Mova-se até ele primeiro!</span>`);
    return;
  }

  // Consumir ação
  combatState.player.hasActed = true;

  // Dano baseado em Força
  const str = getCalculatedStrength();
  const dmg = Math.floor(Math.random() * 2) + 3 + Math.floor(str * 0.8); // 3 a 5+ de dano

  combatState.enemy.hp -= dmg;
  logCombatMessage(`<span class="text-amber-300 font-bold">[Ação de Ataque]</span> Você brande sua espada com força desferindo um golpe letal de <strong class="text-red-400 font-bold">${dmg} de dano</strong> no Goblin!`);

  if (combatState.enemy.hp <= 0) {
    combatState.enemy.hp = 0;
    combatState.isActive = false;
    logCombatMessage(`<div class="text-emerald-400 font-bold mt-2">🏆 VITÓRIA! O Goblin Espadachim foi eliminado! Você conquistou 10 Moedas de Ouro e 10 XP!</div>`);
    updateCombatUI();
    renderTacticalGrid();
    return;
  }

  updateCombatUI();
  renderTacticalGrid();
}

function endPlayerTurn() {
  if (combatState.currentTurn !== "player" || !combatState.isActive) return;

  logCombatMessage(`<span class="text-stone-400 italic">[Fim do Turno] Você encerra seu turno.</span>`);
  
  // Passa para o turno do Goblin
  combatState.currentTurn = "enemy";
  updateCombatUI();
  renderTacticalGrid();

  // Executa o turno do Goblin com pequeno delay para fluidez visual
  setTimeout(() => {
    executeGoblinTurn();
  }, 900);
}

function executeGoblinTurn() {
  if (!combatState.isActive) return;

  logCombatMessage(`<span class="text-red-400 font-bold">⚔️ TURNO DO GOBLIN ESPADACHIM</span>`);

  let dist = getDistance(combatState.player.x, combatState.player.y, combatState.enemy.x, combatState.enemy.y);

  // 1. Movimentação do Goblin (até 9 metros, diagonais custando 3m)
  if (dist > 1) {
    let metersSpent = 0;
    const maxGoblinMeters = MAX_MOVE_METERS; // 9 metros

    while (metersSpent < maxGoblinMeters && dist > 1) {
      let stepX = 0;
      let stepY = 0;

      if (combatState.player.x > combatState.enemy.x) stepX = 1;
      else if (combatState.player.x < combatState.enemy.x) stepX = -1;

      if (combatState.player.y > combatState.enemy.y) stepY = 1;
      else if (combatState.player.y < combatState.enemy.y) stepY = -1;

      // Custo do passo: diagonal = 3m, ortogonal = 1.5m
      const isDiagonal = (stepX !== 0 && stepY !== 0);
      let stepCost = isDiagonal ? DIAGONAL_METERS : CELL_METERS;

      // Se tentar diagonal mas ultrapassar 9m, tenta passo ortogonal de 1.5m
      if (metersSpent + stepCost > maxGoblinMeters && isDiagonal) {
        if (Math.abs(combatState.player.x - combatState.enemy.x) >= Math.abs(combatState.player.y - combatState.enemy.y)) {
          stepY = 0;
        } else {
          stepX = 0;
        }
        stepCost = CELL_METERS;
      }

      if (metersSpent + stepCost > maxGoblinMeters) break;

      const nextX = combatState.enemy.x + stepX;
      const nextY = combatState.enemy.y + stepY;

      const isObstacle = tacticalMap.obstacles.some(o => o.x === nextX && o.y === nextY);
      const isPlayerCell = (nextX === combatState.player.x && nextY === combatState.player.y);

      if (!isObstacle && !isPlayerCell) {
        combatState.enemy.x = nextX;
        combatState.enemy.y = nextY;
        metersSpent += stepCost;
        dist = getDistance(combatState.player.x, combatState.player.y, combatState.enemy.x, combatState.enemy.y);
      } else {
        break;
      }
    }

    if (metersSpent > 0) {
      logCombatMessage(`<span class="text-red-300 text-xs">🐾 O Goblin avança pela vegetação (${metersSpent.toFixed(1)}m percorridos).</span>`);
      renderTacticalGrid();
    }
  }

  // 2. Ação do Goblin (Atacar se estiver adjacente a 1,5m)
  dist = getDistance(combatState.player.x, combatState.player.y, combatState.enemy.x, combatState.enemy.y);
  if (dist <= 1) {
    const goblinDmg = combatState.enemy.dmg; // 2 pontos de dano fixo
    combatState.player.hp -= goblinDmg;
    logCombatMessage(`<span class="text-red-400 font-bold">[Ataque do Goblin]</span> O Goblin golpeia com sua espada curta causando <strong class="text-red-400 font-bold">${goblinDmg} de dano</strong> a você!`);
  } else {
    logCombatMessage(`<span class="text-stone-400 italic text-[11px]">O Goblin não conseguiu alcançar você para atacar neste turno.</span>`);
  }

  if (combatState.player.hp <= 0) {
    combatState.player.hp = 0;
    combatState.isActive = false;
    logCombatMessage(`<div class="text-red-500 font-bold mt-2">💀 DERROTA! Você sucumbiu aos ferimentos.</div>`);
    updateCombatUI();
    renderTacticalGrid();
    return;
  }

  // Finaliza turno do Goblin e devolve a vez ao jogador com regeneração de +20 EP
  setTimeout(() => {
    startPlayerTurn();
  }, 1000);
}

function startPlayerTurn() {
  combatState.currentTurn = "player";
  combatState.player.hasMoved = false;
  combatState.player.hasActed = false;
  combatState.isMoveModeActive = false;
  combatState.round++;

  // Regeneração passiva de +20 EP por rodada
  const previousEp = combatState.player.ep;
  combatState.player.ep = Math.min(combatState.player.maxEp, combatState.player.ep + 20);
  const actualRegen = combatState.player.ep - previousEp;

  logCombatMessage(`<div class="text-emerald-400 font-bold mt-2">🛡️ SEU TURNO (Rodada ${combatState.round})</div>`);
  if (actualRegen > 0) {
    logCombatMessage(`<span class="text-amber-400 text-[11px]">⚡ Você recuperou <strong class="text-amber-300">+${actualRegen} Energia</strong> no início da rodada.</span>`);
  }

  const statusEl = document.getElementById("move-mode-status");
  if (statusEl) {
    statusEl.textContent = "Selecione 'Mover' para ver o alcance";
    statusEl.className = "text-sky-400 font-mono text-[10px] bg-sky-950/60 border border-sky-800/40 px-2 py-0.5 rounded";
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

    // Reset do Goblin
    combatState.enemy.hp = combatState.enemy.maxHp;

    // Posições Iniciais no Grid (16x10)
    combatState.player.x = 2;
    combatState.player.y = 5;
    combatState.enemy.x = 13;
    combatState.enemy.y = 5;

    combatState.isActive = true;
    combatState.isMoveModeActive = false;
    combatState.player.hasMoved = false;
    combatState.player.hasActed = false;
    combatState.round = 1;

    // Exibir o Modal Imediatamente
    modalEl.classList.remove("hidden");

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
  const modal = document.getElementById("combat-modal");
  if (modal) modal.classList.add("hidden");
  const bannerAlert = document.getElementById("combat-banner-alert");
  if (bannerAlert) bannerAlert.classList.add("hidden");
}

function restartCombat() {
  openCombatModal();
}

function updateCombatUI() {
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
    if (combatState.currentTurn === "player") {
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
    if (combatState.player.hasMoved) {
      movStatus.textContent = "✗ UTILIZADO";
      movStatus.className = "font-bold text-stone-500 text-xs";
    } else {
      movStatus.textContent = "✓ DISPONÍVEL (9m)";
      movStatus.className = "font-bold text-emerald-400 text-xs";
    }
  }

  const actStatus = document.getElementById("status-action");
  if (actStatus) {
    if (combatState.player.hasActed) {
      actStatus.textContent = "✗ UTILIZADA";
      actStatus.className = "font-bold text-stone-500 text-xs";
    } else {
      actStatus.textContent = "✓ DISPONÍVEL";
      actStatus.className = "font-bold text-emerald-400 text-xs";
    }
  }

  // Botões de Ação
  const isPlayerTurn = combatState.currentTurn === "player" && combatState.isActive;
  const moveBtn = document.getElementById("btn-toggle-move");
  const attackBtn = document.getElementById("btn-attack-action");
  const endTurnBtn = document.getElementById("btn-end-turn");

  if (moveBtn) moveBtn.disabled = !isPlayerTurn || combatState.player.hasMoved;
  if (attackBtn) attackBtn.disabled = !isPlayerTurn || combatState.player.hasActed;
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

// Suporte a Zoom com a roda do mouse no Grid (Ctrl + Scroll ou Scroll no mapa)
document.addEventListener("DOMContentLoaded", () => {
  updateUI();
  if (window.lucide) {
    lucide.createIcons();
  }

  const viewport = document.getElementById("tactical-grid")?.parentElement;
  if (viewport) {
    viewport.addEventListener("wheel", (e) => {
      // Se pressionar Ctrl ou se estiver com o cursor sobre o grid
      if (e.ctrlKey) {
        e.preventDefault();
        if (e.deltaY < 0) {
          zoomIn();
        } else {
          zoomOut();
        }
      }
    }, { passive: false });
  }
});
