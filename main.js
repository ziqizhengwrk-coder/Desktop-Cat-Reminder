const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');
const fs = require('fs');

const isDemo = process.argv.includes('--demo');
const shouldOpenWindowOnStart = process.argv.includes('--open-window');

const REMINDER_META = {
  stretch: {
    id: 'stretch',
    label: 'Stretch break',
    message: 'Time for a small stretch near your desk.',
  },
  walk: {
    id: 'walk',
    label: 'Outdoor walk',
    message: 'Go outside for a short walk.',
  },
};

const DEFAULT_SETTINGS = {
  stretchIntervalMinutes: isDemo ? 0.5 : 45,
  snoozeMinutes: isDemo ? 0.25 : 10,
  walkCount: 2,
  walkTimes: ['11:30', '17:30'],
  lunchEnabled: true,
  lunchStart: '12:00',
  lunchEnd: '13:30',
  calendarEnabled: false,
};

const TICK_MS = 1000;
const STALE_DUE_MS = isDemo ? 20 * 1000 : 2 * 60 * 1000;
const WALK_STRETCH_BUFFER_MS = isDemo ? 15 * 1000 : 30 * 60 * 1000;
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
      stretch: { nextAt: null, lastAt: null, done: 0, ignored: 0, snoozed: 0 },
      walk: { nextAt: null, lastAt: null, done: 0, ignored: 0, snoozed: 0 },
    },
    daily: dailySnapshot(new Date()),
    calendar: {},
  };

  initial.reminders.stretch.nextAt = nextStretchAt(new Date(now), initial.settings, {
    delayMinutes: initial.settings.stretchIntervalMinutes,
  });
  initial.reminders.walk.nextAt = nextWalkAt(new Date(now), initial.settings);
  return initial;
}

function dailySnapshot(date) {
  return {
    dateKey: toDateKey(date),
    stretchDone: 0,
    walkDone: 0,
    ignored: {
      stretch: 0,
      walk: 0,
    },
    completed: {
      stretch: false,
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

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function parseTimeForDate(time, date) {
  const [hours, minutes] = time.split(':').map(Number);
  const next = new Date(date);
  next.setHours(hours, minutes, 0, 0);
  return next;
}

function isValidTime(time) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(time).trim());
}

function normalizeWalkTimes(times, count = DEFAULT_SETTINGS.walkCount) {
  const wanted = Math.round(clampNumber(count, 1, 6, DEFAULT_SETTINGS.walkCount));
  const fallback = ['10:30', '11:30', '15:30', '17:30', '19:30', '21:00'];
  const validTimes = (Array.isArray(times) ? times : [])
    .map((time) => String(time).trim())
    .filter(isValidTime)
    .slice(0, wanted);

  while (validTimes.length < wanted) {
    validTimes.push(fallback[validTimes.length]);
  }

  return validTimes.sort();
}

function normalizeSettings(settings) {
  const walkCount = Math.round(clampNumber(settings.walkCount, 1, 6, DEFAULT_SETTINGS.walkCount));
  return {
    stretchIntervalMinutes: clampNumber(settings.stretchIntervalMinutes, isDemo ? 0.1 : 5, 240, 45),
    snoozeMinutes: clampNumber(settings.snoozeMinutes, 1, 60, 10),
    walkCount,
    walkTimes: normalizeWalkTimes(settings.walkTimes, walkCount),
    lunchEnabled: settings.lunchEnabled !== false,
    lunchStart: isValidTime(settings.lunchStart) ? settings.lunchStart : DEFAULT_SETTINGS.lunchStart,
    lunchEnd: isValidTime(settings.lunchEnd) ? settings.lunchEnd : DEFAULT_SETTINGS.lunchEnd,
    calendarEnabled: settings.calendarEnabled === true,
  };
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
  // Never restore stale reminder timestamps on app launch. Boot starts a fresh countdown.
  rescheduleFrom(new Date(), { resetStretchCountdown: true });
  saveState();
}

function mergeState(base, loaded) {
  const migratedSettings = migrateSettings(loaded.settings || {});
  const settings = normalizeSettings({ ...base.settings, ...migratedSettings });
  const daily = mergeDaily(base.daily, loaded.daily || {});
  const reminders = mergeReminders(base.reminders, loaded.reminders || {});

  return {
    ...base,
    ...loaded,
    settings,
    reminders,
    daily,
    calendar: normalizeCalendar({ ...base.calendar, ...(loaded.calendar || {}) }),
  };
}

function migrateSettings(settings) {
  return {
    ...settings,
    stretchIntervalMinutes:
      settings.stretchIntervalMinutes ?? settings.lightIntervalMinutes ?? DEFAULT_SETTINGS.stretchIntervalMinutes,
    walkCount: settings.walkCount ?? (Array.isArray(settings.walkTimes) ? settings.walkTimes.length : undefined),
  };
}

function mergeDaily(baseDaily, loadedDaily) {
  return {
    ...baseDaily,
    ...loadedDaily,
    stretchDone: loadedDaily.stretchDone ?? loadedDaily.lightDone ?? 0,
    walkDone: loadedDaily.walkDone ?? 0,
    ignored: {
      ...baseDaily.ignored,
      ...(loadedDaily.ignored || {}),
      stretch: loadedDaily.ignored?.stretch ?? loadedDaily.lightIgnored ?? 0,
      walk: loadedDaily.ignored?.walk ?? loadedDaily.walkIgnored ?? 0,
    },
    completed: {
      ...baseDaily.completed,
      stretch: Boolean(loadedDaily.completed?.stretch ?? loadedDaily.completed?.light ?? loadedDaily.completed?.big),
      walk: Boolean(loadedDaily.completed?.walk),
    },
  };
}

function mergeReminders(baseReminders, loadedReminders) {
  return {
    stretch: {
      ...baseReminders.stretch,
      ...(loadedReminders.stretch || loadedReminders.light || {}),
      nextAt: baseReminders.stretch.nextAt,
    },
    walk: {
      ...baseReminders.walk,
      ...(loadedReminders.walk || {}),
      nextAt: baseReminders.walk.nextAt,
    },
  };
}

function normalizeCalendar(calendar) {
  const normalized = {};
  for (const [dateKey, rawDay] of Object.entries(calendar || {})) {
    const stretch = Boolean(rawDay.stretch ?? rawDay.light ?? rawDay.big);
    const walk = Boolean(rawDay.walk);
    normalized[dateKey] = {
      stretch,
      walk,
      lit: stretch && walk,
    };
  }
  return normalized;
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
  }
  ensureCalendarDay(dateKey);
}

