/**
 * Localization module (RU + EN + BN)
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
      howToPlayText: 'Стреляйте по уткам кликом или касанием. В аркаде патроны бесконечные, в классике — 3 выстрела на волну. Собирайте бонусы: замедление, x2 очки, фокус и патроны.',
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
      goldCrosshair: 'Золотой прицел',
      arcadeMode: 'Аркада',
      arcadeModeDesc: 'Бесконечные патроны',
      classicMode: 'Классика',
      classicModeDesc: '3 выстрела на волну',
      combo: 'Комбо',
      maxCombo: 'Макс. комбо',
      noAmmo: 'Нет патронов!',
      powerSlow: 'Замедление!',
      powerBoost: 'x2 очки!',
      powerFocus: 'Фокус!',
      powerAmmo: '+1 патрон'
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
      howToPlayText: 'Shoot ducks with click or tap. Arcade has endless ammo; Classic gives you 3 shots per wave. Pick up power-ups for slow motion, x2 score, focus, and ammo.',
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
      goldCrosshair: 'Golden crosshair',
      arcadeMode: 'Arcade',
      arcadeModeDesc: 'Endless ammo',
      classicMode: 'Classic',
      classicModeDesc: '3 shots per wave',
      combo: 'Combo',
      maxCombo: 'Max combo',
      noAmmo: 'No ammo!',
      powerSlow: 'Slow motion!',
      powerBoost: 'x2 score!',
      powerFocus: 'Focus!',
      powerAmmo: '+1 ammo'
    },
    bn: {
      title: 'ডাক হান্ট',
      subtitle: 'আর্কেড শুটার',
      start: 'গেম শুরু করুন',
      resume: 'চালিয়ে যান',
      restart: 'আবার শুরু',
      menu: 'মেনু',
      pause: 'বিরতি',
      paused: 'বিরতি',
      score: 'স্কোর',
      best: 'সেরা',
      wave: 'ওয়েভ',
      ammo: 'গুলি',
      ducksLeft: 'বাকি হাঁস',
      gameOver: 'গেম শেষ!',
      waveComplete: 'ওয়েভ শেষ!',
      newRecord: 'নতুন রেকর্ড!',
      loading: 'লোড হচ্ছে...',
      tapToStart: 'শুরু করতে চাপুন',
      howToPlay: 'কীভাবে খেলবেন',
      howToPlayText: 'ক্লিক বা ট্যাপ করে হাঁস শিকার করুন। আর্কেডে অসীম গুলি, ক্লাসিকে প্রতি ওয়েভে ৩ শট। স্লো মোশন, x2 স্কোর, ফোকাস ও গুলির পাওয়ার-আপ নিন।',
      leaderboard: 'লিডারবোর্ড',
      leaderboardName: 'সেরা শিকারি',
      noLeaderboard: 'লিডারবোর্ড পাওয়া যায়নি',
      submitScore: 'স্কোর জমা দিন',
      ok: 'ঠিক আছে',
      back: 'ফিরে যান',
      sound: 'শব্দ',
      soundOn: 'চালু',
      soundOff: 'বন্ধ',
      language: 'ভাষা',
      hits: 'হিট',
      accuracy: 'নির্ভুলতা',
      total: 'মোট',
      bonus: 'বোনাস',
      perfect: 'পারফেক্ট!',
      missed: 'মিস',
      reload: 'রিলোড',
      flyAway: 'উড়ে গেল!',
      gameplayStart: 'গেমপ্লে শুরু',
      gameplayStop: 'গেমপ্লে বন্ধ',
      tipMobile: 'গুলি করতে স্ক্রিনে ট্যাপ করুন',
      tipDesktop: 'গুলি করতে মাউসে ক্লিক করুন',
      youDidIt: 'দারুণ!',
      tryAgain: 'আবার চেষ্টা করুন',
      authRequired: 'লিডারবোর্ডের জন্য Yandex-এ সাইন ইন করুন',
      signIn: 'Yandex দিয়ে সাইন ইন',
      signedIn: 'সাইন ইন করেছেন',
      guest: 'অতিথি',
      shop: 'শপ',
      buyAmmo: 'গুলি কিনুন',
      buyAmmoDesc: 'বর্তমান ওয়েভের জন্য +২ গুলি',
      buySkin: 'স্কিন আনলক করুন',
      buySkinDesc: 'স্থায়ী সোনালি ক্রসহেয়ার',
      consumed: 'কেনা হয়েছে!',
      purchaseFailed: 'কেনা যায়নি',
      paymentsUnavailable: 'পেমেন্ট পাওয়া যায়নি',
      dogReady: 'প্রস্তুত?',
      dogNice: 'দারুণ শট!',
      dogHaha: 'হা-হা!',
      extraAmmo: '+২ গুলি',
      goldCrosshair: 'সোনালি ক্রসহেয়ার',
      arcadeMode: 'আর্কেড',
      arcadeModeDesc: 'অসীম গুলি',
      classicMode: 'ক্লাসিক',
      classicModeDesc: 'প্রতি ওয়েভে ৩ শট',
      combo: 'কম্বো',
      maxCombo: 'সর্বোচ্চ কম্বো',
      noAmmo: 'গুলি নেই!',
      powerSlow: 'স্লো মোশন!',
      powerBoost: 'x2 স্কোর!',
      powerFocus: 'ফোকাস!',
      powerAmmo: '+১ গুলি'
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
    if (lang.startsWith('bn')) {
      currentLang = 'bn';
    } else if (lang.startsWith('ru') || lang.startsWith('be') || lang.startsWith('uk') || lang.startsWith('kk')) {
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
