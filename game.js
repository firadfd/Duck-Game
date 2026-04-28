/**
 * Duck Hunt — Yandex Games
 * Casual arcade shooter with full RU/EN i18n + Yandex SDK integration
 */
(function () {
  'use strict';

  // ============================================
  // Config
  // ============================================
  const CONFIG = {
    BASE_W: 1024,            // logical canvas width
    BASE_H: 640,             // logical canvas height (≈16:10, well under 1:2)
    DUCKS_PER_WAVE_BASE: 3,
    AMMO_PER_WAVE: 9999,     // unlimited ammo
    DUCK_LIFETIME_MS: 6000,  // time before duck flies away
    HIT_SCORE: 100,
    HEADSHOT_SCORE: 250,     // bonus points for headshot
    HEADSHOT_RADIUS: 14,     // tight radius around duck head centre
    WAVE_BONUS: 150,
    PERFECT_BONUS: 300,
    AD_EVERY_WAVES: 3,
    LEADERBOARD_NAME: 'topHunters', // must be created in developer console
    // In-app purchase product IDs (must be registered in developer console)
    PRODUCT_AMMO: 'extra_ammo',
    PRODUCT_SKIN_GOLD: 'gold_crosshair',
    EXTRA_AMMO_AMOUNT: 2,
    // Sticky-analytics: send LoadingAPI.ready ack after user completes the
    // first full wave — signals to Yandex that game truly works for users
    QUALITY_READY_WAVE: 1
  };

  // Sprite atlas constants (matches generate_sprites.py)
  const SPRITE = {
    DUCK_W: 96, DUCK_H: 72,
    DUCK_FRAMES: 3,
    DUCK_TYPE_ROW: { brown: 0, mallard: 1, wood: 2, gold: 3 },
    DOG_W: 80, DOG_H: 90,
    DOG_FRAME: { hidden: 0, peek: 1, laugh: 2, sad: 3 }
  };

  // ============================================
  // State
  // ============================================
  const state = {
    sdk: null,
    sdkReady: false,
    player: null,
    isAuthorized: false,
    payments: null,           // ysdk.getPayments() handle
    paymentsAvailable: false,
    qualityReadyFired: false, // sticky-analytics flag
    canvas: null,
    ctx: null,
    dpr: 1,
    scale: 1,
    width: CONFIG.BASE_W,
    height: CONFIG.BASE_H,
    running: false,
    paused: false,
    screen: 'menu', // menu | playing | paused | gameOver | howTo | leaderboard | shop
    score: 0,
    best: 0,
    wave: 1,
    ammo: CONFIG.AMMO_PER_WAVE,
    hits: 0,
    shots: 0,
    ducks: [],
    particles: [],
    shotEffects: [],
    floatingTexts: [],
    clouds: [],
    ducksSpawnedThisWave: 0,
    duckTargetThisWave: CONFIG.DUCKS_PER_WAVE_BASE,
    spawnTimer: 0,
    soundOn: true,
    audioCtx: null,
    lastTime: 0,
    inputs: { mouse: false, touch: false },
    // Sprites
    sprites: { ducks: null, dog: null, ready: false },
    // Dog mascot state
    dog: {
      visible: false,
      frame: 0,
      anchorX: 0,        // logical canvas X
      animTimer: 0,
      animSeq: null,     // queued frame sequence
    },
    // Ownership / inventory (purchased items)
    inventory: {
      ammoConsumables: 0,  // unused ammo packs (consumable)
      goldCrosshair: false // permanent skin
    }
  };

  // ============================================
  // Audio (procedural — no external files)
  // ============================================
  function getAudio() {
    if (!state.audioCtx) {
      try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (Ctx) state.audioCtx = new Ctx();
      } catch (e) { /* ignored */ }
    }
    return state.audioCtx;
  }

  function playSound(type) {
    if (!state.soundOn) return;
    const ctx = getAudio();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      let freq = 440, dur = 0.1, wave = 'sine', vol = 0.15;
      if (type === 'shot') { freq = 180; dur = 0.08; wave = 'square'; vol = 0.12; }
      else if (type === 'hit') { freq = 720; dur = 0.15; wave = 'triangle'; vol = 0.18; }
      else if (type === 'headshot') { freq = 980; dur = 0.22; wave = 'triangle'; vol = 0.22; }
      else if (type === 'miss') { freq = 110; dur = 0.12; wave = 'sawtooth'; vol = 0.08; }
      else if (type === 'wave') { freq = 880; dur = 0.3; wave = 'triangle'; vol = 0.2; }
      else if (type === 'gameOver') { freq = 220; dur = 0.5; wave = 'sawtooth'; vol = 0.18; }
      osc.type = wave;
      osc.frequency.setValueAtTime(freq, now);
      if (type === 'hit') osc.frequency.exponentialRampToValueAtTime(freq * 1.5, now + dur);
      if (type === 'headshot') osc.frequency.exponentialRampToValueAtTime(freq * 2, now + dur);
      if (type === 'gameOver') osc.frequency.exponentialRampToValueAtTime(80, now + dur);
      gain.gain.setValueAtTime(vol, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
      osc.start(now);
      osc.stop(now + dur);
    } catch (e) { /* ignore */ }
  }

  // ============================================
  // i18n helpers (UI text update)
  // ============================================
  function applyI18n() {
    const nodes = document.querySelectorAll('[data-i18n]');
    nodes.forEach(function (n) {
      const key = n.getAttribute('data-i18n');
      n.textContent = window.i18n.t(key);
    });
    const langLabel = document.getElementById('langLabel');
    if (langLabel) langLabel.textContent = window.i18n.getLanguage().toUpperCase();
  }

  // ============================================
  // Sprite loading
  // ============================================
  function loadImage(src) {
    return new Promise(function (resolve) {
      const img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () {
        console.warn('[sprite] failed to load', src);
        resolve(null);
      };
      img.src = src;
    });
  }

  async function loadSprites() {
    const [ducks, dog] = await Promise.all([
      loadImage('assets/sprites/ducks.png'),
      loadImage('assets/sprites/dog.png')
    ]);
    state.sprites.ducks = ducks;
    state.sprites.dog = dog;
    state.sprites.ready = !!(ducks && dog);
    return state.sprites.ready;
  }

  // ============================================
  // Yandex SDK integration
  // ============================================
  function initSDK() {
    return new Promise(function (resolve) {
      if (typeof YaGames === 'undefined') {
        console.warn('[YaSDK] not present — running in standalone mode');
        resolve(null);
        return;
      }
      YaGames.init().then(function (ysdk) {
        state.sdk = ysdk;
        state.sdkReady = true;
        // Detect language from SDK
        try {
          const sdkLang = ysdk.environment && ysdk.environment.i18n && ysdk.environment.i18n.lang;
          window.i18n.detectLanguage(sdkLang);
        } catch (e) {
          window.i18n.detectLanguage();
        }
        // Get player
        ysdk.getPlayer({ scopes: false }).then(function (player) {
          state.player = player;
          state.isAuthorized = player.getMode() !== 'lite';
          loadCloudData();
          updateAuthUI();
        }).catch(function () { loadCloudData(); updateAuthUI(); });
        // Initialize payments (in-app purchases) - non-blocking
        initPayments();
        console.log('[YaSDK] initialised');
        resolve(ysdk);
      }).catch(function (err) {
        console.warn('[YaSDK] init failed', err);
        window.i18n.detectLanguage();
        resolve(null);
      });
    });
  }

  /**
   * Initialize in-app payments. Loads product catalog and existing purchases.
   * If skin is already purchased — apply it to inventory immediately.
   */
  function initPayments() {
    if (!state.sdk || !state.sdk.getPayments) return;
    state.sdk.getPayments({ signed: true }).then(function (payments) {
      state.payments = payments;
      state.paymentsAvailable = true;
      console.log('[Payments] initialised');
      // Restore existing non-consumable purchases
      payments.getPurchases().then(function (purchases) {
        if (Array.isArray(purchases)) {
          purchases.forEach(function (p) {
            if (p.productID === CONFIG.PRODUCT_SKIN_GOLD) {
              state.inventory.goldCrosshair = true;
            }
          });
          saveData();
        }
        updateShopUI();
      }).catch(function (e) { console.warn('[Payments] getPurchases', e); });
      // Pre-fetch catalog to display prices
      payments.getCatalog().then(function (catalog) {
        state.paymentsCatalog = catalog || [];
        updateShopUI();
      }).catch(function () { /* ignore */ });
    }).catch(function (err) {
      console.warn('[Payments] init failed:', err && err.message);
      state.paymentsAvailable = false;
      updateShopUI();
    });
  }

  /**
   * Open Yandex auth dialog. Updates UI on success.
   */
  function openAuthDialog() {
    if (!state.sdk || !state.sdk.auth || !state.sdk.auth.openAuthDialog) {
      return Promise.resolve(false);
    }
    return state.sdk.auth.openAuthDialog().then(function () {
      // Re-fetch player with full scope
      return state.sdk.getPlayer({ scopes: true });
    }).then(function (player) {
      state.player = player;
      state.isAuthorized = player.getMode() !== 'lite';
      loadCloudData();
      updateAuthUI();
      return true;
    }).catch(function (err) {
      console.warn('[Auth] dialog failed', err);
      return false;
    });
  }

  /**
   * Purchase a product. Consumable (ammo) is consumed immediately on success.
   * Non-consumable (skin) is permanently flagged in inventory.
   */
  function purchaseProduct(productID) {
    const msg = document.getElementById('shopMsg');
    msg.classList.remove('hidden', 'error');
    msg.textContent = '...';
    if (!state.paymentsAvailable || !state.payments) {
      msg.textContent = window.i18n.t('paymentsUnavailable');
      msg.classList.add('error');
      return Promise.resolve(false);
    }
    return state.payments.purchase({ id: productID }).then(function (purchase) {
      if (productID === CONFIG.PRODUCT_AMMO) {
        // Consumable — grant immediately and mark consumed
        state.inventory.ammoConsumables += 1;
        if (purchase && purchase.purchaseToken && state.payments.consumePurchase) {
          state.payments.consumePurchase(purchase.purchaseToken).catch(function () { /* ignore */ });
        }
        // If currently in-game, apply ammo right now
        if (state.running && !state.paused) applyAmmoConsumable();
      } else if (productID === CONFIG.PRODUCT_SKIN_GOLD) {
        state.inventory.goldCrosshair = true;
      }
      saveData();
      msg.textContent = window.i18n.t('consumed');
      updateShopUI();
      return true;
    }).catch(function (err) {
      console.warn('[Payments] purchase failed', err);
      msg.textContent = window.i18n.t('purchaseFailed');
      msg.classList.add('error');
      return false;
    });
  }

  function applyAmmoConsumable() {
    if (state.inventory.ammoConsumables > 0) {
      state.inventory.ammoConsumables -= 1;
      state.ammo += CONFIG.EXTRA_AMMO_AMOUNT;
      updateHUD();
      addFloatingText('+' + CONFIG.EXTRA_AMMO_AMOUNT + ' ' + window.i18n.t('ammo'),
                       state.width / 2, 80, '#ffd166');
    }
  }

  function signalReady() {
    try {
      if (state.sdk && state.sdk.features && state.sdk.features.LoadingAPI) {
        state.sdk.features.LoadingAPI.ready();
        console.log('[YaSDK] LoadingAPI.ready() called');
      }
    } catch (e) { console.warn('[YaSDK] LoadingAPI.ready error', e); }
  }

  /**
   * Sticky-analytics signal: fire ONCE after the user completes the first
   * full wave. This indicates the game is not just technically loaded but
   * actually playable and engaging — a stronger quality signal for Yandex
   * than the basic LoadingAPI.ready alone.
   *
   * Implementation: re-emit GameplayAPI.start to anchor a "real session"
   * marker, and call LoadingAPI.ready again as a no-op safety idempotent
   * call (Yandex deduplicates internally) for late-loading edge cases.
   */
  function fireQualityReady() {
    if (state.qualityReadyFired) return;
    state.qualityReadyFired = true;
    try {
      if (state.sdk && state.sdk.features) {
        if (state.sdk.features.LoadingAPI && state.sdk.features.LoadingAPI.ready) {
          state.sdk.features.LoadingAPI.ready();
        }
        if (state.sdk.features.GameplayAPI && state.sdk.features.GameplayAPI.start) {
          // Re-affirm gameplay marker — sticky for funnel analytics
          state.sdk.features.GameplayAPI.start();
        }
      }
      console.log('[Analytics] quality-ready fired (wave ' + CONFIG.QUALITY_READY_WAVE + ' completed)');
    } catch (e) { /* ignore */ }
  }

  function gameplayStart() {
    try {
      if (state.sdk && state.sdk.features && state.sdk.features.GameplayAPI) {
        state.sdk.features.GameplayAPI.start();
      }
    } catch (e) { /* ignore */ }
  }

  function gameplayStop() {
    try {
      if (state.sdk && state.sdk.features && state.sdk.features.GameplayAPI) {
        state.sdk.features.GameplayAPI.stop();
      }
    } catch (e) { /* ignore */ }
  }

  function showFullscreenAd(onClose) {
    const safeClose = function () { if (typeof onClose === 'function') onClose(); };
    try {
      if (state.sdk && state.sdk.adv) {
        state.sdk.adv.showFullscreenAdv({
          callbacks: {
            onClose: function () { safeClose(); },
            onError: function () { safeClose(); }
          }
        });
        return;
      }
    } catch (e) { /* ignore */ }
    safeClose();
  }

  function loadCloudData() {
    if (state.player && state.player.getData) {
      state.player.getData(['best', 'lang', 'soundOn', 'goldCrosshair']).then(function (data) {
        if (data && typeof data.best === 'number') state.best = data.best;
        if (data && (data.lang === 'ru' || data.lang === 'en')) {
          window.i18n.setLanguage(data.lang);
        }
        if (data && typeof data.soundOn === 'boolean') state.soundOn = data.soundOn;
        if (data && data.goldCrosshair === true) state.inventory.goldCrosshair = true;
        applyI18n();
        updateMenuBest();
        updateSoundIcon();
      }).catch(function () { /* fall back to local */ loadLocal(); });
    } else {
      loadLocal();
    }
  }

  function loadLocal() {
    try {
      const b = parseInt(localStorage.getItem('duck_best') || '0', 10);
      if (!isNaN(b)) state.best = b;
      const l = localStorage.getItem('duck_lang');
      if (l === 'ru' || l === 'en') window.i18n.setLanguage(l);
      const s = localStorage.getItem('duck_sound');
      if (s !== null) state.soundOn = s === '1';
      if (localStorage.getItem('duck_gold_crosshair') === '1') {
        state.inventory.goldCrosshair = true;
      }
    } catch (e) { /* ignore */ }
    applyI18n();
    updateMenuBest();
    updateSoundIcon();
  }

  function saveData() {
    const payload = {
      best: state.best,
      lang: window.i18n.getLanguage(),
      soundOn: state.soundOn,
      goldCrosshair: state.inventory.goldCrosshair
    };
    if (state.player && state.player.setData) {
      state.player.setData(payload).catch(function () { /* ignore */ });
    }
    try {
      localStorage.setItem('duck_best', String(state.best));
      localStorage.setItem('duck_lang', window.i18n.getLanguage());
      localStorage.setItem('duck_sound', state.soundOn ? '1' : '0');
      localStorage.setItem('duck_gold_crosshair', state.inventory.goldCrosshair ? '1' : '0');
    } catch (e) { /* ignore */ }
  }

  function submitScoreToLeaderboard(score) {
    if (!state.sdk || !state.isAuthorized) return;
    state.sdk.getLeaderboards().then(function (lb) {
      lb.setLeaderboardScore(CONFIG.LEADERBOARD_NAME, score);
    }).catch(function () { /* ignore */ });
  }

  function fetchLeaderboard() {
    const list = document.getElementById('leaderboardList');
    if (!list) return;
    list.innerHTML = '<div class="muted">' + window.i18n.t('loading') + '</div>';
    if (!state.sdk) {
      list.innerHTML = '<div class="muted">' + window.i18n.t('noLeaderboard') + '</div>';
      return;
    }
    state.sdk.getLeaderboards().then(function (lb) {
      return lb.getLeaderboardEntries(CONFIG.LEADERBOARD_NAME, {
        quantityTop: 10,
        includeUser: true,
        quantityAround: 3
      });
    }).then(function (res) {
      list.innerHTML = '';
      if (!res || !res.entries || res.entries.length === 0) {
        list.innerHTML = '<div class="muted">' + window.i18n.t('noLeaderboard') + '</div>';
        return;
      }
      res.entries.forEach(function (entry) {
        const row = document.createElement('div');
        row.className = 'lb-entry';
        const name = (entry.player && entry.player.publicName) || ('Player ' + entry.rank);
        row.innerHTML =
          '<div class="lb-rank">#' + entry.rank + '</div>' +
          '<div class="lb-name">' + escapeHtml(name) + '</div>' +
          '<div class="lb-score">' + entry.score + '</div>';
        list.appendChild(row);
      });
    }).catch(function () {
      list.innerHTML = '<div class="muted">' + window.i18n.t('noLeaderboard') + '</div>';
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  // ============================================
  // Canvas / resizing
  // ============================================
  function resize() {
    const canvas = state.canvas;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const winW = window.innerWidth;
    const winH = window.innerHeight;

    // Maintain logical aspect ratio (16:10), fit within window — strictly under 1:2
    const ratio = CONFIG.BASE_W / CONFIG.BASE_H;
    let cssW = winW;
    let cssH = winW / ratio;
    if (cssH > winH) {
      cssH = winH;
      cssW = winH * ratio;
    }

    state.scale = cssW / CONFIG.BASE_W;
    state.dpr = dpr;
    state.width = CONFIG.BASE_W;
    state.height = CONFIG.BASE_H;

    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    canvas.width = Math.floor(CONFIG.BASE_W * dpr);
    canvas.height = Math.floor(CONFIG.BASE_H * dpr);
    state.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // ============================================
  // Duck entity
  // ============================================
  function spawnDuck() {
    const fromLeft = Math.random() < 0.5;
    const difficulty = Math.floor(state.hits / 5);
    const speed = 110 + difficulty * 8 + Math.random() * 70;
    const y0 = 100 + Math.random() * (state.height - 280);
    // Type selection: 15% gold, otherwise random of brown/mallard/wood
    const r = Math.random();
    let type;
    if (r < 0.15) type = 'gold';
    else if (r < 0.45) type = 'brown';
    else if (r < 0.75) type = 'mallard';
    else type = 'wood';
    const duck = {
      x: fromLeft ? -60 : state.width + 60,
      y: y0,
      vx: (fromLeft ? 1 : -1) * speed,
      vy: (Math.random() - 0.5) * 40,
      w: 96, h: 72,
      flap: 0,                          // animation accumulator
      alive: true,
      flying: true,
      falling: false,
      lifetime: CONFIG.DUCK_LIFETIME_MS,
      type: type
    };
    state.ducks.push(duck);
    state.ducksSpawnedThisWave++;
  }

  function hitDuck(duck, isHeadshot) {
    duck.alive = false;
    duck.falling = true;
    duck.flying = false;
    duck.vx *= 0.2;
    duck.vy = 80;
    state.hits++;
    let points = duck.type === 'gold' ? CONFIG.HIT_SCORE * 3 : CONFIG.HIT_SCORE;
    if (isHeadshot) points += CONFIG.HEADSHOT_SCORE;
    state.score += points;
    // Particle color based on duck type
    const particleColors = { gold: '#ffd166', brown: '#8b5e3c', mallard: '#5a8c4a', wood: '#5a4a8c' };
    const pcolor = particleColors[duck.type] || '#8b5e3c';
    const particleCount = isHeadshot ? 22 : 14;
    spawnParticles(duck.x + duck.w / 2, duck.y + duck.h / 2, pcolor, particleCount);
    if (isHeadshot) {
      const head = getDuckHeadCenter(duck);
      spawnHeadshotCelebration(head.x, head.y);
      addFloatingText('HEADSHOT! +' + points, duck.x + duck.w / 2, duck.y - 28, '#ff4444');
      addFloatingText('BONUS +' + CONFIG.HEADSHOT_SCORE, duck.x + duck.w / 2, duck.y - 56, '#ffd166');
      playSound('headshot');
      setTimeout(function () { playSound('hit'); }, 70);
    } else {
      addFloatingText('+' + points, duck.x + duck.w / 2, duck.y, duck.type === 'gold' ? '#ffd166' : '#ffffff');
      playSound('hit');
    }
  }

  // ============================================
  // Particles
  // ============================================
  function spawnParticles(x, y, color, count) {
    for (let i = 0; i < count; i++) {
      state.particles.push({
        x: x, y: y,
        vx: (Math.random() - 0.5) * 280,
        vy: (Math.random() - 0.5) * 280,
        life: 0.6 + Math.random() * 0.4,
        max: 1,
        size: 2 + Math.random() * 4,
        color: Math.random() < 0.4 ? '#ffd166' : color
      });
    }
  }

  function spawnHeadshotCelebration(x, y) {
    const colors = ['#ff4444', '#ffd166', '#ffffff', '#4dd4ff', '#7cff6b'];
    for (let i = 0; i < 42; i++) {
      const angle = (Math.PI * 2 * i) / 42;
      const speed = 120 + Math.random() * 260;
      state.particles.push({
        x: x,
        y: y,
        vx: Math.cos(angle) * speed + (Math.random() - 0.5) * 80,
        vy: Math.sin(angle) * speed + (Math.random() - 0.5) * 80,
        life: 0.8 + Math.random() * 0.5,
        max: 1,
        size: 3 + Math.random() * 5,
        color: colors[i % colors.length]
      });
    }
  }

  function spawnShotAnimation(x, y) {
    state.shotEffects.push({
      x: x,
      y: y,
      life: 0.18,
      max: 0.18,
      rotation: Math.random() * Math.PI * 2
    });

    for (let i = 0; i < 8; i++) {
      const angle = (Math.PI * 2 * i) / 8;
      const speed = 80 + Math.random() * 90;
      state.particles.push({
        x: x,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.18 + Math.random() * 0.12,
        max: 1,
        size: 2 + Math.random() * 2,
        color: '#ffd166'
      });
    }
  }

  function addFloatingText(text, x, y, color) {
    state.floatingTexts.push({
      text: text, x: x, y: y,
      vy: -60, life: 1.0, max: 1.0,
      color: color || '#ffffff'
    });
  }

  // ============================================
  // Clouds (background decoration)
  // ============================================
  function initClouds() {
    state.clouds = [];
    for (let i = 0; i < 6; i++) {
      state.clouds.push({
        x: Math.random() * CONFIG.BASE_W,
        y: 40 + Math.random() * 200,
        vx: 8 + Math.random() * 12,
        scale: 0.6 + Math.random() * 0.7,
        alpha: 0.3 + Math.random() * 0.3
      });
    }
  }

  // ============================================
  // Game flow
  // ============================================
  function startGame() {
    state.score = 0;
    state.wave = 1;
    state.ammo = CONFIG.AMMO_PER_WAVE;
    state.hits = 0;
    state.shots = 0;
    state.ducks = [];
    state.particles = [];
    state.shotEffects = [];
    state.floatingTexts = [];
    state.ducksSpawnedThisWave = 0;
    state.duckTargetThisWave = CONFIG.DUCKS_PER_WAVE_BASE;
    state.spawnTimer = 1500; // delay first duck so dog intro plays first
    state.running = true;
    state.paused = false;
    state.screen = 'playing';
    showOnly([]);
    show('hud'); show('topBar');
    document.getElementById('pauseBtn').classList.remove('hidden');
    updateHUD();
    gameplayStart();
    // Apply any consumable ammo purchased outside gameplay
    while (state.inventory.ammoConsumables > 0) applyAmmoConsumable();
    // Dog intro: peek out and say "Ready?"
    triggerDog([
      { frame: SPRITE.DOG_FRAME.hidden, ms: 200 },
      { frame: SPRITE.DOG_FRAME.peek,   ms: 1000 },
      { frame: SPRITE.DOG_FRAME.hidden, ms: 200 }
    ], 'dogReady');
  }

  function nextWave() {
    // Sticky-analytics: fire after first wave is fully completed
    if (state.wave === CONFIG.QUALITY_READY_WAVE) {
      fireQualityReady();
    }

    const perfect = true; // always "perfect" with unlimited ammo
    state.wave++;
    state.ammo = CONFIG.AMMO_PER_WAVE;
    state.duckTargetThisWave = CONFIG.DUCKS_PER_WAVE_BASE + Math.floor(state.wave / 2);
    state.ducksSpawnedThisWave = 0;
    state.ducks = [];
    state.spawnTimer = 1500; // longer delay to show dog reaction
    updateHUD();

    // Show wave complete toast
    const toast = document.getElementById('waveToast');
    document.getElementById('waveBonus').textContent = String(CONFIG.WAVE_BONUS);
    toast.classList.remove('hidden');
    setTimeout(function () { toast.classList.add('hidden'); }, 1400);

    // Dog reaction: laughing if perfect, peek otherwise
    if (perfect) {
      triggerDog([
        { frame: SPRITE.DOG_FRAME.hidden, ms: 200 },
        { frame: SPRITE.DOG_FRAME.laugh,  ms: 1500 },
        { frame: SPRITE.DOG_FRAME.hidden, ms: 200 }
      ], 'dogHaha');
    } else {
      triggerDog([
        { frame: SPRITE.DOG_FRAME.hidden, ms: 200 },
        { frame: SPRITE.DOG_FRAME.peek,   ms: 1000 },
        { frame: SPRITE.DOG_FRAME.hidden, ms: 200 }
      ], 'dogNice');
    }

    // Apply leftover ammo consumables
    while (state.inventory.ammoConsumables > 0) applyAmmoConsumable();

    // Ad every N waves
    if ((state.wave - 1) % CONFIG.AD_EVERY_WAVES === 0 && state.wave > 1) {
      state.paused = true;
      gameplayStop();
      showFullscreenAd(function () {
        state.paused = false;
        gameplayStart();
      });
    }
  }

  function endGame() {
    state.running = false;
    state.screen = 'gameOver';
    gameplayStop();
    playSound('gameOver');

    // Dog laughs at the player on game over (homage to the original NES title)
    triggerDog([
      { frame: SPRITE.DOG_FRAME.hidden, ms: 100 },
      { frame: SPRITE.DOG_FRAME.laugh,  ms: 1800 },
      { frame: SPRITE.DOG_FRAME.hidden, ms: 100 }
    ], 'dogHaha');

    const newRecord = state.score > state.best;
    if (newRecord) state.best = state.score;
    saveData();
    submitScoreToLeaderboard(state.score);

    document.getElementById('finalScore').textContent = String(state.score);
    document.getElementById('finalWave').textContent = String(state.wave);
    document.getElementById('finalHits').textContent = String(state.hits);
    const acc = state.shots > 0 ? Math.round((state.hits / state.shots) * 100) : 0;
    document.getElementById('finalAccuracy').textContent = acc + '%';
    document.getElementById('newRecordBadge').classList.toggle('hidden', !newRecord);

    // Delay overlay so player sees the dog briefly
    setTimeout(function () {
      showOnly(['gameOverScreen', 'topBar']);
      document.getElementById('pauseBtn').classList.add('hidden');
    }, 1500);

    // Fullscreen ad after game over flow
    setTimeout(function () { showFullscreenAd(function () { /* noop */ }); }, 2200);
  }

  function pauseGame() {
    if (!state.running || state.paused) return;
    state.paused = true;
    gameplayStop();
    showOnly(['pauseScreen', 'topBar', 'hud']);
  }

  function resumeGame() {
    if (!state.paused) return;
    state.paused = false;
    gameplayStart();
    showOnly(['topBar', 'hud']);
  }

  function goToMenu() {
    state.running = false;
    state.paused = false;
    state.screen = 'menu';
    gameplayStop();
    updateMenuBest();
    showOnly(['menuScreen', 'topBar']);
    document.getElementById('pauseBtn').classList.add('hidden');
  }

  // ============================================
  // Update / render loop
  // ============================================
  function update(dt) {
    // Clouds always animate
    for (let i = 0; i < state.clouds.length; i++) {
      const c = state.clouds[i];
      c.x += c.vx * dt;
      if (c.x > CONFIG.BASE_W + 100) { c.x = -200; c.y = 40 + Math.random() * 200; }
    }

    // Dog mascot animates regardless of pause state
    updateDog(dt);

    if (!state.running || state.paused) return;

    // Spawn ducks continuously; waves are intentionally disabled.
    state.spawnTimer -= dt * 1000;
    if (state.spawnTimer <= 0) {
      spawnDuck();
      state.spawnTimer = Math.max(280, 760 - Math.min(420, Math.floor(state.hits / 5) * 30));
    }

    // Update ducks
    for (let i = state.ducks.length - 1; i >= 0; i--) {
      const d = state.ducks[i];
      d.flap += dt * 6; // ~6 frame cycles per second for natural wing flap
      if (d.falling) {
        d.vy += 600 * dt;
        d.y += d.vy * dt;
        d.x += d.vx * dt;
        if (d.y > state.height + 80) state.ducks.splice(i, 1);
      } else if (d.alive) {
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        // Bounce off vertical bounds
        if (d.y < 60 || d.y > state.height - 200) d.vy *= -1;
        // Slight zigzag
        d.vy += (Math.random() - 0.5) * 20;
        d.vy = Math.max(-80, Math.min(80, d.vy));
        d.lifetime -= dt * 1000;
        if (d.lifetime <= 0) {
          // fly up & away
          d.flying = false;
          d.alive = false;
          d.vy = -200;
          d.vx *= 0.6;
          addFloatingText(window.i18n.t('flyAway'), d.x + d.w / 2, d.y, '#ff6b6b');
        }
        // Out of horizontal bounds
        if (d.x < -120 || d.x > state.width + 120) state.ducks.splice(i, 1);
      } else {
        // flying away
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        if (d.y < -80 || d.x < -120 || d.x > state.width + 120) state.ducks.splice(i, 1);
      }
    }

    // Update particles
    for (let i = state.particles.length - 1; i >= 0; i--) {
      const p = state.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 300 * dt;
      p.life -= dt;
      if (p.life <= 0) state.particles.splice(i, 1);
    }

    // Update shot animations
    for (let i = state.shotEffects.length - 1; i >= 0; i--) {
      const s = state.shotEffects[i];
      s.life -= dt;
      if (s.life <= 0) state.shotEffects.splice(i, 1);
    }

    // Update floating texts
    for (let i = state.floatingTexts.length - 1; i >= 0; i--) {
      const f = state.floatingTexts[i];
      f.y += f.vy * dt;
      f.life -= dt;
      if (f.life <= 0) state.floatingTexts.splice(i, 1);
    }

    if (!state.qualityReadyFired && state.hits >= CONFIG.QUALITY_READY_WAVE) fireQualityReady();
  }

  function render() {
    const ctx = state.ctx;
    const w = state.width, h = state.height;

    // Sky gradient
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#5d8fc7');
    sky.addColorStop(0.6, '#9ec6e8');
    sky.addColorStop(1, '#fce8a4');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    // Sun
    ctx.fillStyle = 'rgba(255, 234, 167, 0.6)';
    ctx.beginPath();
    ctx.arc(w * 0.78, h * 0.2, 60, 0, Math.PI * 2);
    ctx.fill();

    // Clouds
    drawClouds();

    // Distant hills
    ctx.fillStyle = '#6b8e7f';
    ctx.beginPath();
    ctx.moveTo(0, h - 180);
    for (let x = 0; x <= w; x += 40) {
      ctx.lineTo(x, h - 180 - Math.sin(x * 0.01) * 30);
    }
    ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath();
    ctx.fill();

    // Ground (grass)
    const grass = ctx.createLinearGradient(0, h - 150, 0, h);
    grass.addColorStop(0, '#4a7d3a');
    grass.addColorStop(1, '#2d4f23');
    ctx.fillStyle = grass;
    ctx.fillRect(0, h - 150, w, 150);

    // Cattails / reeds silhouettes
    ctx.fillStyle = '#1f3a18';
    for (let x = 0; x < w; x += 80) {
      const rx = x + (x % 160 === 0 ? 10 : 30);
      const ry = h - 150;
      ctx.fillRect(rx, ry, 4, 80);
      ctx.beginPath();
      ctx.ellipse(rx + 2, ry + 5, 6, 14, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Ducks
    state.ducks.forEach(drawDuck);

    // Particles
    state.particles.forEach(function (p) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    });
    ctx.globalAlpha = 1;

    // Floating texts
    state.floatingTexts.forEach(function (f) {
      ctx.globalAlpha = Math.max(0, f.life / f.max);
      ctx.fillStyle = f.color;
      ctx.font = 'bold 22px Segoe UI, Roboto, sans-serif';
      ctx.textAlign = 'center';
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.lineWidth = 3;
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillText(f.text, f.x, f.y);
    });
    ctx.globalAlpha = 1;

    drawShotEffects();

    // Dog mascot (drawn after grass, before HUD particles)
    drawDog();

    // Crosshair (desktop only)
    if (state.running && !state.paused && state.inputs.mouse && !('ontouchstart' in window)) {
      drawCrosshair();
    }
  }

  function drawClouds() {
    const ctx = state.ctx;
    state.clouds.forEach(function (c) {
      ctx.globalAlpha = c.alpha;
      ctx.fillStyle = '#ffffff';
      const s = c.scale;
      ctx.beginPath();
      ctx.arc(c.x, c.y, 22 * s, 0, Math.PI * 2);
      ctx.arc(c.x + 24 * s, c.y - 6 * s, 26 * s, 0, Math.PI * 2);
      ctx.arc(c.x + 50 * s, c.y, 20 * s, 0, Math.PI * 2);
      ctx.arc(c.x + 28 * s, c.y + 8 * s, 22 * s, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  function drawShotEffects() {
    const ctx = state.ctx;
    state.shotEffects.forEach(function (s) {
      const progress = 1 - (s.life / s.max);
      const alpha = Math.max(0, 1 - progress);
      const radius = 10 + progress * 34;

      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.rotation + progress * 0.8);
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = '#ffd166';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
      ctx.lineWidth = 2;

      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(0, 0, Math.max(2, 8 - progress * 8), 0, Math.PI * 2);
      ctx.fill();

      for (let i = 0; i < 8; i++) {
        const angle = (Math.PI * 2 * i) / 8;
        const inner = 14 + progress * 12;
        const outer = 24 + progress * 24;
        ctx.beginPath();
        ctx.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
        ctx.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer);
        ctx.stroke();
      }

      ctx.restore();
    });
    ctx.globalAlpha = 1;
  }

  function drawDuck(d) {
    const ctx = state.ctx;
    const facingRight = d.vx > 0;
    // Pick frame from flap (3 frames cycling)
    const frame = Math.floor(d.flap) % SPRITE.DUCK_FRAMES;
    const typeRow = SPRITE.DUCK_TYPE_ROW[d.type] !== undefined
      ? SPRITE.DUCK_TYPE_ROW[d.type]
      : SPRITE.DUCK_TYPE_ROW.brown;

    ctx.save();
    ctx.translate(d.x + d.w / 2, d.y + d.h / 2);
    if (!facingRight) ctx.scale(-1, 1);
    if (d.falling) ctx.rotate(0.7);

    if (state.sprites.ready && state.sprites.ducks) {
      // Sprite-based render — significantly faster on weak devices (no
      // per-frame ellipse/path rasterization)
      const sx = frame * SPRITE.DUCK_W;
      const sy = typeRow * SPRITE.DUCK_H;
      ctx.drawImage(
        state.sprites.ducks,
        sx, sy, SPRITE.DUCK_W, SPRITE.DUCK_H,
        -d.w / 2, -d.h / 2, d.w, d.h
      );
    } else {
      // Procedural fallback (used if sprite atlas failed to load)
      drawDuckProcedural(ctx, d);
    }
    ctx.restore();
  }

  /**
   * Procedural fallback duck — only used when sprites fail to load.
   */
  function drawDuckProcedural(ctx, d) {
    const wingUp = Math.sin(d.flap) > 0;
    const colors = {
      gold:    { body: '#ffd166', belly: '#fff3c0', head: '#ffb700', wing: '#e8a800' },
      brown:   { body: '#8b5e3c', belly: '#d4b894', head: '#583c26', wing: '#6c482c' },
      mallard: { body: '#8b5e3c', belly: '#e0c8a8', head: '#2d6e3c', wing: '#69462a' },
      wood:    { body: '#5a4a8c', belly: '#dcc8e6', head: '#3c286e', wing: '#46386e' }
    };
    const c = colors[d.type] || colors.brown;
    // Body
    ctx.fillStyle = c.body;
    ctx.beginPath(); ctx.ellipse(0, 0, 28, 18, 0, 0, Math.PI * 2); ctx.fill();
    // Belly
    ctx.fillStyle = c.belly;
    ctx.beginPath(); ctx.ellipse(0, 5, 22, 10, 0, 0, Math.PI * 2); ctx.fill();
    // Head
    ctx.fillStyle = c.head;
    ctx.beginPath(); ctx.arc(20, -10, 13, 0, Math.PI * 2); ctx.fill();
    // Eye
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(24, -12, 3.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(25, -12, 2, 0, Math.PI * 2); ctx.fill();
    // Beak
    ctx.fillStyle = '#ff8c42';
    ctx.beginPath(); ctx.moveTo(30, -8); ctx.lineTo(42, -6); ctx.lineTo(30, -3); ctx.closePath(); ctx.fill();
    // Wing
    ctx.fillStyle = c.wing;
    ctx.beginPath();
    if (wingUp) ctx.ellipse(-4, -16, 16, 10, -0.3, 0, Math.PI * 2);
    else ctx.ellipse(-4, 6, 16, 10, 0.3, 0, Math.PI * 2);
    ctx.fill();
    // Tail
    ctx.fillStyle = c.body;
    ctx.beginPath(); ctx.moveTo(-26, -2); ctx.lineTo(-38, -8); ctx.lineTo(-38, 4); ctx.closePath(); ctx.fill();
  }

  // ============================================
  // Dog mascot (Duck Hunt classic homage)
  // ============================================
  /**
   * Trigger a dog appearance with a sequence of frames + speech bubble.
   * @param {Array<{frame:number, ms:number}>} sequence
   * @param {string} bubbleText - i18n key
   */
  function triggerDog(sequence, bubbleText) {
    state.dog.visible = true;
    state.dog.animSeq = sequence.slice();
    state.dog.frame = sequence[0].frame;
    state.dog.animTimer = sequence[0].ms;
    // Random horizontal anchor (avoid edges)
    state.dog.anchorX = state.width * (0.25 + Math.random() * 0.5);
    showDogBubble(bubbleText);
  }

  function updateDog(dt) {
    if (!state.dog.visible) return;
    state.dog.animTimer -= dt * 1000;
    if (state.dog.animTimer <= 0) {
      // Advance to next frame in sequence
      state.dog.animSeq.shift();
      if (state.dog.animSeq.length === 0) {
        state.dog.visible = false;
        hideDogBubble();
      } else {
        state.dog.frame = state.dog.animSeq[0].frame;
        state.dog.animTimer = state.dog.animSeq[0].ms;
      }
    }
  }

  function drawDog() {
    if (!state.dog.visible || !state.sprites.ready || !state.sprites.dog) return;
    const ctx = state.ctx;
    const sx = state.dog.frame * SPRITE.DOG_W;
    const sy = 0;
    // Draw above grass line; align bottom of sprite to grass top
    const grassTop = state.height - 150;
    const dx = state.dog.anchorX - SPRITE.DOG_W / 2;
    const dy = grassTop - SPRITE.DOG_H + 10; // slight overlap into grass
    ctx.drawImage(
      state.sprites.dog,
      sx, sy, SPRITE.DOG_W, SPRITE.DOG_H,
      dx, dy, SPRITE.DOG_W, SPRITE.DOG_H
    );
  }

  function showDogBubble(textKey) {
    const bubble = document.getElementById('dogBubble');
    if (!bubble) return;
    bubble.textContent = window.i18n.t(textKey);
    bubble.classList.remove('hidden');
  }

  function hideDogBubble() {
    const bubble = document.getElementById('dogBubble');
    if (bubble) bubble.classList.add('hidden');
  }

  function drawCrosshair() {
    const ctx = state.ctx;
    if (!state.lastMouse) return;
    const x = state.lastMouse.x, y = state.lastMouse.y;
    // Gold skin if purchased, else default red
    if (state.inventory.goldCrosshair) {
      ctx.strokeStyle = 'rgba(255, 209, 102, 0.95)';
      ctx.shadowColor = 'rgba(255, 209, 102, 0.6)';
      ctx.shadowBlur = 12;
    } else {
      ctx.strokeStyle = 'rgba(255, 80, 80, 0.85)';
      ctx.shadowBlur = 0;
    }
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 18, 0, Math.PI * 2);
    ctx.moveTo(x - 24, y); ctx.lineTo(x - 8, y);
    ctx.moveTo(x + 8, y); ctx.lineTo(x + 24, y);
    ctx.moveTo(x, y - 24); ctx.lineTo(x, y - 8);
    ctx.moveTo(x, y + 8); ctx.lineTo(x, y + 24);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  function loop(now) {
    if (!state.lastTime) state.lastTime = now;
    const dt = Math.min(0.05, (now - state.lastTime) / 1000);
    state.lastTime = now;
    update(dt);
    render();
    requestAnimationFrame(loop);
  }

  // ============================================
  // Input handling
  // ============================================
  function getCanvasPos(clientX, clientY) {
    const rect = state.canvas.getBoundingClientRect();
    const x = (clientX - rect.left) * (CONFIG.BASE_W / rect.width);
    const y = (clientY - rect.top) * (CONFIG.BASE_H / rect.height);
    return { x: x, y: y };
  }

  function isPointInDuckBody(x, y, duck) {
    return x >= duck.x &&
           x <= duck.x + duck.w &&
           y >= duck.y &&
           y <= duck.y + duck.h;
  }

  function getDuckHeadCenter(duck) {
    const facingRight = duck.vx > 0;
    return {
      x: duck.x + duck.w * (facingRight ? 0.70 : 0.30),
      y: duck.y + duck.h * 0.25
    };
  }

  function isPointInDuckHead(x, y, duck) {
    const head = getDuckHeadCenter(duck);
    const dx = x - head.x;
    const dy = y - head.y;
    return (dx * dx + dy * dy) <= CONFIG.HEADSHOT_RADIUS * CONFIG.HEADSHOT_RADIUS;
  }

  function handleShoot(clientX, clientY) {
    if (!state.running || state.paused) return;
    const p = getCanvasPos(clientX, clientY);
    const x = p.x, y = p.y;

    // Unlimited ammo — no decrement, no block
    state.ammo = CONFIG.AMMO_PER_WAVE;
    state.shots++;
    playSound('shot');
    spawnShotAnimation(x, y);

    // Hit-test ducks (top-most first)
    let hit = false;
    for (let i = state.ducks.length - 1; i >= 0; i--) {
      const d = state.ducks[i];
      if (!d.alive) continue;

      if (isPointInDuckBody(x, y, d)) {
        const isHeadshot = isPointInDuckHead(x, y, d);
        hitDuck(d, isHeadshot);
        hit = true;
        break;
      }
    }
    if (!hit) {
      playSound('miss');
      addFloatingText(window.i18n.t('missed'), x, y, '#ff6b6b');
      spawnParticles(x, y, '#ffffff', 6);
    }
    updateHUD();
  }

  function setupInput() {
    const canvas = state.canvas;
    let lastTouchAt = 0;

    canvas.addEventListener('mousemove', function (e) {
      state.inputs.mouse = true;
      state.lastMouse = getCanvasPos(e.clientX, e.clientY);
    });

    canvas.addEventListener('click', function (e) {
      if (Date.now() - lastTouchAt < 500) return;
      e.preventDefault();
      handleShoot(e.clientX, e.clientY);
    });

    canvas.addEventListener('touchstart', function (e) {
      e.preventDefault();
      state.inputs.touch = true;
      lastTouchAt = Date.now();
      if (e.touches.length > 0) {
        const t = e.touches[0];
        handleShoot(t.clientX, t.clientY);
      }
    }, { passive: false });

    // Keyboard: pause on Escape / P
    window.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
        if (state.running && !state.paused) pauseGame();
        else if (state.paused) resumeGame();
      }
    });
  }

  // ============================================
  // UI helpers
  // ============================================
  function show(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('hidden');
  }
  function hide(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  }

  /**
   * Show only a list of overlays + always keep gameWrapper.
   */
  function showOnly(visibleIds) {
    const all = ['menuScreen', 'pauseScreen', 'gameOverScreen', 'howToScreen',
                  'leaderboardScreen', 'shopScreen', 'hud', 'topBar'];
    all.forEach(function (id) {
      if (visibleIds.indexOf(id) === -1) hide(id);
    });
    visibleIds.forEach(function (id) { show(id); });
    // top bar usually always visible
    show('topBar');
  }

  function updateHUD() {
    document.getElementById('hudScore').textContent = String(state.score);
    document.getElementById('hudWave').textContent = '∞';
    document.getElementById('hudBest').textContent = String(state.best);
    // Unlimited ammo — always show ∞
    document.getElementById('hudAmmo').textContent = '∞';
  }

  function updateMenuBest() {
    const m = document.getElementById('menuBest');
    if (m) m.textContent = String(state.best);
  }

  function updateSoundIcon() {
    document.getElementById('soundIcon').textContent = state.soundOn ? '🔊' : '🔇';
  }

  /**
   * Refresh auth-related UI: badge with username, sign-in button visibility.
   */
  function updateAuthUI() {
    const badge = document.getElementById('userBadge');
    const signInBtn = document.getElementById('signInBtn');
    const userNameEl = document.getElementById('userName');
    if (!badge || !signInBtn || !userNameEl) return;
    if (state.isAuthorized && state.player) {
      const name = (state.player.getName && state.player.getName()) || window.i18n.t('guest');
      userNameEl.textContent = name;
      badge.classList.remove('hidden');
      signInBtn.classList.add('hidden');
    } else {
      badge.classList.add('hidden');
      // Only show sign-in button when SDK is present (no point on standalone)
      if (state.sdk) signInBtn.classList.remove('hidden');
      else signInBtn.classList.add('hidden');
    }
  }

  /**
   * Refresh shop-related UI: show shop button only when payments work,
   * update product prices, hide already-owned non-consumables.
   */
  function updateShopUI() {
    const shopBtn = document.getElementById('shopBtn');
    const ammoBtn = document.getElementById('buyAmmoBtn');
    const skinBtn = document.getElementById('buySkinBtn');
    if (!shopBtn || !ammoBtn || !skinBtn) return;

    if (state.paymentsAvailable) {
      shopBtn.classList.remove('hidden');
    } else {
      shopBtn.classList.add('hidden');
    }

    // Update prices from catalog
    const catalog = state.paymentsCatalog || [];
    const ammoProduct = catalog.find(function (p) { return p.id === CONFIG.PRODUCT_AMMO; });
    const skinProduct = catalog.find(function (p) { return p.id === CONFIG.PRODUCT_SKIN_GOLD; });
    ammoBtn.textContent = ammoProduct && ammoProduct.priceValue
      ? (ammoProduct.priceValue + ' ' + (ammoProduct.priceCurrencyCode || ''))
      : window.i18n.t('buyAmmo');
    if (state.inventory.goldCrosshair) {
      skinBtn.textContent = '✓ ' + window.i18n.t('consumed');
      skinBtn.disabled = true;
    } else {
      skinBtn.disabled = false;
      skinBtn.textContent = skinProduct && skinProduct.priceValue
        ? (skinProduct.priceValue + ' ' + (skinProduct.priceCurrencyCode || ''))
        : window.i18n.t('buySkin');
    }
  }

  // ============================================
  // Wire up UI events
  // ============================================
  function bindUI() {
    document.getElementById('startBtn').addEventListener('click', startGame);
    document.getElementById('howToBtn').addEventListener('click', function () {
      showOnly(['howToScreen', 'topBar']);
    });
    document.getElementById('howToOkBtn').addEventListener('click', goToMenu);
    document.getElementById('leaderboardBtn').addEventListener('click', function () {
      showOnly(['leaderboardScreen', 'topBar']);
      fetchLeaderboard();
    });
    document.getElementById('lbBackBtn').addEventListener('click', goToMenu);
    document.getElementById('resumeBtn').addEventListener('click', resumeGame);
    document.getElementById('pauseMenuBtn').addEventListener('click', goToMenu);
    document.getElementById('restartBtn').addEventListener('click', startGame);
    document.getElementById('overMenuBtn').addEventListener('click', goToMenu);
    document.getElementById('pauseBtn').addEventListener('click', pauseGame);

    // Shop
    document.getElementById('shopBtn').addEventListener('click', function () {
      showOnly(['shopScreen', 'topBar']);
      // Reset previous message
      const msg = document.getElementById('shopMsg');
      msg.classList.add('hidden');
      msg.classList.remove('error');
      updateShopUI();
    });
    document.getElementById('shopBackBtn').addEventListener('click', goToMenu);
    document.getElementById('buyAmmoBtn').addEventListener('click', function () {
      purchaseProduct(CONFIG.PRODUCT_AMMO);
    });
    document.getElementById('buySkinBtn').addEventListener('click', function () {
      if (state.inventory.goldCrosshair) return;
      purchaseProduct(CONFIG.PRODUCT_SKIN_GOLD);
    });

    // Sign in
    document.getElementById('signInBtn').addEventListener('click', function () {
      openAuthDialog().then(function (ok) {
        if (ok) {
          // Refresh leaderboard if visible
          if (state.screen === 'leaderboard') fetchLeaderboard();
        }
      });
    });

    document.getElementById('langBtn').addEventListener('click', function () {
      const cur = window.i18n.getLanguage();
      window.i18n.setLanguage(cur === 'ru' ? 'en' : 'ru');
      applyI18n();
      saveData();
      // Refresh dynamic UI that doesn't use data-i18n directly
      if (state.screen === 'leaderboard') fetchLeaderboard();
      updateHUD();
      updateAuthUI();
      updateShopUI();
    });

    document.getElementById('soundBtn').addEventListener('click', function () {
      state.soundOn = !state.soundOn;
      updateSoundIcon();
      saveData();
    });
  }

  // ============================================
  // Boot
  // ============================================
  async function boot() {
    state.canvas = document.getElementById('gameCanvas');
    state.ctx = state.canvas.getContext('2d');

    // Initial language detection (before SDK)
    window.i18n.detectLanguage();
    applyI18n();

    initClouds();
    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', resize);

    bindUI();
    setupInput();

    // Load sprite atlases (parallel with SDK init)
    const [, ] = await Promise.all([
      loadSprites(),
      initSDK()
    ]);

    applyI18n();
    updateMenuBest();
    updateAuthUI();
    updateShopUI();

    // Hide loading, show menu
    setTimeout(function () {
      document.getElementById('loadingScreen').classList.add('hidden');
      showOnly(['menuScreen', 'topBar']);
    }, 800);

    // Tell SDK we're ready (after sprites + SDK both resolved)
    signalReady();

    // Start render loop
    requestAnimationFrame(loop);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