function ensureCalendarDay(dateKey = toDateKey(new Date())) {
  if (!state.calendar) {
    state.calendar = {};
  }
  if (!state.calendar[dateKey]) {
    state.calendar[dateKey] = {
      stretch: false,
      walk: false,
      lit: false,
    };
  }
  return state.calendar[dateKey];
}

function markCalendarProgress(reminderId) {
  const dateKey = toDateKey(new Date());
  const day = ensureCalendarDay(dateKey);
  if (reminderId === 'stretch' || reminderId === 'walk') {
    day[reminderId] = true;
  }
  day.lit = Boolean(day.stretch && day.walk);
  state.daily.completed[reminderId] = true;
}

function lunchIntervalsForDate(date, settings = state.settings) {
  if (!settings.lunchEnabled) return [];
  const start = parseTimeForDate(settings.lunchStart, date);
  const end = parseTimeForDate(settings.lunchEnd, date);
  if (end <= start) {
    end.setDate(end.getDate() + 1);
  }
  return [{ start, end, type: 'lunch' }];
}

function walkBufferIntervalsForDate(date, settings = state.settings) {
  return normalizeWalkTimes(settings.walkTimes, settings.walkCount).map((time) => {
    const walkAt = parseTimeForDate(time, date);
    return {
      start: new Date(walkAt.getTime() - WALK_STRETCH_BUFFER_MS),
      end: new Date(walkAt.getTime() + WALK_STRETCH_BUFFER_MS),
      type: 'walk-buffer',
    };
  });
}

function blockedIntervalsAround(date, settings = state.settings) {
  const dates = [];
  for (const offset of [-1, 0, 1]) {
    const next = new Date(date);
    next.setDate(next.getDate() + offset);
    dates.push(next);
  }

  return dates
    .flatMap((item) => [
      ...lunchIntervalsForDate(item, settings),
      ...walkBufferIntervalsForDate(item, settings),
    ])
    .sort((a, b) => a.start - b.start);
}

function isDuringLunch(date, settings = state.settings) {
  return blockedIntervalsAround(date, settings).some((block) => {
    return block.type === 'lunch' && date >= block.start && date < block.end;
  });
}

function adjustOutOfBlockedWindow(candidate, settings = state.settings) {
  let adjusted = new Date(candidate);
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const block = blockedIntervalsAround(adjusted, settings).find(
      (item) => adjusted >= item.start && adjusted < item.end,
    );
    if (!block) return adjusted.getTime();
    adjusted = new Date(block.end.getTime() + 1000);
  }
  return adjusted.getTime();
}

