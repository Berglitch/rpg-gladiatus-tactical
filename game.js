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

// Estado do Combate e Grid Tático (Roll20 Style)
const GRID_COLS = 8;
const GRID_ROWS = 5;
const CELL_METERS = 1.5; // 1 quadrado = 1,5m
const MAX_MOVE_METERS = 9; // 9 metros = 6 quadrados
const MAX_MOVE_CELLS = MAX_MOVE_METERS / CELL_METERS; // 6

const tacticalMap = {
  cols: GRID_COLS,
  rows: GRID_ROWS,
  obstacles: [
    { x: 3, y: 1 },
    { x: 3, y: 3 },
    { x: 4, y: 2 }
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
    x: 1,
    y: 2,
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
    x: 6,
    y: 2,
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

// LÓGICA DO GRID TÁTICO E COMBATE (ROLL20 STYLE)
function getDistance(x1, y1, x2, y2) {
  // Distância Chebyshev (movimentação em 8 direções padrão de grid de RPG)
  return Math.max(Math.abs(x1 - x2), Math.abs(y1 - y2));
}

function getDistanceMeters(x1, y1, x2, y2) {
  return (getDistance(x1, y1, x2, y2) * CELL_METERS).toFixed(1);
}

// Algoritmo de BFS para encontrar todas as células alcançáveis a até 6 passos (9 metros)
function getReachableCells(startX, startY, maxSteps, blockedCells) {
  const reachable = new Map();
  const queue = [{ x: startX, y: startY, steps: 0 }];
  reachable.set(`${startX},${startY}`, 0);

  const directions = [
    { dx: 1, dy: 0 }, { dx: -1, dy: 0 },
    { dx: 0, dy: 1 }, { dx: 0, dy: -1 },
    { dx: 1, dy: 1 }, { dx: 1, dy: -1 },
    { dx: -1, dy: 1 }, { dx: -1, dy: -1 }
  ];

  while (queue.length > 0) {
    const current = queue.shift();

    if (current.steps < maxSteps) {
      for (const dir of directions) {
        const nx = current.x + dir.dx;
        const ny = current.y + dir.dy;
        const key = `${nx},${ny}`;

        // Verifica limites do mapa
        if (nx >= 0 && nx < tacticalMap.cols && ny >= 0 && ny < tacticalMap.rows) {
          const isBlocked = blockedCells.some(b => b.x === nx && b.y === ny);
          if (!isBlocked && !reachable.has(key)) {
            reachable.set(key, current.steps + 1);
            queue.push({ x: nx, y: ny, steps: current.steps + 1 });
          }
        }
      }
    }
  }

  // Remove a própria posição inicial
  reachable.delete(`${startX},${startY}`);
  return reachable;
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
    reachableMap = getReachableCells(combatState.player.x, combatState.player.y, MAX_MOVE_CELLS, blocked);
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
        cell.title = "Pilar de Pedra (Bloqueado)";
      } else if (isPlayer) {
        const token = document.createElement("div");
        token.className = "token token-player text-xs";
        token.innerHTML = `<i data-lucide="shield" class="w-4 h-4 text-amber-200"></i>`;
        token.title = `${character.name} (Você)`;
        cell.appendChild(token);
      } else if (isEnemy) {
        const token = document.createElement("div");
        token.className = "token token-enemy text-xs";
        token.innerHTML = `<i data-lucide="skull" class="w-4 h-4 text-emerald-200"></i>`;
        token.title = "Goblin Espadachim (5 HP)";
        cell.appendChild(token);
      } else if (reachableMap.has(cellKey)) {
        // Célula dentro do alcance de movimentação de 9 metros (6 quadrados)
        const steps = reachableMap.get(cellKey);
        const meters = (steps * CELL_METERS).toFixed(1);
        cell.classList.add("in-move-range");
        cell.title = `Mover até aqui (${meters}m / ${steps} quad.)`;
        cell.onclick = () => movePlayerTo(x, y, meters, steps);

        // Indicador sutil de distância na célula
        const stepBadge = document.createElement("span");
        stepBadge.className = "absolute text-[9px] font-mono text-sky-300/80 bottom-0.5 right-1 pointer-events-none";
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

function movePlayerTo(targetX, targetY, meters, steps) {
  if (combatState.currentTurn !== "player" || combatState.player.hasMoved || !combatState.isActive) return;

  combatState.player.x = targetX;
  combatState.player.y = targetY;
  combatState.player.hasMoved = true;
  combatState.isMoveModeActive = false;

  logCombatMessage(`<span class="text-sky-300 font-bold">[Movimento]</span> Você se deslocou <strong class="text-sky-200">${meters} metros (${steps} quadrados)</strong> até a posição (${targetX + 1}, ${targetY + 1}).`);

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

  // 1. Movimentação do Goblin (até 9 metros / 6 quadrados em direção ao jogador)
  if (dist > 1) {
    let stepsTaken = 0;
    const maxGoblinSteps = MAX_MOVE_CELLS; // 6 passos = 9m

    while (stepsTaken < maxGoblinSteps && dist > 1) {
      let stepX = 0;
      let stepY = 0;

      if (combatState.player.x > combatState.enemy.x) stepX = 1;
      else if (combatState.player.x < combatState.enemy.x) stepX = -1;

      if (combatState.player.y > combatState.enemy.y) stepY = 1;
      else if (combatState.player.y < combatState.enemy.y) stepY = -1;

      const nextX = combatState.enemy.x + stepX;
      const nextY = combatState.enemy.y + stepY;

      const isObstacle = tacticalMap.obstacles.some(o => o.x === nextX && o.y === nextY);
      const isPlayerCell = (nextX === combatState.player.x && nextY === combatState.player.y);

      if (!isObstacle && !isPlayerCell) {
        combatState.enemy.x = nextX;
        combatState.enemy.y = nextY;
        stepsTaken++;
        dist = getDistance(combatState.player.x, combatState.player.y, combatState.enemy.x, combatState.enemy.y);
      } else {
        break;
      }
    }

    if (stepsTaken > 0) {
      const movedMeters = (stepsTaken * CELL_METERS).toFixed(1);
      logCombatMessage(`<span class="text-red-300 text-xs">🐾 O Goblin avança velozmente pelo grid (${movedMeters}m).</span>`);
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
  const nameInput = document.getElementById("character-name");
  if (nameInput && nameInput.value.trim() !== "") {
    character.name = nameInput.value.trim();
  }

  document.getElementById("combat-player-name").textContent = `${character.name} (Guerreiro)`;
  
  // Sincronizar vitais
  combatState.player.maxHp = getMaxHp();
  combatState.player.hp = combatState.player.maxHp;
  combatState.player.maxEp = getMaxEp();
  combatState.player.ep = combatState.player.maxEp;

  // Reset do Goblin
  combatState.enemy.hp = combatState.enemy.maxHp;

  // Posições Iniciais no Grid
  combatState.player.x = 1;
  combatState.player.y = 2;
  combatState.enemy.x = 6;
  combatState.enemy.y = 2;

  combatState.isActive = true;
  combatState.isMoveModeActive = false;
  combatState.player.hasMoved = false;
  combatState.player.hasActed = false;
  combatState.round = 1;

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

  const initDisplay = document.getElementById("initiative-display");
  if (initDisplay) {
    initDisplay.innerHTML = `Iniciativa: <span class="text-amber-300">${character.name} (${playerTotalInit})</span> vs <span class="text-emerald-400">Goblin (${goblinTotalInit})</span>`;
  }

  const logEl = document.getElementById("combat-log");
  logEl.innerHTML = `
    <div class="text-amber-400 font-bold">⚔️ COMBATE INICIADO!</div>
    <div class="text-stone-300 text-xs">🎲 Iniciativa: ${character.name} rolou [${playerRoll}] + ${playerDex} (Destreza) = <strong>${playerTotalInit}</strong> | Goblin rolou [${goblinRoll}] + ${goblinDex} = <strong>${goblinTotalInit}</strong></div>
  `;

  if (playerTotalInit >= goblinTotalInit) {
    combatState.currentTurn = "player";
    logCombatMessage(`<div class="text-emerald-400 font-bold">⚡ ${character.name} age primeiro na ordem dos turnos!</div>`);
  } else {
    combatState.currentTurn = "enemy";
    logCombatMessage(`<div class="text-red-400 font-bold">⚡ O Goblin foi mais rápido e age primeiro!</div>`);
  }

  updateCombatUI();
  renderTacticalGrid();

  document.getElementById("combat-modal").classList.remove("hidden");
  if (window.lucide) lucide.createIcons();

  // Se o Goblin tirou iniciativa mais alta, executa a vez dele
  if (combatState.currentTurn === "enemy") {
    setTimeout(() => {
      executeGoblinTurn();
    }, 1500);
  }
}

function closeCombatModal() {
  document.getElementById("combat-modal").classList.add("hidden");
  const bannerAlert = document.getElementById("combat-banner-alert");
  if (bannerAlert) bannerAlert.classList.add("hidden");
}

function restartCombat() {
  openCombatModal();
}

function updateCombatUI() {
  // Vida e Energia do Jogador
  document.getElementById("combat-p-hp").textContent = Math.max(0, combatState.player.hp);
  document.getElementById("combat-p-maxhp").textContent = combatState.player.maxHp;
  const hpPct = Math.max(0, (combatState.player.hp / combatState.player.maxHp) * 100);
  document.getElementById("combat-bar-p-hp").style.width = `${hpPct}%`;

  document.getElementById("combat-p-ep").textContent = Math.max(0, combatState.player.ep);
  document.getElementById("combat-p-maxep").textContent = combatState.player.maxEp;
  const epPct = Math.max(0, (combatState.player.ep / combatState.player.maxEp) * 100);
  document.getElementById("combat-bar-p-ep").style.width = `${epPct}%`;

  // Vida do Goblin
  document.getElementById("combat-e-hp").textContent = Math.max(0, combatState.enemy.hp);
  const eHpPct = Math.max(0, (combatState.enemy.hp / combatState.enemy.maxHp) * 100);
  document.getElementById("combat-bar-e-hp").style.width = `${eHpPct}%`;

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
      movStatus.className = "font-bold text-stone-500 bg-stone-900 border border-stone-800 px-2 py-0.5 rounded text-[10px]";
    } else {
      movStatus.textContent = "✓ DISPONÍVEL (9m)";
      movStatus.className = "font-bold text-emerald-400 bg-emerald-950/70 border border-emerald-800/50 px-2 py-0.5 rounded text-[10px]";
    }
  }

  const actStatus = document.getElementById("status-action");
  if (actStatus) {
    if (combatState.player.hasActed) {
      actStatus.textContent = "✗ UTILIZADA";
      actStatus.className = "font-bold text-stone-500 bg-stone-900 border border-stone-800 px-2 py-0.5 rounded text-[10px]";
    } else {
      actStatus.textContent = "✓ DISPONÍVEL";
      actStatus.className = "font-bold text-emerald-400 bg-emerald-950/70 border border-emerald-800/50 px-2 py-0.5 rounded text-[10px]";
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

// Inicializar na carga da página
document.addEventListener("DOMContentLoaded", () => {
  updateUI();
  if (window.lucide) {
    lucide.createIcons();
  }
});
