const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');
const fs = require('fs');

const isDemo = process.argv.includes('--demo');

const REMINDER_META = {
  light: {
    id: 'light',
    label: 'Light activity',
    message: 'Time to move. Stand up for 1-3 minutes.',
  },
  big: {
    id: 'big',
    label: 'Big activity',
    message: 'Step away from your seat for 5-10 minutes.',
  },
  walk: {
    id: 'walk',
    label: 'Daily walk',
    message: 'Go outside for a 10 minute walk.',
  },
};

const DEFAULT_SETTINGS = {
  lightIntervalMinutes: isDemo ? 0.5 : 30,
  bigIntervalMinutes: isDemo ? 1 : 60,
  snoozeMinutes: isDemo ? 0.25 : 10,
  walkTimes: ['11:30', '17:30'],
};

const TICK_MS = 1000;
const PET_SIZE = 132;
const PET_MARGIN = 24;
const PET_VISIBLE = {
  left: 24,
  top: 20,
  right: 108,
  bottom: 104,
};
const APP_ICON = path.join(__dirname, 'src', 'assets', 'cat-icon.ico');

let petWindow;
let statusWindow;
let overlayWindow;
let tickTimer;
let storePath;
let state;

function createInitialState() {
  const now = Date.now();
  const initial = {
    createdAt: now,
    petBounds: null,
    settings: { ...DEFAULT_SETTINGS },
    reminders: {
      light: { nextAt: now, lastAt: null, done: 0, ignored: 0, snoozed: 0 },
      big: { nextAt: now, lastAt: null, done: 0, ignored: 0, snoozed: 0 },
      walk: { nextAt: now, lastAt: null, done: 0, ignored: 0, snoozed: 0 },
    },
    daily: dailySnapshot(new Date()),
    calendar: {},
  };

  initial.reminders.light.nextAt = now + intervalMs('light', initial.settings);
  initial.reminders.big.nextAt = now + intervalMs('big', initial.settings);
  initial.reminders.walk.nextAt = nextWalkAt(new Date(now), initial.settings);
  return initial;
}

function dailySnapshot(date) {
  return {
    dateKey: toDateKey(date),
    walkDone: 0,
    walkIgnored: 0,
    completed: {
      light: false,
      big: false,
      walk: false,
    },
  };
}

function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function intervalMs(reminderId, settings = state.settings) {
  const minutes =
    reminderId === 'light' ? settings.lightIntervalMinutes : settings.bigIntervalMinutes;
  return Math.max(0.1, Number(minutes)) * 60 * 1000;
}

function parseTimeForDate(time, date) {
  const [hours, minutes] = time.split(':').map(Number);
  const next = new Date(date);
  next.setHours(hours, minutes, 0, 0);
  return next;
}

function nextWalkAt(fromDate, settings = state.settings) {
  const times = normalizedWalkTimes(settings.walkTimes);

  for (const time of times) {
    const candidate = parseTimeForDate(time, fromDate);
    if (candidate.getTime() > fromDate.getTime()) {
      return candidate.getTime();
    }
  }

  const tomorrow = new Date(fromDate);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return parseTimeForDate(times[0], tomorrow).getTime();
}

function normalizedWalkTimes(times) {
  const validTimes = (Array.isArray(times) ? times : [])
    .map((time) => String(time).trim())
    .filter((time) => /^([01]\d|2[0-3]):[0-5]\d$/.test(time))
    .slice(0, 2);

  while (validTimes.length < 2) {
    validTimes.push(DEFAULT_SETTINGS.walkTimes[validTimes.length]);
  }

  return validTimes.sort();
}

