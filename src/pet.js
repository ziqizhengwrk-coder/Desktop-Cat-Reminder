const cat = document.getElementById('cat');
const petMenu = document.getElementById('petMenu');
const quitApp = document.getElementById('quitApp');

let clickTimer = null;
let drag = null;
let suppressClickUntil = 0;
let suppressMenuUntil = 0;

const petText = {
  'zh-CN': {
    open: '打开提醒状态',
    quit: '退出',
  },
  en: {
    open: 'Open reminder status',
    quit: 'Quit',
  },
};

function applyLanguage(language = 'zh-CN') {
  const text = petText[language] || petText.en;
  cat.setAttribute('aria-label', text.open);
  quitApp.textContent = text.quit;
}

function isPetMenuOpen() {
  return !petMenu.classList.contains('hidden');
}

function hidePetMenu() {
  petMenu.classList.add('hidden');
}

cat.addEventListener('dblclick', () => {
  clearTimeout(clickTimer);
  if (Date.now() > suppressClickUntil) {
    window.catReminder.openStatus();
  }
});

cat.addEventListener('click', () => {
  if (Date.now() <= suppressClickUntil) return;
  clearTimeout(clickTimer);
  clickTimer = window.setTimeout(() => {
    cat.animate(
      [
        { transform: 'translateY(0)' },
        { transform: 'translateY(-5px)' },
        { transform: 'translateY(0)' },
      ],
      { duration: 260, easing: 'steps(2, end)' },
    );
  }, 180);
});

cat.addEventListener('contextmenu', (event) => {
  event.preventDefault();
  if (Date.now() <= suppressMenuUntil) return;
  if (isPetMenuOpen()) {
    hidePetMenu();
  } else {
    petMenu.classList.remove('hidden');
  }
});

quitApp.addEventListener('click', () => {
  window.catReminder.quitApp();
});

document.addEventListener(
  'pointerdown',
  (event) => {
    if (!isPetMenuOpen() || event.target === quitApp) return;
    hidePetMenu();
    suppressClickUntil = Date.now() + 260;
    if (event.button === 2) {
      suppressMenuUntil = Date.now() + 260;
    }
    event.preventDefault();
    event.stopPropagation();
  },
  true,
);

document.addEventListener(
  'contextmenu',
  (event) => {
    if (!isPetMenuOpen() || event.target === quitApp) return;
    hidePetMenu();
    suppressClickUntil = Date.now() + 260;
    event.preventDefault();
    event.stopPropagation();
  },
  true,
);

document.addEventListener('pointerdown', (event) => {
  if (!petMenu.contains(event.target) && !cat.contains(event.target)) {
    hidePetMenu();
  }
});

cat.addEventListener('pointerdown', (event) => {
  cat.setPointerCapture(event.pointerId);
  drag = {
    lastX: event.screenX,
    lastY: event.screenY,
    moved: false,
  };
});

cat.addEventListener('pointermove', (event) => {
  if (!drag) return;
  const deltaX = event.screenX - drag.lastX;
  const deltaY = event.screenY - drag.lastY;
  if (Math.abs(deltaX) + Math.abs(deltaY) < 1) return;

  drag.moved = true;
  drag.lastX = event.screenX;
  drag.lastY = event.screenY;
  window.catReminder.dragPet(deltaX, deltaY);
});

cat.addEventListener('pointerup', () => {
  if (drag?.moved) {
    suppressClickUntil = Date.now() + 260;
  }
  window.setTimeout(() => {
    drag = null;
  }, 0);
});

cat.addEventListener('pointercancel', () => {
  drag = null;
});

window.catReminder.onPetAlert(() => {
  cat.classList.add('alert');
});

window.catReminder.onPetCalm(() => {
  cat.classList.remove('alert');
});

window.catReminder.getState().then((state) => {
  applyLanguage(state.settings?.language);
});

window.catReminder.onState((state) => {
  applyLanguage(state.settings?.language);
});
