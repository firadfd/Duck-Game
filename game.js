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
    ARCADE_AMMO: 9999,       // unlimited ammo display
    CLASSIC_AMMO_PER_WAVE: 3,
    DUCK_LIFETIME_MS: 6000,  // time before duck flies away
    HIT_SCORE: 100,
    HEADSHOT_SCORE: 250,     // bonus points for headshot
    HEADSHOT_RADIUS: 14,     // tight radius around duck head centre
    WAVE_BONUS: 150,
    PERFECT_BONUS: 300,
    POWERUP_LIFETIME_MS: 6500,
    POWERUP_CHANCE_ARCADE: 0.12,
    POWERUP_CHANCE_CLASSIC: 0.22,
    SLOW_MO_MS: 5500,
    SCORE_BOOST_MS: 8000,
    FOCUS_MS: 8000,
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
    endScheduled: false,
    endTimer: null,
    endReason: '',
    screen: 'menu', // menu | playing | paused | gameOver | howTo | leaderboard | shop
    mode: 'arcade', // arcade | classic
    score: 0,
    best: 0,
    wave: 1,
    ammo: CONFIG.ARCADE_AMMO,
    hits: 0,
    waveHits: 0,
    shots: 0,
    combo: 0,
    maxCombo: 0,
    ducks: [],
    powerUps: [],
    particles: [],
    shotEffects: [],
    floatingTexts: [],
    clouds: [],
    ducksSpawnedThisWave: 0,
    duckTargetThisWave: CONFIG.DUCKS_PER_WAVE_BASE,
    spawnTimer: 0,
    powerUpTimer: 0,
    effects: {
      slowMo: 0,
      scoreBoost: 0,
      focus: 0
    },
    soundOn: true,
    audioCtx: null,
    lastTime: 0,
    inputs: { mouse: false, touch: false },
    // Sounds
    sounds: {
      miss: [],
      headshot: [],
      shot: [],
      hit: [],
      wave: null,
      gameOver: null,
      ready: false
    },
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
    },
    // Track last played indices for randomization
    lastPlayed: {}
  };

  // ============================================
  // Audio (procedural — no external files)
  // ============================================
  function getAudio() {
    if (!state.audioCtx) {
      try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (Ctx) {
          state.audioCtx = new Ctx();
          console.log('[audio] Context created, state:', state.audioCtx.state);
        }
      } catch (e) { console.error('[audio] Failed to create context', e); }
    }
    // Attempt to resume if suspended (common browser policy)
    if (state.audioCtx && state.audioCtx.state === 'suspended') {
      state.audioCtx.resume().catch(function () { /* ignore */ });
    }
    return state.audioCtx;
  }

  function playSound(type) {
    if (!state.soundOn) return;
    const ctx = getAudio();

    // 1. Try to find a loaded asset (Buffer or HTML5 Audio)
    let asset = null;
    const pickRandom = function (list, key) {
      if (!list || list.length === 0) return null;
      if (list.length === 1) return list[0];
      let idx;
      do {
        idx = Math.floor(Math.random() * list.length);
      } while (idx === state.lastPlayed[key]);
      state.lastPlayed[key] = idx;
      return list[idx];
    };

    if (type === 'miss' && state.sounds.miss.length > 0) {
      asset = pickRandom(state.sounds.miss, 'miss');
    } else if (type === 'headshot' && state.sounds.headshot.length > 0) {
      asset = pickRandom(state.sounds.headshot, 'headshot');
    } else if (type === 'shot' && state.sounds.shot.length > 0) {
      asset = pickRandom(state.sounds.shot, 'shot');
    } else if (type === 'hit' && state.sounds.hit.length > 0) {
      asset = pickRandom(state.sounds.hit, 'hit');
    } else if (type === 'wave' && state.sounds.wave) {
      asset = state.sounds.wave;
    } else if (type === 'gameOver' && state.sounds.gameOver) {
      asset = state.sounds.gameOver;
    }

    // 2. If asset found, play it
    if (asset) {
      if (asset instanceof AudioBuffer) {
        playBuffer(asset);
        return;
      } else if (asset instanceof Audio) {
        // HTML5 Audio fallback (good for file://)
        asset.currentTime = 0;
        asset.play().catch(() => { });
        return;
      }
    }

    // 3. Fallback to procedural synthesis if no asset worked
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const gain = ctx.createGain();
      gain.connect(ctx.destination);
      // ... existing procedural logic ...
      if (type === 'shot') {
        const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 0.1, ctx.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        for (let i = 0; i < noiseBuffer.length; i++) output[i] = Math.random() * 2 - 1;
        const noise = ctx.createBufferSource();
        noise.buffer = noiseBuffer;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1000, now);
        filter.frequency.exponentialRampToValueAtTime(100, now + 0.1);
        noise.connect(filter); filter.connect(gain);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
        noise.start(now); noise.stop(now + 0.1);
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.exponentialRampToValueAtTime(40, now + 0.1);
        osc.connect(gain); osc.start(now); osc.stop(now + 0.1);
      } else if (type === 'hit') {
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.exponentialRampToValueAtTime(440, now + 0.15);
        osc.connect(gain);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
        osc.start(now); osc.stop(now + 0.15);
      } else if (type === 'headshot') {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1200, now);
        osc.frequency.exponentialRampToValueAtTime(800, now + 0.2);
        osc.connect(gain);
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
        osc.start(now); osc.stop(now + 0.2);
      } else if (type === 'miss') {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(110, now);
        osc.frequency.exponentialRampToValueAtTime(55, now + 0.2);
        osc.connect(gain);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
        osc.start(now); osc.stop(now + 0.2);
      } else if (type === 'ui' || type === 'click') {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(660, now);
        osc.connect(gain);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
        osc.start(now); osc.stop(now + 0.05);
      } else if (type === 'start') {
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.3);
        osc.connect(gain);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
        osc.start(now); osc.stop(now + 0.3);
      } else if (type === 'quack') {
        const osc = ctx.createOscillator();
        osc.type = 'square';
        osc.frequency.setValueAtTime(400, now);
        osc.frequency.exponentialRampToValueAtTime(450, now + 0.05);
        osc.connect(gain);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
        osc.start(now); osc.stop(now + 0.1);
        setTimeout(function () {
          const ctx2 = getAudio(); if (!ctx2) return;
          const now2 = ctx2.currentTime;
          const osc2 = ctx2.createOscillator();
          const g2 = ctx2.createGain();
          osc2.type = 'square';
          osc2.frequency.setValueAtTime(400, now2);
          osc2.frequency.exponentialRampToValueAtTime(450, now2 + 0.05);
          osc2.connect(g2); g2.connect(ctx2.destination);
          g2.gain.setValueAtTime(0.08, now2);
          g2.gain.exponentialRampToValueAtTime(0.01, now2 + 0.1);
          osc2.start(now2); osc2.stop(now2 + 0.1);
        }, 120);
      } else if (type === 'wave') {
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(523.25, now);
        osc.connect(gain);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
        osc.start(now); osc.stop(now + 0.4);
      } else if (type === 'gameOver') {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.exponentialRampToValueAtTime(80, now + 0.5);
        osc.connect(gain);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
        osc.start(now); osc.stop(now + 0.5);
      }
    } catch (e) { /* ignore */ }
  }

  function playBuffer(buffer) {
    const ctx = getAudio();
    if (!ctx || !buffer) return;
    try {
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const gain = ctx.createGain();
      gain.gain.value = 0.4;
      source.connect(gain);
      gain.connect(ctx.destination);
      source.start(0);
    } catch (e) { /* ignore */ }
  }

  /**
   * Loads a sound from URL. Tries AudioContext first, fallbacks to HTML5 Audio.
   * This is crucial for local file:/// development where fetch() is blocked.
   */
  async function loadSoundAsset(url) {
    const ctx = getAudio();
    if (ctx) {
      try {
        const response = await fetch(url);
        if (response.ok) {
          const arrayBuffer = await response.arrayBuffer();
          const buffer = await ctx.decodeAudioData(arrayBuffer);
          return buffer; // Success: High-performance AudioBuffer
        }
      } catch (e) { /* fallback to HTML5 Audio */ }
    }

    // Fallback: HTML5 Audio (usually works on file://)
    return new Promise((resolve) => {
      const audio = new Audio();
      audio.oncanplaythrough = () => resolve(audio);
      audio.onerror = () => resolve(null);
      audio.src = url;
    });
  }

  async function loadGameSounds() {
    const missUrls = ['assets/sound/miss_sound.mp3', 'assets/sound/miss_sound2.mp3', 'assets/sound/miss_sound_3.mp3'];
    const headshotUrls = ['assets/sound/headshot_sound.mp3', 'assets/sound/headshot_sound2.mp3'];
    const shotUrls = ['assets/sound/shot.mp3', 'assets/sound/shot_sound.mp3'];
    const hitUrls = ['assets/sound/hit.mp3', 'assets/sound/hit_sound.mp3'];
    const waveUrl = 'assets/sound/wave_complete.mp3';
    const gameOverUrl = 'assets/sound/meme-end.mp3';

    try {
      const [miss, head, shot, hit, wave, over] = await Promise.all([
        Promise.all(missUrls.map(loadSoundAsset)),
        Promise.all(headshotUrls.map(loadSoundAsset)),
        Promise.all(shotUrls.map(loadSoundAsset)),
        Promise.all(hitUrls.map(loadSoundAsset)),
        loadSoundAsset(waveUrl),
        loadSoundAsset(gameOverUrl)
      ]);

      state.sounds.miss = miss.filter(Boolean);
      state.sounds.headshot = head.filter(Boolean);
      state.sounds.shot = shot.filter(Boolean);
      state.sounds.hit = hit.filter(Boolean);
      state.sounds.wave = wave;
      state.sounds.gameOver = over;
      state.sounds.ready = true;

      console.log('[audio] Assets loaded:', {
        miss: state.sounds.miss.length,
        headshot: state.sounds.headshot.length,
        shot: state.sounds.shot.length,
        hit: state.sounds.hit.length,
        wave: !!state.sounds.wave,
        gameOver: !!state.sounds.gameOver
      });
    } catch (e) { console.warn('[audio] load error', e); }
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
        if (data && window.i18n.getAvailableLanguages().indexOf(data.lang) !== -1) {
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
      if (window.i18n.getAvailableLanguages().indexOf(l) !== -1) window.i18n.setLanguage(l);
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

  function isPhoneLikeDevice() {
    const ua = navigator.userAgent || '';
    const mobileUA = /Android|iPhone|iPod|Windows Phone|Mobile/i.test(ua);
    const smallViewport = Math.min(window.innerWidth, window.innerHeight) <= 900;
    return mobileUA || smallViewport;
  }

  function getFullscreenElement() {
    return document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.mozFullScreenElement ||
      document.msFullscreenElement ||
      null;
  }

  function requestFullscreen(el) {
    if (el.requestFullscreen) return el.requestFullscreen();
    if (el.webkitRequestFullscreen) return el.webkitRequestFullscreen();
    if (el.mozRequestFullScreen) return el.mozRequestFullScreen();
    if (el.msRequestFullscreen) return el.msRequestFullscreen();
    return Promise.reject(new Error('fullscreen not supported'));
  }

  function tryLockLandscapeForMobile() {
    if (!isPhoneLikeDevice()) return;
    const orientation = screen && screen.orientation;
    if (!orientation || !orientation.lock) return;

    const lockLandscape = function () {
      orientation.lock('landscape').catch(function () { /* ignore */ });
    };

    if (getFullscreenElement()) {
      lockLandscape();
      return;
    }

    requestFullscreen(document.documentElement)
      .then(lockLandscape)
      .catch(function () { /* ignore */ });
  }

  // ============================================
  // Duck entity
  // ============================================
  function spawnDuck() {
    const fromLeft = Math.random() < 0.5;
    const difficulty = getDifficulty();
    const speed = 110 + difficulty.speedBonus + Math.random() * 70;
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
      w: 96 * difficulty.sizeScale,
      h: 72 * difficulty.sizeScale,
      flap: 0,                          // animation accumulator
      alive: true,
      flying: true,
      falling: false,
      lifetime: difficulty.lifetime,
      type: type
    };
    state.ducks.push(duck);
    state.ducksSpawnedThisWave++;
  }

  function getDifficulty() {
    if (state.mode === 'classic') {
      const waveStep = Math.max(0, state.wave - 1);
      return {
        speedBonus: Math.min(115, waveStep * 13),
        sizeScale: Math.max(0.76, 1 - waveStep * 0.025),
        lifetime: Math.max(3300, CONFIG.DUCK_LIFETIME_MS - waveStep * 280)
      };
    }
    const hitStep = Math.floor(state.hits / 5);
    return {
      speedBonus: hitStep * 8,
      sizeScale: 1,
      lifetime: CONFIG.DUCK_LIFETIME_MS
    };
  }

  function hitDuck(duck, isHeadshot) {
    duck.alive = false;
    duck.falling = true;
    duck.flying = false;
    duck.vx *= 0.2;
    duck.vy = 80;
    state.hits++;
    state.waveHits++;
    state.combo++;
    state.maxCombo = Math.max(state.maxCombo, state.combo);
    const comboMultiplier = Math.min(5, 1 + Math.floor((state.combo - 1) / 3));
    let points = duck.type === 'gold' ? CONFIG.HIT_SCORE * 3 : CONFIG.HIT_SCORE;
    if (isHeadshot) points += CONFIG.HEADSHOT_SCORE;
    if (state.effects.scoreBoost > 0) points *= 2;
    points *= comboMultiplier;
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
    if (comboMultiplier > 1) {
      addFloatingText('x' + comboMultiplier + ' ' + window.i18n.t('combo'), duck.x + duck.w / 2, duck.y - 84, '#2fd6c5');
    }
    maybeSpawnPowerUp();
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

  // ============================================
  // Power-ups
  // ============================================
  function maybeSpawnPowerUp() {
    const chance = state.mode === 'classic' ? CONFIG.POWERUP_CHANCE_CLASSIC : CONFIG.POWERUP_CHANCE_ARCADE;
    if (Math.random() > chance || state.powerUps.length >= 2) return;
    const types = state.mode === 'classic'
      ? ['slow', 'boost', 'focus', 'ammo']
      : ['slow', 'boost', 'focus'];
    spawnPowerUp(types[Math.floor(Math.random() * types.length)]);
  }

  function spawnPowerUp(type) {
    state.powerUps.push({
      type: type,
      x: 110 + Math.random() * (state.width - 220),
      y: 95 + Math.random() * (state.height - 285),
      r: 23,
      pulse: Math.random() * Math.PI * 2,
      life: CONFIG.POWERUP_LIFETIME_MS
    });
  }

  function collectPowerUp(powerUp) {
    if (powerUp.type === 'slow') {
      state.effects.slowMo = CONFIG.SLOW_MO_MS;
      addFloatingText(window.i18n.t('powerSlow'), powerUp.x, powerUp.y - 28, '#2fd6c5');
    } else if (powerUp.type === 'boost') {
      state.effects.scoreBoost = CONFIG.SCORE_BOOST_MS;
      addFloatingText(window.i18n.t('powerBoost'), powerUp.x, powerUp.y - 28, '#ffc857');
    } else if (powerUp.type === 'focus') {
      state.effects.focus = CONFIG.FOCUS_MS;
      addFloatingText(window.i18n.t('powerFocus'), powerUp.x, powerUp.y - 28, '#ffffff');
    } else if (powerUp.type === 'ammo') {
      state.ammo += 1;
      cancelScheduledEnd('noAmmo');
      addFloatingText(window.i18n.t('powerAmmo'), powerUp.x, powerUp.y - 28, '#7cff6b');
    }
    spawnParticles(powerUp.x, powerUp.y, getPowerUpColor(powerUp.type), 18);
    playSound('wave');
    updateHUD();
  }

  function getPowerUpColor(type) {
    if (type === 'slow') return '#2fd6c5';
    if (type === 'boost') return '#ffc857';
    if (type === 'focus') return '#ffffff';
    if (type === 'ammo') return '#7cff6b';
    return '#ffffff';
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
    for (let i = 0; i < 8; i++) {
      state.clouds.push({
        x: Math.random() * CONFIG.BASE_W,
        y: 34 + Math.random() * 190,
        vx: 6 + Math.random() * 16,
        scale: 0.5 + Math.random() * 0.9,
        alpha: 0.22 + Math.random() * 0.28
      });
    }
  }

  // ============================================
  // Game flow
  // ============================================
  function startGame() {
    tryLockLandscapeForMobile();

    state.score = 0;
    state.wave = 1;
    state.ammo = state.mode === 'classic' ? CONFIG.CLASSIC_AMMO_PER_WAVE : CONFIG.ARCADE_AMMO;
    state.hits = 0;
    state.waveHits = 0;
    state.shots = 0;
    state.combo = 0;
    state.maxCombo = 0;
    state.ducks = [];
    state.powerUps = [];
    state.particles = [];
    state.shotEffects = [];
    state.floatingTexts = [];
    state.ducksSpawnedThisWave = 0;
    state.duckTargetThisWave = CONFIG.DUCKS_PER_WAVE_BASE;
    state.spawnTimer = 1500; // delay first duck so dog intro plays first
    state.powerUpTimer = 2400;
    state.effects.slowMo = 0;
    state.effects.scoreBoost = 0;
    state.effects.focus = 0;
    state.running = true;
    state.paused = false;
    state.endScheduled = false;
    if (state.endTimer) clearTimeout(state.endTimer);
    state.endTimer = null;
    state.endReason = '';
    state.screen = 'playing';
    showOnly([]);
    show('hud'); show('topBar');
    document.getElementById('pauseBtn').classList.remove('hidden');
    updateHUD();
    gameplayStart();
    playSound('start');
    // Apply any consumable ammo purchased outside gameplay
    while (state.inventory.ammoConsumables > 0) applyAmmoConsumable();
    // Dog intro: peek out and say "Ready?"
    triggerDog([
      { frame: SPRITE.DOG_FRAME.hidden, ms: 200 },
      { frame: SPRITE.DOG_FRAME.peek, ms: 1000 },
      { frame: SPRITE.DOG_FRAME.hidden, ms: 200 }
    ], 'dogReady');
  }

  function nextWave() {
    // Sticky-analytics: fire after first wave is fully completed
    if (state.wave === CONFIG.QUALITY_READY_WAVE) {
      fireQualityReady();
    }

    const perfect = state.waveHits >= state.duckTargetThisWave;
    state.wave++;
    state.ammo = state.mode === 'classic' ? CONFIG.CLASSIC_AMMO_PER_WAVE : CONFIG.ARCADE_AMMO;
    state.duckTargetThisWave = state.mode === 'classic'
      ? CONFIG.DUCKS_PER_WAVE_BASE
      : CONFIG.DUCKS_PER_WAVE_BASE + Math.floor(state.wave / 2);
    state.ducksSpawnedThisWave = 0;
    state.waveHits = 0;
    state.ducks = [];
    state.powerUps = [];
    state.spawnTimer = 1500; // longer delay to show dog reaction
    state.powerUpTimer = 1800;
    updateHUD();
    playSound('wave');

    // Show wave complete toast
    const toast = document.getElementById('waveToast');
    document.getElementById('waveBonus').textContent = String(CONFIG.WAVE_BONUS);
    toast.classList.remove('hidden');
    setTimeout(function () { toast.classList.add('hidden'); }, 1400);

    // Dog reaction: laughing if perfect, peek otherwise
    if (perfect) {
      triggerDog([
        { frame: SPRITE.DOG_FRAME.hidden, ms: 200 },
        { frame: SPRITE.DOG_FRAME.laugh, ms: 1500 },
        { frame: SPRITE.DOG_FRAME.hidden, ms: 200 }
      ], 'dogHaha');
    } else {
      triggerDog([
        { frame: SPRITE.DOG_FRAME.hidden, ms: 200 },
        { frame: SPRITE.DOG_FRAME.peek, ms: 1000 },
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
    if (!state.running) return;
    state.endScheduled = false;
    if (state.endTimer) clearTimeout(state.endTimer);
    state.endTimer = null;
    state.endReason = '';
    state.running = false;
    state.screen = 'gameOver';
    gameplayStop();
    playSound('gameOver');

    // Dog laughs at the player on game over (homage to the original NES title)
    triggerDog([
      { frame: SPRITE.DOG_FRAME.hidden, ms: 100 },
      { frame: SPRITE.DOG_FRAME.laugh, ms: 1800 },
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
    const maxCombo = document.getElementById('finalMaxCombo');
    if (maxCombo) maxCombo.textContent = String(state.maxCombo);
    document.getElementById('newRecordBadge').classList.toggle('hidden', !newRecord);

    // Delay overlay so player sees the dog briefly
    setTimeout(function () {
      showOnly(['gameOverScreen', 'topBar']);
      document.getElementById('pauseBtn').classList.add('hidden');
    }, 1500);

    // Fullscreen ad after game over flow
    setTimeout(function () { showFullscreenAd(function () { /* noop */ }); }, 2200);
  }

  function scheduleEndGame(delay, reason) {
    if (state.endScheduled || !state.running) return;
    state.endScheduled = true;
    state.endReason = reason || '';
    state.endTimer = setTimeout(endGame, delay);
  }

  function cancelScheduledEnd(reason) {
    if (!state.endScheduled || (reason && state.endReason !== reason)) return;
    if (state.endTimer) clearTimeout(state.endTimer);
    state.endTimer = null;
    state.endReason = '';
    state.endScheduled = false;
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
    state.endScheduled = false;
    if (state.endTimer) clearTimeout(state.endTimer);
    state.endTimer = null;
    state.endReason = '';
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

    updatePowerUps(dt);
    updateActiveEffects(dt);

    // Arcade spawns forever; Classic spawns a fixed wave target.
    state.spawnTimer -= dt * 1000;
    const canSpawn = state.mode === 'arcade' || state.ducksSpawnedThisWave < state.duckTargetThisWave;
    if (state.spawnTimer <= 0 && canSpawn) {
      spawnDuck();
      if (state.mode === 'classic') {
        state.spawnTimer = Math.max(520, 980 - Math.min(360, (state.wave - 1) * 55));
      } else {
        state.spawnTimer = Math.max(280, 760 - Math.min(420, Math.floor(state.hits / 5) * 30));
      }
    }

    state.powerUpTimer -= dt * 1000;
    if (state.powerUpTimer <= 0) {
      maybeSpawnPowerUp();
      state.powerUpTimer = state.mode === 'classic' ? 4200 : 5400;
    }

    // Update ducks
    for (let i = state.ducks.length - 1; i >= 0; i--) {
      const d = state.ducks[i];
      d.flap += dt * 6; // ~6 frame cycles per second for natural wing flap
      const duckDt = state.effects.slowMo > 0 && d.alive && !d.falling ? dt * 0.52 : dt;
      if (d.falling) {
        d.vy += 600 * dt;
        d.y += d.vy * dt;
        d.x += d.vx * dt;
        if (d.y > state.height + 80) state.ducks.splice(i, 1);
      } else if (d.alive) {
        d.x += d.vx * duckDt;
        d.y += d.vy * duckDt;
        // Bounce off vertical bounds
        if (d.y < 60 || d.y > state.height - 200) d.vy *= -1;
        // Slight zigzag
        d.vy += (Math.random() - 0.5) * 20 * duckDt / Math.max(dt, 0.001);
        d.vy = Math.max(-80, Math.min(80, d.vy));
        d.lifetime -= duckDt * 1000;
        if (d.lifetime <= 0) {
          // fly up & away
          d.flying = false;
          d.alive = false;
          d.vy = -200;
          d.vx *= 0.6;
          state.combo = 0;
          updateHUD();
          addFloatingText(window.i18n.t('flyAway'), d.x + d.w / 2, d.y, '#ff6b6b');
          if (state.mode === 'classic') {
            scheduleEndGame(450, 'flyAway');
          }
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

    if (state.mode === 'classic' && state.running) {
      const activeDucks = state.ducks.some(function (d) { return d.alive || d.falling; });
      if (state.ducksSpawnedThisWave >= state.duckTargetThisWave && !activeDucks) {
        if (state.waveHits >= state.duckTargetThisWave) nextWave();
        else endGame();
      } else if (state.ammo <= 0 && state.waveHits < state.duckTargetThisWave) {
        const hittableDucks = state.ducks.some(function (d) { return d.alive; });
        if (hittableDucks || state.ducksSpawnedThisWave < state.duckTargetThisWave) {
          if (!state.endScheduled) addFloatingText(window.i18n.t('noAmmo'), state.width / 2, 92, '#ff5d6c');
          scheduleEndGame(500, 'noAmmo');
        }
      }
    }
  }

  function updatePowerUps(dt) {
    for (let i = state.powerUps.length - 1; i >= 0; i--) {
      const p = state.powerUps[i];
      p.life -= dt * 1000;
      p.pulse += dt * 5;
      if (p.life <= 0) state.powerUps.splice(i, 1);
    }
  }

  function updateActiveEffects(dt) {
    const elapsed = dt * 1000;
    state.effects.slowMo = Math.max(0, state.effects.slowMo - elapsed);
    state.effects.scoreBoost = Math.max(0, state.effects.scoreBoost - elapsed);
    state.effects.focus = Math.max(0, state.effects.focus - elapsed);
  }

  function render() {
    const ctx = state.ctx;
    const w = state.width, h = state.height;

    // Sky gradient
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#173b67');
    sky.addColorStop(0.42, '#5a9bd1');
    sky.addColorStop(0.72, '#b7d7e4');
    sky.addColorStop(1, '#f6d88d');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    // Sun glow
    const sunX = w * 0.78;
    const sunY = h * 0.19;
    const sunGlow = ctx.createRadialGradient(sunX, sunY, 8, sunX, sunY, 140);
    sunGlow.addColorStop(0, 'rgba(255, 244, 199, 0.92)');
    sunGlow.addColorStop(0.36, 'rgba(255, 202, 104, 0.36)');
    sunGlow.addColorStop(1, 'rgba(255, 202, 104, 0)');
    ctx.fillStyle = sunGlow;
    ctx.beginPath();
    ctx.arc(sunX, sunY, 140, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 248, 214, 0.82)';
    ctx.beginPath();
    ctx.arc(sunX, sunY, 42, 0, Math.PI * 2);
    ctx.fill();

    // Clouds
    drawClouds();

    // Distant atmospheric ridge
    const ridge = ctx.createLinearGradient(0, h - 270, 0, h - 120);
    ridge.addColorStop(0, '#6aa0a8');
    ridge.addColorStop(1, '#3e6d6c');
    ctx.fillStyle = ridge;
    ctx.beginPath();
    ctx.moveTo(0, h - 194);
    for (let x = 0; x <= w; x += 40) {
      ctx.lineTo(x, h - 192 - Math.sin(x * 0.009) * 22 - Math.cos(x * 0.018) * 12);
    }
    ctx.lineTo(w, h - 92); ctx.lineTo(0, h - 92); ctx.closePath();
    ctx.fill();

    // Foreground marsh
    const grassTop = h - 150;
    const grass = ctx.createLinearGradient(0, grassTop, 0, h);
    grass.addColorStop(0, '#4f944f');
    grass.addColorStop(0.5, '#2f6d3b');
    grass.addColorStop(1, '#163f25');
    ctx.fillStyle = grass;
    ctx.fillRect(0, grassTop, w, 150);

    const water = ctx.createLinearGradient(0, h - 118, 0, h - 32);
    water.addColorStop(0, 'rgba(64, 177, 181, 0.34)');
    water.addColorStop(1, 'rgba(10, 59, 66, 0.28)');
    ctx.fillStyle = water;
    ctx.beginPath();
    ctx.moveTo(0, h - 118);
    for (let x = 0; x <= w; x += 32) {
      ctx.lineTo(x, h - 112 + Math.sin(x * 0.022) * 8);
    }
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = 'rgba(255, 248, 214, 0.18)';
    ctx.lineWidth = 2;
    for (let y = h - 104; y < h - 22; y += 20) {
      ctx.beginPath();
      for (let x = 0; x <= w; x += 46) {
        const yy = y + Math.sin((x + y) * 0.018) * 3;
        if (x === 0) ctx.moveTo(x, yy);
        else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }

    // Cattails / reeds silhouettes
    ctx.fillStyle = '#15351f';
    ctx.strokeStyle = 'rgba(15, 50, 28, 0.84)';
    ctx.lineWidth = 3;
    for (let x = 0; x < w; x += 58) {
      const rx = x + (x % 116 === 0 ? 10 : 30);
      const ry = grassTop + 8 + Math.sin(x * 0.04) * 10;
      ctx.beginPath();
      ctx.moveTo(rx, h);
      ctx.lineTo(rx + Math.sin(x) * 8, ry);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(rx + 2, ry + 4, 5, 16, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Subtle vignette gives the scene more depth without hiding targets.
    const vignette = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.25, w / 2, h / 2, Math.max(w, h) * 0.68);
    vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vignette.addColorStop(1, 'rgba(4, 10, 18, 0.22)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, w, h);

    // Ducks
    state.ducks.forEach(drawDuck);

    // Power-ups
    state.powerUps.forEach(drawPowerUp);

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
      const s = c.scale;
      const cloud = ctx.createLinearGradient(0, c.y - 34 * s, 0, c.y + 28 * s);
      cloud.addColorStop(0, '#ffffff');
      cloud.addColorStop(1, '#d8edf6');
      ctx.fillStyle = cloud;
      ctx.shadowColor = 'rgba(31, 74, 105, 0.18)';
      ctx.shadowBlur = 18 * s;
      ctx.beginPath();
      ctx.arc(c.x, c.y, 22 * s, 0, Math.PI * 2);
      ctx.arc(c.x + 24 * s, c.y - 6 * s, 26 * s, 0, Math.PI * 2);
      ctx.arc(c.x + 50 * s, c.y, 20 * s, 0, Math.PI * 2);
      ctx.arc(c.x + 28 * s, c.y + 8 * s, 22 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
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
      ctx.strokeStyle = '#ffc857';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.82)';
      ctx.lineWidth = 2;
      ctx.shadowColor = 'rgba(255, 200, 87, 0.6)';
      ctx.shadowBlur = 14;

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
      gold: { body: '#ffd166', belly: '#fff3c0', head: '#ffb700', wing: '#e8a800' },
      brown: { body: '#8b5e3c', belly: '#d4b894', head: '#583c26', wing: '#6c482c' },
      mallard: { body: '#8b5e3c', belly: '#e0c8a8', head: '#2d6e3c', wing: '#69462a' },
      wood: { body: '#5a4a8c', belly: '#dcc8e6', head: '#3c286e', wing: '#46386e' }
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

  function drawPowerUp(p) {
    const ctx = state.ctx;
    const color = getPowerUpColor(p.type);
    const alpha = Math.max(0.25, Math.min(1, p.life / 900));
    const pulse = Math.sin(p.pulse) * 3;
    const label = p.type === 'slow' ? 'S' : p.type === 'boost' ? '2x' : p.type === 'focus' ? '+' : 'A';

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(p.x, p.y);
    ctx.shadowColor = color;
    ctx.shadowBlur = 18;
    ctx.fillStyle = 'rgba(7, 18, 31, 0.82)';
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, p.r + pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.fillStyle = color;
    ctx.font = '800 17px Segoe UI, Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 0, 1);

    ctx.strokeStyle = 'rgba(255,255,255,0.62)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, p.r + 8 + pulse, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * p.life / CONFIG.POWERUP_LIFETIME_MS));
    ctx.stroke();
    ctx.restore();
    ctx.globalAlpha = 1;
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
      ctx.strokeStyle = 'rgba(255, 200, 87, 0.96)';
      ctx.shadowColor = 'rgba(255, 200, 87, 0.72)';
      ctx.shadowBlur = 16;
    } else {
      ctx.strokeStyle = 'rgba(255, 93, 108, 0.92)';
      ctx.shadowColor = 'rgba(255, 93, 108, 0.48)';
      ctx.shadowBlur = 10;
    }
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 17, 0, Math.PI * 2);
    ctx.moveTo(x - 28, y); ctx.lineTo(x - 9, y);
    ctx.moveTo(x + 9, y); ctx.lineTo(x + 28, y);
    ctx.moveTo(x, y - 28); ctx.lineTo(x, y - 9);
    ctx.moveTo(x, y + 9); ctx.lineTo(x, y + 28);
    ctx.stroke();
    ctx.fillStyle = state.inventory.goldCrosshair ? '#ffc857' : '#ff5d6c';
    ctx.beginPath();
    ctx.arc(x, y, 2.5, 0, Math.PI * 2);
    ctx.fill();
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
    const radius = CONFIG.HEADSHOT_RADIUS + (state.effects.focus > 0 ? 12 : 0);
    return (dx * dx + dy * dy) <= radius * radius;
  }

  function getPowerUpAt(x, y) {
    for (let i = state.powerUps.length - 1; i >= 0; i--) {
      const p = state.powerUps[i];
      const dx = x - p.x;
      const dy = y - p.y;
      const radius = p.r + 12;
      if ((dx * dx + dy * dy) <= radius * radius) {
        state.powerUps.splice(i, 1);
        return p;
      }
    }
    return null;
  }

  function handleShoot(clientX, clientY) {
    if (!state.running || state.paused) return;
    const p = getCanvasPos(clientX, clientY);
    const x = p.x, y = p.y;

    const powerUp = getPowerUpAt(x, y);
    if (powerUp) {
      collectPowerUp(powerUp);
      return;
    }

    if (state.mode === 'classic') {
      if (state.ammo <= 0) {
        playSound('miss');
        addFloatingText(window.i18n.t('noAmmo'), x, y, '#ff5d6c');
        return;
      }
      state.ammo--;
    } else {
      state.ammo = CONFIG.ARCADE_AMMO;
    }
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
      state.combo = 0;
      playSound('miss');
      addFloatingText(window.i18n.t('missed'), x, y, '#ff6b6b');
      spawnParticles(x, y, '#ffffff', 6);
    }
    updateHUD();
  }

  function setupInput() {
    const canvas = state.canvas;
    let lastTouchAt = 0;

    // Standard AudioContext "unlock" on first interaction
    const unlockAudio = function () {
      const ctx = getAudio();
      if (ctx && ctx.state === 'suspended') {
        ctx.resume().then(function () {
          console.log('[audio] Context unlocked');
          window.removeEventListener('click', unlockAudio);
          window.removeEventListener('touchstart', unlockAudio);
          window.removeEventListener('keydown', unlockAudio);
        });
      } else {
        window.removeEventListener('click', unlockAudio);
        window.removeEventListener('touchstart', unlockAudio);
        window.removeEventListener('keydown', unlockAudio);
      }
    };
    window.addEventListener('click', unlockAudio);
    window.addEventListener('touchstart', unlockAudio);
    window.addEventListener('keydown', unlockAudio);

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
    document.getElementById('hudWave').textContent = state.mode === 'classic' ? String(state.wave) : '∞';
    document.getElementById('hudBest').textContent = String(state.best);
    document.getElementById('hudAmmo').textContent = state.mode === 'classic' ? String(state.ammo) : '∞';
    const combo = document.getElementById('hudCombo');
    if (combo) combo.textContent = state.combo > 1 ? ('x' + state.combo) : '0';
  }

  function setMode(mode) {
    state.mode = mode === 'classic' ? 'classic' : 'arcade';
    const arcadeBtn = document.getElementById('arcadeModeBtn');
    const classicBtn = document.getElementById('classicModeBtn');
    if (arcadeBtn) arcadeBtn.classList.toggle('active', state.mode === 'arcade');
    if (classicBtn) classicBtn.classList.toggle('active', state.mode === 'classic');
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
    const withSfx = function (fn) {
      return function () {
        playSound('ui');
        fn.apply(this, arguments);
      };
    };

    document.getElementById('arcadeModeBtn').addEventListener('click', function () { setMode('arcade'); playSound('ui'); });
    document.getElementById('classicModeBtn').addEventListener('click', function () { setMode('classic'); playSound('ui'); });
    document.getElementById('startBtn').addEventListener('click', startGame);
    document.getElementById('howToBtn').addEventListener('click', function () {
      playSound('ui');
      showOnly(['howToScreen', 'topBar']);
    });
    document.getElementById('howToOkBtn').addEventListener('click', withSfx(goToMenu));
    document.getElementById('leaderboardBtn').addEventListener('click', function () {
      playSound('ui');
      showOnly(['leaderboardScreen', 'topBar']);
      fetchLeaderboard();
    });
    document.getElementById('lbBackBtn').addEventListener('click', withSfx(goToMenu));
    document.getElementById('resumeBtn').addEventListener('click', function () { resumeGame(); playSound('ui'); });
    document.getElementById('pauseMenuBtn').addEventListener('click', withSfx(goToMenu));
    document.getElementById('restartBtn').addEventListener('click', startGame);
    document.getElementById('overMenuBtn').addEventListener('click', withSfx(goToMenu));
    document.getElementById('pauseBtn').addEventListener('click', function () { pauseGame(); playSound('ui'); });

    // Shop
    document.getElementById('shopBtn').addEventListener('click', function () {
      playSound('ui');
      showOnly(['shopScreen', 'topBar']);
      // Reset previous message
      const msg = document.getElementById('shopMsg');
      msg.classList.add('hidden');
      msg.classList.remove('error');
      updateShopUI();
    });
    document.getElementById('shopBackBtn').addEventListener('click', withSfx(goToMenu));
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
      playSound('ui');
      const cur = window.i18n.getLanguage();
      const langs = window.i18n.getAvailableLanguages();
      const next = langs[(langs.indexOf(cur) + 1) % langs.length] || 'en';
      window.i18n.setLanguage(next);
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
      if (state.soundOn) playSound('ui');
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

    // Load sprite atlases and sounds (parallel with SDK init)
    const [, ,] = await Promise.all([
      loadSprites(),
      loadGameSounds(),
      initSDK()
    ]);

    applyI18n();
    updateMenuBest();
    updateAuthUI();
    updateShopUI();
    setMode(state.mode);

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