function adjustOutOfLunch(candidate, settings = state.settings) {
  let adjusted = new Date(candidate);
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const lunch = blockedIntervalsAround(adjusted, settings).find(
      (item) => item.type === 'lunch' && adjusted >= item.start && adjusted < item.end,
    );
    if (!lunch) return adjusted.getTime();
    adjusted = new Date(lunch.end.getTime() + 1000);
  }
  return adjusted.getTime();
}

function nextStretchAt(fromDate, settings = state.settings, options = {}) {
  const delayMinutes =
    options.delayMinutes ?? settings.stretchIntervalMinutes;
  const candidate = addMinutes(fromDate, delayMinutes);
  return adjustOutOfBlockedWindow(candidate, settings);
}

function nextWalkAt(fromDate, settings = state.settings) {
  const times = normalizeWalkTimes(settings.walkTimes, settings.walkCount);

  for (let dayOffset = 0; dayOffset < 8; dayOffset += 1) {
    const date = new Date(fromDate);
    date.setDate(date.getDate() + dayOffset);

    for (const time of times) {
      const candidate = parseTimeForDate(time, date);
      if (candidate <= fromDate) continue;
      if (isDuringLunch(candidate, settings)) continue;
      return candidate.getTime();
    }
  }

  const fallback = addMinutes(fromDate, 24 * 60);
  return fallback.getTime();
}

function rescheduleFrom(fromDate, options = {}) {
  const stretchDelay = options.resetStretchCountdown
    ? state.settings.stretchIntervalMinutes
    : options.stretchDelayMinutes;
  state.reminders.stretch.nextAt = nextStretchAt(fromDate, state.settings, {
    delayMinutes: stretchDelay,
  });
  state.reminders.walk.nextAt = nextWalkAt(fromDate, state.settings);
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
    if (statusWindow.isMinimized()) {
      statusWindow.restore();
    }
    if (!statusWindow.isVisible()) {
      statusWindow.show();
    }
    statusWindow.focus();
    statusWindow.moveTop();
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

function quitApp() {
  clearInterval(tickTimer);
  saveState();
  app.exit(0);
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
    state.reminders.walk.nextAt = nextWalkAt(new Date(), state.settings);
  } else {
    state.daily.stretchDone += 1;
    state.reminders.stretch.nextAt = nextStretchAt(new Date(), state.settings);
  }
  saveState();
  closeOverlay();
  pushState();
}

function snoozeReminder(reminderId) {
  const entry = state.reminders[reminderId];
  entry.snoozed += 1;
  if (reminderId === 'walk') {
    state.reminders.walk.nextAt = adjustOutOfLunch(
      addMinutes(new Date(), state.settings.snoozeMinutes),
      state.settings,
    );
  } else {
    state.reminders.stretch.nextAt = nextStretchAt(new Date(), state.settings, {
      delayMinutes: state.settings.snoozeMinutes,
    });
  }
  saveState();
  closeOverlay();
  pushState();
}

function ignoreReminder(reminderId) {
  const entry = state.reminders[reminderId];
  entry.ignored += 1;
  if (!state.daily.ignored) {
    state.daily.ignored = { stretch: 0, walk: 0 };
  }
  state.daily.ignored[reminderId] += 1;
  if (reminderId === 'walk') {
    state.reminders.walk.nextAt = nextWalkAt(new Date(), state.settings);
  } else {
    state.reminders.stretch.nextAt = nextStretchAt(new Date(), state.settings);
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
    for (const reminderId of ['walk', 'stretch']) {
      const nextAt = state.reminders[reminderId].nextAt;
      if (!nextAt || overlayWindow || nextAt > now) continue;

      if (now - nextAt > STALE_DUE_MS) {
        if (reminderId === 'walk') {
          state.reminders.walk.nextAt = nextWalkAt(new Date(now), state.settings);
        } else {
          state.reminders.stretch.nextAt = nextStretchAt(new Date(now), state.settings);
        }
        saveState();
        continue;
      }

      triggerReminder(reminderId);
      break;
    }
    pushState();
  }, TICK_MS);
}

function updateSettings(settings) {
  state.settings = normalizeSettings({ ...state.settings, ...settings });
  rescheduleFrom(new Date(), { resetStretchCountdown: true });
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

function calendarForPublicState() {
  return normalizeCalendar(state.calendar);
}

function publicState() {
  return {
    isDemo,
    now: Date.now(),
    reminders: {
      stretch: { ...state.reminders.stretch, label: REMINDER_META.stretch.label },
      walk: {
        ...state.reminders.walk,
        label: REMINDER_META.walk.label,
        configuredTimes: state.settings.walkTimes,
      },
    },
    settings: { ...state.settings },
    daily: state.daily,
    calendar: calendarForPublicState(),
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
ipcMain.on('app:quit', quitApp);
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
  if (shouldOpenWindowOnStart) {
    createStatusWindow();
  }
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
