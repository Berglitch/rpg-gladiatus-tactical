// ============================================================================
// MOTOR DE ÁUDIO PROCEDURAL & TRILHA SONORA DE COMBATE (Web Audio API)
// Funciona 100% nativo no navegador sem dependências externas ou erros de CORS
// ============================================================================

var GameAudio = (window.GameAudio = (() => {
  let ctx = null;
  let masterGain = null;
  let musicGain = null;
  let sfxGain = null;
  let reverbNode = null;

  let isMuted = false;
  let isMusicEnabled = true;
  let isMusicPlaying = false;
  let musicSchedulerTimer = null;
  let currentStep = 0;
  let nextStepTime = 0;

  const BPM = 126;
  const STEP_DURATION = 60 / BPM / 2; // Colcheias (8th notes)

  function init() {
    try {
      if (!ctx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return false;

        ctx = new AudioCtx();

        masterGain = ctx.createGain();
        masterGain.gain.value = 0.92;
        masterGain.connect(ctx.destination);

        // Reverb sintético (acústica de clareira/arena medieval)
        reverbNode = createImpulseReverb(1.4, 2.8);

        const reverbWet = ctx.createGain();
        reverbWet.gain.value = 0.28;
        reverbNode.connect(reverbWet);
        reverbWet.connect(masterGain);

        musicGain = ctx.createGain();
        musicGain.gain.value = 0.45;
        musicGain.connect(masterGain);
        musicGain.connect(reverbNode);

        sfxGain = ctx.createGain();
        sfxGain.gain.value = 0.95;
        sfxGain.connect(masterGain);
        sfxGain.connect(reverbNode);
      }

      if (ctx.state === "suspended") {
        ctx.resume();
      }
      return true;
    } catch (err) {
      console.error("Erro ao iniciar AudioContext:", err);
      return false;
    }
  }

  function runWhenReady(fn) {
    if (!init() || !ctx) return;
    if (ctx.state === "running") {
      fn();
    } else {
      ctx.resume().then(() => {
        if (ctx && ctx.state === "running") {
          fn();
        }
      }).catch((e) => console.warn("Audio resume pendente:", e));
    }
  }

  function createImpulseReverb(durationSec, decay) {
    const sampleRate = ctx.sampleRate;
    const length = Math.floor(sampleRate * durationSec);
    const impulse = ctx.createBuffer(2, length, sampleRate);

    for (let ch = 0; ch < 2; ch++) {
      const data = impulse.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
      }
    }

    const convolver = ctx.createConvolver();
    convolver.buffer = impulse;
    return convolver;
  }

  function createNoiseBuffer(durationSec) {
    const length = Math.floor(ctx.sampleRate * durationSec);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  function midiToFreq(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  // ==========================================================================
  // EFEITOS SONOROS FÍSICOS REALISTAS (Foley Digital Sample-Level PCM)
  // ==========================================================================

  // 1. Som Fiel de Corte de Espada (Fio de aço rasgando o ar + corte seco de lâmina)
  function playSwordSlash() {
    if (isMuted) return;
    runWhenReady(() => {
      if (isMuted) return;
      const sr = ctx.sampleRate;
      const dur = 0.34;
      const len = Math.floor(sr * dur);
      const buf = ctx.createBuffer(1, len, sr);
      const out = buf.getChannelData(0);

      // Pequena variação natural de afinação a cada golpe (±4%)
      const pitchVar = 0.96 + Math.random() * 0.08;

      // Ressonâncias metálicas sutis do fio da espada ("Shhhk")
      const bladeModes = [
        { f: 2480 * pitchVar, r: 0.9986, a: 0.018 },
        { f: 3820 * pitchVar, r: 0.9982, a: 0.015 },
        { f: 5390 * pitchVar, r: 0.9976, a: 0.012 },
        { f: 7240 * pitchVar, r: 0.9970, a: 0.009 }
      ].map((m) => ({
        ...m,
        c: 2 * m.r * Math.cos((2 * Math.PI * m.f) / sr),
        r2: m.r * m.r,
        y1: 0,
        y2: 0
      }));

      let lpAir = 0;
      let hpAirPrev = 0;
      let lpCut = 0;

      const sliceStart = Math.floor(0.055 * sr); // Momento exato que a lâmina corta o alvo (55ms)

      for (let i = 0; i < len; i++) {
        const t = i / sr;
        const white = Math.random() * 2 - 1;

        // A) Chicote curto e afiado da lâmina cortando o vento (0ms -> 115ms)
        let airEnv = 0;
        if (t < 0.12) {
          const x = t / 0.12;
          airEnv = Math.sin(Math.PI * Math.pow(x, 0.65)) * 0.65;
        }
        // Filtro passa-faixa dinâmico varrendo rápido (vento da espada)
        const cutoff = 0.12 + 0.42 * Math.exp(-Math.pow((t - 0.048) / 0.032, 2));
        lpAir += cutoff * (white - lpAir);
        const bpAir = lpAir - hpAirPrev;
        hpAirPrev = lpAir * 0.88;
        const airSample = bpAir * airEnv;

        // B) Raspagem metálica aguda do aço durante o golpe
        const scrapeExc = white * (t < 0.09 ? Math.exp(-t * 28) : 0);
        let metalRing = 0;
        for (let m = 0; m < bladeModes.length; m++) {
          const bm = bladeModes[m];
          const y = bm.c * bm.y1 - bm.r2 * bm.y2 + scrapeExc * bm.a;
          bm.y2 = bm.y1;
          bm.y1 = y;
          metalRing += y;
        }

        // C) Corte real na carne/couro ("Schtk!" fibroso e seco, sem som eletrônico)
        let cutSample = 0;
        if (i >= sliceStart) {
          const ct = (i - sliceStart) / sr;
          // Rasgo fibroso agudo/médio (lâmina rasgando armadura/tecido)
          const tearEnv = Math.exp(-ct * 48);
          const grain = (Math.sin(ct * 1950) > 0 ? 1.15 : 0.75); // Textura de rasgo
          lpCut += 0.52 * (white * grain - lpCut);
          const crispTear = (white - lpCut * 0.55) * tearEnv * 0.78;

          // Impacto físico curto e seco do corte (sem pitch bend artificial)
          const thwackEnv = Math.exp(-ct * 68);
          const thwack = Math.sin(2 * Math.PI * 118 * ct * Math.exp(-ct * 12)) * thwackEnv * 0.52;

          cutSample = crispTear + thwack;
        }

        // Saturação suave analógica para dar peso e presença real
        out[i] = Math.tanh((airSample + metalRing + cutSample) * 1.45) * 0.88;
      }

      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(sfxGain);
      src.start(ctx.currentTime);
    });
  }

  // 2. Som Fiel de Defesa / Bloqueio de Espadas (Aço Temperado batendo em Aço!)
  function playParryClang() {
    if (isMuted) return;
    runWhenReady(() => {
      if (isMuted) return;
      const sr = ctx.sampleRate;
      const dur = 0.68;
      const len = Math.floor(sr * dur);
      const buf = ctx.createBuffer(1, len, sr);
      const out = buf.getChannelData(0);

      const p = 0.97 + Math.random() * 0.06;

      // Modos físicos reais de vibração transversal de duas lâminas de aço carbono
      // Pares próximos geram o batimento metálico autêntico de espadas cruzadas!
      const swordModes = [
        { f: 1085 * p, decay: 9.5, amp: 0.16 },
        { f: 1642 * p, decay: 7.2, amp: 0.24 },
        { f: 1656 * p, decay: 7.8, amp: 0.19 }, // Batimento real entre as 2 lâminas
        { f: 2490 * p, decay: 6.5, amp: 0.28 },
        { f: 2508 * p, decay: 7.0, amp: 0.21 },
        { f: 3465 * p, decay: 8.5, amp: 0.22 },
        { f: 4580 * p, decay: 11.0, amp: 0.18 },
        { f: 5890 * p, decay: 14.5, amp: 0.14 },
        { f: 7420 * p, decay: 19.0, amp: 0.10 },
        { f: 9380 * p, decay: 26.0, amp: 0.07 }
      ].map((m) => ({
        ...m,
        phase: Math.random() * 0.4,
        w: (2 * Math.PI * m.f) / sr
      }));

      let scrapeLp = 0;

      for (let i = 0; i < len; i++) {
        const t = i / sr;
        const white = Math.random() * 2 - 1;

        // A) Impacto duro inicial de ferro contra ferro ("CLACK!" nos primeiros 9ms)
        const clackEnv = Math.exp(-t * 210);
        const guardClick =
          (Math.sin(2 * Math.PI * 820 * t) * 0.5 + white * 0.85) * clackEnv * 1.15;

        // Micro-rebote secundário da guarda da espada em 7ms ("ka-CHING!")
        let scrapeSample = 0;
        if (t >= 0.006 && t < 0.095) {
          const st = t - 0.006;
          // Deslize metálico áspero de aço raspando em aço
          const raspMod = 0.65 + 0.35 * Math.sin(2 * Math.PI * 3100 * st);
          scrapeLp += 0.68 * (white * raspMod - scrapeLp);
          const highScrape = white - scrapeLp * 0.6;
          scrapeSample = highScrape * Math.exp(-st * 42) * 0.48;
        }

        // B) Ressonância cristalina das lâminas de aço vibrando após o choque
        let ring = 0;
        if (t >= 0.003) {
          const rt = t - 0.003;
          // Pequena modulação de fase nos primeiros 8ms (não-linearidade de impacto em placa/barra)
          const impactChirp = 1 + 0.018 * Math.exp(-rt * 180);
          for (let k = 0; k < swordModes.length; k++) {
            const sm = swordModes[k];
            sm.phase += sm.w * impactChirp;
            ring += Math.sin(sm.phase) * sm.amp * Math.exp(-rt * sm.decay);
          }
        }

        // Compressão de transiente tipo fita/estúdio para deixar o som de metal encorpado e real
        out[i] = Math.tanh((guardClick + scrapeSample + ring) * 1.35) * 0.9;
      }

      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(sfxGain);
      src.start(ctx.currentTime);
    });
  }

  // 2B. Som de Golpe Pesado + Empurrão + Atordoamento
  function playHeavySmash() {
    if (isMuted) return;
    runWhenReady(() => {
      if (isMuted) return;
      const sr = ctx.sampleRate;
      const dur = 0.58;
      const len = Math.floor(sr * dur);
      const buf = ctx.createBuffer(1, len, sr);
      const out = buf.getChannelData(0);

      let lpBoom = 0;
      let lpWind = 0;

      for (let i = 0; i < len; i++) {
        const t = i / sr;
        const white = Math.random() * 2 - 1;

        // Corte pesado rasgando o ar antes da pancada (0 - 80ms)
        const swingEnv = t < 0.09 ? Math.sin((Math.PI * t) / 0.09) * 0.6 : 0;
        lpWind += 0.22 * (white - lpWind);
        const heavySwing = lpWind * swingEnv;

        // Impacto esmagador + onda de choque de 6 metros (em 65ms)
        let smash = 0;
        if (t >= 0.06) {
          const it = t - 0.06;
          const bodyPunch = Math.sin(2 * Math.PI * (92 * Math.exp(-it * 6) + 34) * it) * Math.exp(-it * 9.5) * 0.95;
          lpBoom += 0.35 * (white - lpBoom);
          const crunch = lpBoom * Math.exp(-it * 24) * 0.85;
          // Ressonância metálica grave da arma pesada + tinido agudo do atordoamento
          const clang =
            (Math.sin(2 * Math.PI * 1240 * it) * 0.22 + Math.sin(2 * Math.PI * 1980 * it) * 0.16) *
            Math.exp(-it * 11);
          const stunRing =
            (Math.sin(2 * Math.PI * 2860 * it) * 0.09 + Math.sin(2 * Math.PI * 3420 * it) * 0.07) *
            Math.exp(-it * 4.5);

          smash = bodyPunch + crunch + clang + stunRing;
        }

        out[i] = Math.tanh((heavySwing + smash) * 1.4) * 0.92;
      }

      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(sfxGain);
      src.start(ctx.currentTime);
    });
  }

  // 3. Passos Táticos na Grama/Terra ao Mover no Grid
  function playFootsteps(stepsCount = 2) {
    if (!init() || isMuted) return;
    const count = Math.min(4, Math.max(2, stepsCount));
    const now = ctx.currentTime;

    for (let i = 0; i < count; i++) {
      const t = now + i * 0.095;
      const noise = ctx.createBufferSource();
      noise.buffer = createNoiseBuffer(0.07);

      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = 520 + (i % 2) * 140;
      filter.Q.value = 1.6;

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.22, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.065);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(sfxGain);
      noise.start(t);
    }
  }

  // 4. Alerta Dramático de Ataque Inimigo Iminente (Prompt de Reação)
  function playReactionAlert() {
    if (!init() || isMuted) return;
    const now = ctx.currentTime;

    const notes = [587.33, 880.0]; // D5 -> A5 (quinta justa tensa e clara)
    notes.forEach((freq, idx) => {
      const t = now + idx * 0.075;
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, t);

      const g = ctx.createGain();
      g.gain.setValueAtTime(0.001, t);
      g.gain.linearRampToValueAtTime(0.25, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.24);

      osc.connect(g);
      g.connect(sfxGain);
      osc.start(t);
      osc.stop(t + 0.25);
    });
  }

  // 5. Trompa de Guerra / Início de Combate
  function playCombatStartHorn() {
    if (isMuted) return;
    runWhenReady(() => {
      if (isMuted) return;
      const now = ctx.currentTime + 0.01;

      // Impacto de tambor de guerra inicial
      playWarDrum(now, 1.0, true);

      // Trompa grave épica em Ré (D3 = 146.83 Hz)
      [146.83, 220.0].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(freq * 0.97, now);
        osc.frequency.linearRampToValueAtTime(freq, now + 0.18);

        const filter = ctx.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.setValueAtTime(280, now);
        filter.frequency.exponentialRampToValueAtTime(1150, now + 0.35);
        filter.frequency.exponentialRampToValueAtTime(450, now + 1.25);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(idx === 0 ? 0.3 : 0.16, now + 0.2);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 1.3);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(sfxGain);
        osc.start(now);
        osc.stop(now + 1.35);
      });
    });
  }

  // 6. Fanfarra de Vitória & Som de Derrota
  function playVictoryFanfare() {
    if (!init() || isMuted) return;
    stopBattleMusic();
    const now = ctx.currentTime;
    // Arpejo heroico em Ré Maior (D4, F#4, A4, D5)
    const notes = [293.66, 369.99, 440.0, 587.33];
    notes.forEach((freq, i) => {
      const t = now + i * 0.13;
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = freq;

      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 1800;

      const g = ctx.createGain();
      g.gain.setValueAtTime(0.001, t);
      g.gain.linearRampToValueAtTime(0.24, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + (i === 3 ? 0.95 : 0.38));

      osc.connect(filter);
      filter.connect(g);
      g.connect(sfxGain);
      osc.start(t);
      osc.stop(t + 1.0);
    });
  }

  function playDefeatSound() {
    if (!init() || isMuted) return;
    stopBattleMusic();
    const now = ctx.currentTime;
    const notes = [293.66, 277.18, 261.63, 220.0];
    notes.forEach((freq, i) => {
      const t = now + i * 0.22;
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = freq;

      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 650;

      const g = ctx.createGain();
      g.gain.setValueAtTime(0.22, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.55);

      osc.connect(filter);
      filter.connect(g);
      g.connect(sfxGain);
      osc.start(t);
      osc.stop(t + 0.6);
    });
  }

  // ==========================================================================
  // TRILHA SONORA DE COMBATE ORQUESTRAL DARK FANTASY (LOOP EM RÉ MENOR)
  // ==========================================================================
  function playWarDrum(time, accent = 1.0, toSfx = false) {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(105 * accent, time);
    osc.frequency.exponentialRampToValueAtTime(34, time + 0.24);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.55 * accent, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.28);

    osc.connect(gain);
    gain.connect(toSfx ? sfxGain : musicGain);
    osc.start(time);
    osc.stop(time + 0.3);

    // Pele do tambor (ataque percussivo)
    const skin = ctx.createBufferSource();
    skin.buffer = createNoiseBuffer(0.05);
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 260;
    const skinGain = ctx.createGain();
    skinGain.gain.setValueAtTime(0.22 * accent, time);
    skinGain.gain.exponentialRampToValueAtTime(0.001, time + 0.045);

    skin.connect(filter);
    filter.connect(skinGain);
    skinGain.connect(toSfx ? sfxGain : musicGain);
    skin.start(time);
  }

  function playPercTick(time, vol = 0.14) {
    const src = ctx.createBufferSource();
    src.buffer = createNoiseBuffer(0.035);
    const filter = ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 2200;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + 0.03);
    src.connect(filter);
    filter.connect(g);
    g.connect(musicGain);
    src.start(time);
  }

  function playSpiccatoStrings(midiNote, time, duration, vel = 0.18) {
    const freq = midiToFreq(midiNote);
    [-6, 6].forEach((detuneCents) => {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = freq;
      osc.detune.value = detuneCents;

      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(1450, time);
      filter.frequency.exponentialRampToValueAtTime(420, time + duration);

      const g = ctx.createGain();
      g.gain.setValueAtTime(0.001, time);
      g.gain.linearRampToValueAtTime(vel * 0.5, time + 0.015);
      g.gain.exponentialRampToValueAtTime(0.001, time + duration);

      osc.connect(filter);
      filter.connect(g);
      g.connect(musicGain);
      osc.start(time);
      osc.stop(time + duration + 0.02);
    });
  }

  function playDarkPadChord(midiNotes, time, duration) {
    midiNotes.forEach((m) => {
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = midiToFreq(m);

      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 720;

      const g = ctx.createGain();
      g.gain.setValueAtTime(0.001, time);
      g.gain.linearRampToValueAtTime(0.085, time + 0.35);
      g.gain.setValueAtTime(0.075, time + duration - 0.35);
      g.gain.exponentialRampToValueAtTime(0.001, time + duration);

      osc.connect(filter);
      filter.connect(g);
      g.connect(musicGain);
      osc.start(time);
      osc.stop(time + duration + 0.05);
    });
  }

  function playLeadBrass(midiNote, time, duration) {
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = midiToFreq(midiNote);

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(380, time);
    filter.frequency.linearRampToValueAtTime(1350, time + 0.08);
    filter.frequency.exponentialRampToValueAtTime(600, time + duration);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, time);
    g.gain.linearRampToValueAtTime(0.11, time + 0.04);
    g.gain.exponentialRampToValueAtTime(0.001, time + duration);

    osc.connect(filter);
    filter.connect(g);
    g.connect(musicGain);
    osc.start(time);
    osc.stop(time + duration + 0.03);
  }

  // Sequência de 32 passos (4 compassos de 4/4 em colcheias) - Tema Dark Fantasy em Ré Menor
  const BASS_PATTERN = [
    // Compasso 1: Dm (D2=38, A2=45, D3=50)
    38, 38, 50, 38, 45, 38, 48, 45,
    // Compasso 2: Bb (Bb1=34, F2=41, Bb2=46)
    34, 34, 46, 34, 41, 34, 45, 41,
    // Compasso 3: Gm (G1=31, D2=38, G2=43)
    31, 31, 43, 31, 38, 31, 41, 38,
    // Compasso 4: A7sus4 -> A7 (A1=33, E2=40, G2=43, C#2=37)
    33, 33, 45, 40, 43, 40, 37, 40
  ];

  const CHORD_BARS = [
    [50, 53, 57], // Dm (D3, F3, A3)
    [46, 50, 53], // Bb (Bb2, D3, F3)
    [43, 46, 50], // Gm (G2, Bb2, D3)
    [45, 49, 52]  // A  (A2, C#3, E3)
  ];

  // Melodia épica esparsa nos compassos
  const MELODY_EVENTS = {
    0: { note: 62, len: 3 },   // D4
    3: { note: 65, len: 2 },   // F4
    5: { note: 64, len: 3 },   // E4
    8: { note: 62, len: 4 },   // D4
    12: { note: 60, len: 2 },  // C4
    14: { note: 58, len: 2 },  // Bb3
    16: { note: 55, len: 4 },  // G3
    20: { note: 58, len: 2 },  // Bb3
    22: { note: 62, len: 2 },  // D4
    24: { note: 64, len: 4 },  // E4
    28: { note: 61, len: 4 }   // C#4
  };

  function scheduleStep(stepIdx, time) {
    if (!isMusicEnabled || isMuted) return;

    const barStep = stepIdx % 8;
    const loopStep = stepIdx % 32;

    // 1. Tambores de guerra tribais (1, 3.5, 4, 6.5)
    if (barStep === 0) playWarDrum(time, 1.0);
    else if (barStep === 3) playWarDrum(time, 0.68);
    else if (barStep === 4) playWarDrum(time, 0.88);
    else if (barStep === 6) playWarDrum(time, 0.62);

    // Percussão metálica leve marcando contratempo
    if (barStep % 2 === 1) {
      playPercTick(time, barStep === 7 ? 0.16 : 0.09);
    }

    // 2. Ostinato tenso de violoncelos/baixos
    const bassNote = BASS_PATTERN[loopStep];
    const isAccent = barStep === 0 || barStep === 4 || barStep === 2;
    playSpiccatoStrings(bassNote, time, STEP_DURATION * 0.9, isAccent ? 0.22 : 0.14);

    // 3. Acordes sombrios de fundo no início de cada compasso (a cada 8 steps)
    if (barStep === 0) {
      const barIndex = Math.floor(loopStep / 8);
      playDarkPadChord(CHORD_BARS[barIndex], time, STEP_DURATION * 7.8);
    }

    // 4. Melodia heroica de trompas/metais
    if (MELODY_EVENTS[loopStep]) {
      const m = MELODY_EVENTS[loopStep];
      playLeadBrass(m.note, time, STEP_DURATION * m.len * 0.92);
    }
  }

  function schedulerLoop() {
    if (!isMusicPlaying || !ctx) return;

    if (ctx.state !== "running") {
      ctx.resume();
      musicSchedulerTimer = setTimeout(schedulerLoop, 80);
      return;
    }

    // Caso a aba tenha ficado em background, realinha o relógio sem empilhar notas
    if (nextStepTime < ctx.currentTime - 0.1) {
      nextStepTime = ctx.currentTime + 0.05;
    }

    while (nextStepTime < ctx.currentTime + 0.18) {
      scheduleStep(currentStep, nextStepTime);
      nextStepTime += STEP_DURATION;
      currentStep = (currentStep + 1) % 32;
    }

    musicSchedulerTimer = setTimeout(schedulerLoop, 45);
  }

  function startBattleMusic() {
    runWhenReady(() => {
      stopBattleMusic();

      isMusicPlaying = true;
      currentStep = 0;
      nextStepTime = ctx.currentTime + 0.12;

      if (musicGain) {
        musicGain.gain.cancelScheduledValues(ctx.currentTime);
        musicGain.gain.setValueAtTime(0.01, ctx.currentTime);
        musicGain.gain.linearRampToValueAtTime(isMusicEnabled && !isMuted ? 0.45 : 0.0, ctx.currentTime + 0.6);
      }

      schedulerLoop();
      updateAudioButtonsUI();
    });
  }

  function stopBattleMusic() {
    isMusicPlaying = false;
    if (musicSchedulerTimer) {
      clearTimeout(musicSchedulerTimer);
      musicSchedulerTimer = null;
    }
    if (ctx && musicGain) {
      const now = ctx.currentTime;
      musicGain.gain.cancelScheduledValues(now);
      musicGain.gain.setValueAtTime(musicGain.gain.value, now);
      musicGain.gain.linearRampToValueAtTime(0.0001, now + 0.2);
    }
  }

  function toggleMusic() {
    init();
    isMusicEnabled = !isMusicEnabled;
    if (ctx && musicGain) {
      const now = ctx.currentTime;
      musicGain.gain.cancelScheduledValues(now);
      musicGain.gain.setValueAtTime(isMusicEnabled && !isMuted ? 0.45 : 0.0, now);
    }
    updateAudioButtonsUI();
  }

  function toggleMuteAll() {
    init();
    isMuted = !isMuted;
    if (ctx && masterGain) {
      const now = ctx.currentTime;
      masterGain.gain.cancelScheduledValues(now);
      masterGain.gain.setValueAtTime(isMuted ? 0.0 : 0.92, now);
    }
    updateAudioButtonsUI();
  }

  function updateAudioButtonsUI() {
    const musicBtn = document.getElementById("btn-toggle-music");
    const sfxBtn = document.getElementById("btn-toggle-audio");

    if (musicBtn) {
      if (isMusicEnabled && !isMuted) {
        musicBtn.innerHTML = `🎵 <span class="hidden md:inline">Música ON</span>`;
        musicBtn.className = "px-2 h-6 rounded bg-amber-950/80 hover:bg-amber-900 border border-amber-700/60 text-amber-300 font-semibold flex items-center gap-1 transition text-[11px]";
      } else {
        musicBtn.innerHTML = `🎵 <span class="hidden md:inline">Música OFF</span>`;
        musicBtn.className = "px-2 h-6 rounded bg-stone-800 hover:bg-stone-700 border border-stone-700 text-stone-400 font-semibold flex items-center gap-1 transition text-[11px]";
      }
    }

    if (sfxBtn) {
      if (!isMuted) {
        sfxBtn.innerHTML = `🔊`;
        sfxBtn.title = "Silenciar Todo o Áudio";
        sfxBtn.className = "w-6 h-6 rounded bg-stone-800 hover:bg-stone-700 text-emerald-400 flex items-center justify-center transition text-xs";
      } else {
        sfxBtn.innerHTML = `🔇`;
        sfxBtn.title = "Ativar Áudio";
        sfxBtn.className = "w-6 h-6 rounded bg-red-950/80 hover:bg-red-900 text-red-400 flex items-center justify-center transition text-xs";
      }
    }
  }

  return {
    init,
    startBattleMusic,
    stopBattleMusic,
    toggleMusic,
    toggleMuteAll,
    playSwordSlash,
    playParryClang,
    playHeavySmash,
    playFootsteps,
    playReactionAlert,
    playCombatStartHorn,
    playVictoryFanfare,
    playDefeatSound,
    updateAudioButtonsUI
  };
})());

// Destrava o contexto de áudio do navegador logo no primeiro clique/tecla da página
window.addEventListener("pointerdown", () => {
  if (window.GameAudio) window.GameAudio.init();
}, { once: true });
window.addEventListener("keydown", () => {
  if (window.GameAudio) window.GameAudio.init();
}, { once: true });
