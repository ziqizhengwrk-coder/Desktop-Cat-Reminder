const cat = document.getElementById('cat');
const petMenu = document.getElementById('petMenu');
const quitApp = document.getElementById('quitApp');
const pixelCat = document.querySelector('.pixel-cat');

let clickTimer = null;
let drag = null;
let suppressClickUntil = 0;
let suppressMenuUntil = 0;
let mouseIgnored = null;
let lastPointer = { x: 0, y: 0 };

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
  updateMousePassthrough();
}

function showPetMenu() {
  petMenu.style.left = '';
  petMenu.style.top = '';
  petMenu.style.right = '';
  petMenu.style.bottom = '';
  petMenu.classList.remove('hidden');
  setMouseIgnored(false);
}

function rectContainsPoint(rect, x, y, padding = 0) {
  return (
    x >= rect.left - padding &&
    x <= rect.right + padding &&
    y >= rect.top - padding &&
    y <= rect.bottom + padding
  );
}

function isInteractivePoint(x, y) {
  if (drag) return true;
  if (isPetMenuOpen() && rectContainsPoint(petMenu.getBoundingClientRect(), x, y, 4)) {
    return true;
  }
  return rectContainsPoint(pixelCat.getBoundingClientRect(), x, y, 6);
}

function setMouseIgnored(ignored) {
  if (mouseIgnored === ignored) return;
  mouseIgnored = ignored;
  window.catReminder.setPetMouseIgnore(ignored);
}

function updateMousePassthrough(event) {
  if (event) {
    lastPointer = { x: event.clientX, y: event.clientY };
  }

  const interactive = isInteractivePoint(lastPointer.x, lastPointer.y);
  if (isPetMenuOpen() && !interactive) {
    petMenu.classList.add('hidden');
  }
  setMouseIgnored(!interactive);
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
    showPetMenu();
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
  setMouseIgnored(false);
  cat.setPointerCapture(event.pointerId);
  drag = {
    lastX: event.screenX,
    lastY: event.screenY,
    moved: false,
  };
});

cat.addEventListener('pointermove', (event) => {
  lastPointer = { x: event.clientX, y: event.clientY };
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
    updateMousePassthrough();
  }, 0);
});

cat.addEventListener('pointercancel', () => {
  drag = null;
  updateMousePassthrough();
});

document.addEventListener('mousemove', updateMousePassthrough);

document.addEventListener('mouseleave', () => {
  if (!drag) {
    setMouseIgnored(true);
  }
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
