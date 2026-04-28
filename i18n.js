/**
 * Localization module (RU + EN)
 * Auto-detects language from Yandex SDK or browser
 */
(function (global) {
  'use strict';

  const dictionary = {
    ru: {
      title: 'Охота на уток',
      subtitle: 'Аркадный тир',
      start: 'Начать игру',
      resume: 'Продолжить',
      restart: 'Заново',
      menu: 'В меню',
      pause: 'Пауза',
      paused: 'Пауза',
      score: 'Счёт',
      best: 'Рекорд',
      wave: 'Волна',
      ammo: 'Патроны',
      ducksLeft: 'Уток осталось',
      gameOver: 'Игра окончена!',
      waveComplete: 'Волна пройдена!',
      newRecord: 'Новый рекорд!',
      loading: 'Загрузка...',
      tapToStart: 'Нажмите, чтобы начать',
      howToPlay: 'Как играть',
      howToPlayText: 'Стреляйте по уткам кликом или касанием. У вас 3 патрона на волну. Подбейте всех уток до того, как они улетят!',
      leaderboard: 'Лидерборд',
      leaderboardName: 'Лучшие охотники',
      noLeaderboard: 'Лидерборд недоступен',
      submitScore: 'Отправить счёт',
      ok: 'OK',
      back: 'Назад',
      sound: 'Звук',
      soundOn: 'Вкл',
      soundOff: 'Выкл',
      language: 'Язык',
      hits: 'Попадания',
      accuracy: 'Точность',
      total: 'Итого',
      bonus: 'Бонус',
      perfect: 'Идеально!',
      missed: 'Промах',
      reload: 'Перезарядка',
      flyAway: 'Улетела!',
      gameplayStart: 'Геймплей начат',
      gameplayStop: 'Геймплей остановлен',
      tipMobile: 'Касайтесь экрана для выстрела',
      tipDesktop: 'Кликайте мышью для выстрела',
      youDidIt: 'Так держать!',
      tryAgain: 'Попробуй ещё раз',
      authRequired: 'Войдите в аккаунт Яндекса для лидерборда',
      // Auth
      signIn: 'Войти в Яндекс',
      signedIn: 'Вы вошли как',
      guest: 'Гость',
      // Shop
      shop: 'Магазин',
      buyAmmo: 'Купить патроны',
      buyAmmoDesc: '+2 патрона на текущую волну',
      buySkin: 'Открыть скин',
      buySkinDesc: 'Золотой прицел навсегда',
      consumed: 'Куплено!',
      purchaseFailed: 'Покупка не удалась',
      paymentsUnavailable: 'Покупки недоступны',
      // Dog mascot
      dogReady: 'Готов?',
      dogNice: 'Молодец!',
      dogHaha: 'Ха-ха!',
      // Extras
      extraAmmo: '+2 патрона',
      goldCrosshair: 'Золотой прицел'
    },
    en: {
      title: 'Duck Hunt',
      subtitle: 'Arcade Shooter',
      start: 'Start Game',
      resume: 'Resume',
      restart: 'Restart',
      menu: 'Menu',
      pause: 'Pause',
      paused: 'Paused',
      score: 'Score',
      best: 'Best',
      wave: 'Wave',
      ammo: 'Ammo',
      ducksLeft: 'Ducks left',
      gameOver: 'Game Over!',
      waveComplete: 'Wave Complete!',
      newRecord: 'New Record!',
      loading: 'Loading...',
      tapToStart: 'Tap to start',
      howToPlay: 'How to play',
      howToPlayText: 'Shoot ducks with click or tap. You have 3 bullets per wave. Hit all ducks before they fly away!',
      leaderboard: 'Leaderboard',
      leaderboardName: 'Top Hunters',
      noLeaderboard: 'Leaderboard unavailable',
      submitScore: 'Submit Score',
      ok: 'OK',
      back: 'Back',
      sound: 'Sound',
      soundOn: 'On',
      soundOff: 'Off',
      language: 'Language',
      hits: 'Hits',
      accuracy: 'Accuracy',
      total: 'Total',
      bonus: 'Bonus',
      perfect: 'Perfect!',
      missed: 'Miss',
      reload: 'Reload',
      flyAway: 'Flew away!',
      gameplayStart: 'Gameplay started',
      gameplayStop: 'Gameplay stopped',
      tipMobile: 'Tap the screen to shoot',
      tipDesktop: 'Click to shoot',
      youDidIt: 'Well done!',
      tryAgain: 'Try again',
      authRequired: 'Sign in with Yandex to use leaderboard',
      // Auth
      signIn: 'Sign in with Yandex',
      signedIn: 'Signed in as',
      guest: 'Guest',
      // Shop
      shop: 'Shop',
      buyAmmo: 'Buy ammo',
      buyAmmoDesc: '+2 bullets for current wave',
      buySkin: 'Unlock skin',
      buySkinDesc: 'Golden crosshair forever',
      consumed: 'Purchased!',
      purchaseFailed: 'Purchase failed',
      paymentsUnavailable: 'Payments unavailable',
      // Dog mascot
      dogReady: 'Ready?',
      dogNice: 'Nice shot!',
      dogHaha: 'Ha-ha!',
      // Extras
      extraAmmo: '+2 bullets',
      goldCrosshair: 'Golden crosshair'
    }
  };

  let currentLang = 'en';

  /**
   * Detect language from Yandex SDK or browser
   * @param {string} sdkLang - language code from Yandex SDK (optional)
   */
  function detectLanguage(sdkLang) {
    let lang = (sdkLang || '').toLowerCase();
    if (!lang && typeof navigator !== 'undefined') {
      lang = (navigator.language || navigator.userLanguage || 'en').toLowerCase();
    }
    // Russian-speaking locales fallback to RU
    if (lang.startsWith('ru') || lang.startsWith('be') || lang.startsWith('uk') || lang.startsWith('kk')) {
      currentLang = 'ru';
    } else {
      currentLang = 'en';
    }
    return currentLang;
  }

  /**
   * Get translated text by key
   */
  function t(key) {
    const pack = dictionary[currentLang] || dictionary.en;
    return pack[key] !== undefined ? pack[key] : key;
  }

  /**
   * Change current language
   */
  function setLanguage(lang) {
    if (dictionary[lang]) {
      currentLang = lang;
      try {
        if (typeof document !== 'undefined' && document.documentElement) {
          document.documentElement.lang = lang;
        }
      } catch (e) { /* noop */ }
      return true;
    }
    return false;
  }

  function getLanguage() {
    return currentLang;
  }

  function getAvailableLanguages() {
    return Object.keys(dictionary);
  }

  // Public API
  global.i18n = {
    t: t,
    detectLanguage: detectLanguage,
    setLanguage: setLanguage,
    getLanguage: getLanguage,
    getAvailableLanguages: getAvailableLanguages
  };
})(typeof window !== 'undefined' ? window : this);