function normalizeSettings(settings) {
  return {
    lightIntervalMinutes: clampNumber(settings.lightIntervalMinutes, 1, 240, 30),
    bigIntervalMinutes: clampNumber(settings.bigIntervalMinutes, 1, 480, 60),
    snoozeMinutes: clampNumber(settings.snoozeMinutes, 1, 60, 10),
    walkTimes: normalizedWalkTimes(settings.walkTimes),
  };
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function loadState() {
  storePath = path.join(app.getPath('userData'), 'state.json');
  try {
    const loaded = JSON.parse(fs.readFileSync(storePath, 'utf8'));
    state = mergeState(createInitialState(), loaded);
  } catch {
    state = createInitialState();
  }
  resetDailyIfNeeded();
  saveState();
}

function mergeState(base, loaded) {
  const settings = normalizeSettings({ ...base.settings, ...(loaded.settings || {}) });
  const daily = {
    ...base.daily,
    ...(loaded.daily || {}),
    completed: {
      ...base.daily.completed,
      ...(loaded.daily?.completed || {}),
    },
  };

  return {
    ...base,
    ...loaded,
    settings,
    reminders: {
      light: { ...base.reminders.light, ...(loaded.reminders?.light || {}) },
      big: { ...base.reminders.big, ...(loaded.reminders?.big || {}) },
      walk: { ...base.reminders.walk, ...(loaded.reminders?.walk || {}) },
    },
    daily,
    calendar: { ...base.calendar, ...(loaded.calendar || {}) },
  };
}

function saveState() {
  fs.mkdirSync(path.dirname(storePath), { recursive: true });
  fs.writeFileSync(storePath, JSON.stringify(state, null, 2));
}

function resetDailyIfNeeded() {
  const now = new Date();
  const dateKey = toDateKey(now);
  if (!state.daily || state.daily.dateKey !== dateKey) {
    state.daily = dailySnapshot(now);
    state.reminders.walk.nextAt = nextWalkAt(now);
  }
  ensureCalendarDay(dateKey);
}

function ensureCalendarDay(dateKey = toDateKey(new Date())) {
  if (!state.calendar) {
    state.calendar = {};
  }
  if (!state.calendar[dateKey]) {
    state.calendar[dateKey] = {
      light: false,
      big: false,
      walk: false,
      lit: false,
    };
  }
  return state.calendar[dateKey];
}

function markCalendarProgress(reminderId) {
  const dateKey = toDateKey(new Date());
  const day = ensureCalendarDay(dateKey);
  day[reminderId] = true;
  day.lit = Boolean(day.light && day.big && day.walk);

  if (!state.daily.completed) {
    state.daily.completed = { light: false, big: false, walk: false };
  }
  state.daily.completed[reminderId] = true;
}

function createPetWindow() {
  const display = screen.getPrimaryDisplay();
  const { width, height } = display.workAreaSize;
  const savedBounds = state.petBounds;
  const defaultBounds = {
    width: PET_SIZE,
    height: PET_SIZE,
    x: width - PET_SIZE - PET_MARGIN,
    y: height - PET_SIZE - PET_MARGIN,
  };

  petWindow = new BrowserWindow({
    ...(savedBounds || defaultBounds),
    icon: APP_ICON,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  petWindow.setAlwaysOnTop(true, 'floating');
  petWindow.loadFile(path.join(__dirname, 'src', 'pet.html'));
  petWindow.on('moved', persistPetBounds);
  petWindow.on('closed', () => {
    petWindow = null;
  });
}

function persistPetBounds() {
  if (!petWindow) return;
  state.petBounds = petWindow.getBounds();
  saveState();
}

function createStatusWindow() {
  if (statusWindow) {
    statusWindow.focus();
    pushState();
    return;
  }

  statusWindow = new BrowserWindow({
    width: 500,
    height: 760,
    minWidth: 420,
    minHeight: 640,
    title: 'Desktop Cat Reminder',
    icon: APP_ICON,
    backgroundColor: '#f7f3ea',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  statusWindow.loadFile(path.join(__dirname, 'src', 'status.html'));
  statusWindow.on('closed', () => {
    statusWindow = null;
  });
}

function createOverlayWindow(reminderId) {
  if (overlayWindow) {
    overlayWindow.close();
  }

  const reminder = REMINDER_META[reminderId];
  overlayWindow = new BrowserWindow({
    fullscreen: true,
    icon: APP_ICON,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  overlayWindow.setAlwaysOnTop(true, 'screen-saver');
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlayWindow.loadFile(path.join(__dirname, 'src', 'overlay.html'), {
    query: { reminderId },
  });
  overlayWindow.once('ready-to-show', () => {
    overlayWindow.show();
    overlayWindow.focus();
    overlayWindow.webContents.send('reminder:data', {
      id: reminder.id,
      label: reminder.label,
      message: reminder.message,
      snoozeMinutes: `${state.settings.snoozeMinutes} min`,
    });
  });
  overlayWindow.on('closed', () => {
    overlayWindow = null;
  });
}

function triggerReminder(reminderId) {
  const entry = state.reminders[reminderId];
  entry.lastAt = Date.now();
  if (reminderId === 'light') {
    entry.nextAt = Date.now() + intervalMs('light');
  } else if (reminderId === 'big') {
    entry.nextAt = Date.now() + intervalMs('big');
  } else if (reminderId === 'walk') {
    entry.nextAt = nextWalkAt(new Date(Date.now() + 1000));
  }

  saveState();
  createOverlayWindow(reminderId);
  if (petWindow) {
    petWindow.webContents.send('pet:alert', { reminderId });
  }
  pushState();
}

function completeReminder(reminderId) {
  const entry = state.reminders[reminderId];
  entry.done += 1;
  markCalendarProgress(reminderId);
  if (reminderId === 'walk') {
    state.daily.walkDone += 1;
  }
  saveState();
  closeOverlay();
  pushState();
}

function snoozeReminder(reminderId) {
  const entry = state.reminders[reminderId];
  entry.snoozed += 1;
  entry.nextAt = Date.now() + state.settings.snoozeMinutes * 60 * 1000;
  saveState();
  closeOverlay();
  pushState();
}

function ignoreReminder(reminderId) {
  const entry = state.reminders[reminderId];
  entry.ignored += 1;
  if (reminderId === 'walk') {
    state.daily.walkIgnored += 1;
  }
  saveState();
  closeOverlay();
  pushState();
}

function closeOverlay() {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.close();
  }
  if (petWindow) {
    petWindow.webContents.send('pet:calm');
  }
}

function startScheduler() {
  clearInterval(tickTimer);
  tickTimer = setInterval(() => {
    resetDailyIfNeeded();
    const now = Date.now();
    for (const reminderId of ['light', 'big', 'walk']) {
      if (state.reminders[reminderId].nextAt <= now && !overlayWindow) {
        triggerReminder(reminderId);
        break;
      }
    }
    pushState();
  }, TICK_MS);
}

function updateSettings(settings) {
  state.settings = normalizeSettings({ ...state.settings, ...settings });
  const now = Date.now();
  state.reminders.light.nextAt = now + intervalMs('light');
  state.reminders.big.nextAt = now + intervalMs('big');
  state.reminders.walk.nextAt = nextWalkAt(new Date(now));
  saveState();
  pushState();
}

function movePetBy(deltaX, deltaY) {
  if (!petWindow) return;
  const bounds = petWindow.getBounds();
  const displayBounds = screen.getDisplayMatching(bounds).bounds;
  const nextBounds = {
    ...bounds,
    x: clampNumber(
      bounds.x + deltaX,
      displayBounds.x - PET_VISIBLE.left,
      displayBounds.x + displayBounds.width - PET_VISIBLE.right,
      bounds.x,
    ),
    y: clampNumber(
      bounds.y + deltaY,
      displayBounds.y - PET_VISIBLE.top,
      displayBounds.y + displayBounds.height - PET_VISIBLE.bottom,
      bounds.y,
    ),
  };
  petWindow.setBounds({
    ...nextBounds,
    x: Math.round(nextBounds.x),
    y: Math.round(nextBounds.y),
  });
}

function publicState() {
  return {
    isDemo,
    now: Date.now(),
    reminders: {
      light: { ...state.reminders.light, label: REMINDER_META.light.label },
      big: { ...state.reminders.big, label: REMINDER_META.big.label },
      walk: {
        ...state.reminders.walk,
        label: REMINDER_META.walk.label,
        configuredTimes: state.settings.walkTimes,
      },
    },
    settings: { ...state.settings },
    daily: state.daily,
    calendar: state.calendar,
  };
}

function pushState() {
  const snapshot = publicState();
  for (const win of [statusWindow, petWindow]) {
    if (win && !win.isDestroyed()) {
      win.webContents.send('state:update', snapshot);
    }
  }
}

ipcMain.handle('state:get', () => publicState());
ipcMain.on('pet:open-status', createStatusWindow);
ipcMain.on('pet:drag-move', (_event, deltaX, deltaY) => movePetBy(deltaX, deltaY));
ipcMain.on('reminder:done', (_event, reminderId) => completeReminder(reminderId));
ipcMain.on('reminder:snooze', (_event, reminderId) => snoozeReminder(reminderId));
ipcMain.on('reminder:ignore', (_event, reminderId) => ignoreReminder(reminderId));
ipcMain.on('settings:update', (_event, settings) => updateSettings(settings));
ipcMain.on('status:reset-position', () => {
  state.petBounds = null;
  saveState();
  if (petWindow) {
    const display = screen.getPrimaryDisplay();
    const { width, height } = display.workAreaSize;
    petWindow.setBounds({
      width: PET_SIZE,
      height: PET_SIZE,
      x: width - PET_SIZE - PET_MARGIN,
      y: height - PET_SIZE - PET_MARGIN,
    });
  }
});

app.whenReady().then(() => {
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.desktop-cat-reminder.app');
  }
  loadState();
  createPetWindow();
  startScheduler();
});

app.on('activate', () => {
  if (!petWindow) {
    createPetWindow();
  }
});

app.on('window-all-closed', (event) => {
  event.preventDefault();
});

app.on('before-quit', () => {
  clearInterval(tickTimer);
  saveState();
});
