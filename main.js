const { app, BrowserWindow, ipcMain, screen, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

const isDemo = process.argv.includes('--demo');
const shouldOpenWindowOnStart = process.argv.includes('--open-window');

const REMINDER_META = {
  stretch: {
    id: 'stretch',
  },
  walk: {
    id: 'walk',
  },
};

const REMINDER_COPY = {
  'zh-CN': {
    stretch: {
      label: '拉伸活动',
      title: '拉伸一下吧！',
      message: '在工位附近做一点颈肩拉伸和轻微活动。',
    },
    walk: {
      label: '户外走路',
      title: '出去走走吧！',
      message: '离开座位，到外面走 10 分钟。',
    },
  },
  en: {
    stretch: {
      label: 'Stretch break',
      title: 'Stretch a little!',
      message: 'Time for a small stretch near your desk.',
    },
    walk: {
      label: 'Outdoor walk',
      title: 'Go for a walk!',
      message: 'Go outside for a short walk.',
    },
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
  language: 'zh-CN',
};

const TICK_MS = 1000;
const STALE_DUE_MS = isDemo ? 20 * 1000 : 2 * 60 * 1000;
const UNHANDLED_REMINDER_TIMEOUT_MS = isDemo ? 30 * 1000 : 10 * 60 * 1000;
const WALK_STRETCH_BUFFER_MS = isDemo ? 15 * 1000 : 30 * 60 * 1000;
const PET_SIZE = 172;
const PET_MARGIN = 0;
const PET_VISIBLE = {
  left: 24,
  top: 38,
  right: 148,
  bottom: 164,
};
const APP_ICON = path.join(__dirname, 'src', 'assets', 'cat-icon.ico');
const LOGIN_ITEM_NAME = 'Desktop Cat Reminder';
const UPDATE_RELEASES_API =
  'https://api.github.com/repos/ziqizhengwrk-coder/Desktop-Cat-Reminder/releases/latest';
const UPDATE_RELEASES_PAGE =
  'https://github.com/ziqizhengwrk-coder/Desktop-Cat-Reminder/releases/latest';

let petWindow;
let statusWindow;
let overlayWindow;
let tickTimer;
let storePath;
let state;
let petMouseIgnored = false;
let activeReminderId = null;
let activeReminderStartedAt = null;

function createInitialState() {
  const now = Date.now();
  const initial = {
    createdAt: now,
    petBounds: null,
    doNotDisturb: false,
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
  const language = ['zh-CN', 'en'].includes(settings.language) ? settings.language : DEFAULT_SETTINGS.language;
  return {
    stretchIntervalMinutes: clampNumber(settings.stretchIntervalMinutes, isDemo ? 0.1 : 5, 240, 45),
    snoozeMinutes: clampNumber(settings.snoozeMinutes, 1, 60, 10),
    walkCount,
    walkTimes: normalizeWalkTimes(settings.walkTimes, walkCount),
    lunchEnabled: settings.lunchEnabled !== false,
    lunchStart: isValidTime(settings.lunchStart) ? settings.lunchStart : DEFAULT_SETTINGS.lunchStart,
    lunchEnd: isValidTime(settings.lunchEnd) ? settings.lunchEnd : DEFAULT_SETTINGS.lunchEnd,
    calendarEnabled: settings.calendarEnabled === true,
    language,
  };
}

function reminderCopy(reminderId, language = state?.settings?.language || DEFAULT_SETTINGS.language) {
  return REMINDER_COPY[language]?.[reminderId] || REMINDER_COPY.en[reminderId];
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
    doNotDisturb: loaded.doNotDisturb === true,
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

function parseVersion(version) {
  return String(version || '0.0.0')
    .replace(/^v/i, '')
    .split(/[.-]/)
    .map((part) => Number.parseInt(part, 10) || 0);
}

function loginItemOptions() {
  if (process.platform !== 'win32') return {};
  return {
    path: process.execPath,
    // Electron 42 quotes command-line arguments when writing the login item.
    args: app.isPackaged ? ['--autostart'] : [app.getAppPath(), '--autostart'],
  };
}

function getAutoStart() {
  const supported = process.platform === 'win32' || (process.platform === 'darwin' && app.isPackaged);
  if (!supported) return { supported: false, enabled: false, error: 'startup.unsupported' };
  try {
    const options = loginItemOptions();
    // On Windows the lookup parses path as a command line, including spaces.
    const login = app.getLoginItemSettings(process.platform === 'win32'
      ? { ...options, path: `"${options.path}"` }
      : options);
    // launchItems.args contains positional arguments only, excluding -- switches.
    const positionalArgs = (options.args || []).filter(arg => arg !== '--autostart');
    // openAtLogin reads the AppUserModelId entry, not our custom entry name.
    const enabled = process.platform === 'win32'
      ? (login.launchItems || []).some(item =>
        item.name === LOGIN_ITEM_NAME &&
        item.scope === 'user' &&
        item.enabled &&
        item.args.length === positionalArgs.length &&
        item.args.every((arg, index) => arg === positionalArgs[index]))
      : login.openAtLogin;
    return {
      supported: true,
      enabled: Boolean(enabled),
      error: login.status === 'requires-approval' ? 'startup.approval' : null,
    };
  } catch {
    return { supported: true, enabled: false, error: 'startup.readError' };
  }
}

function setAutoStart(enabled) {
  const current = getAutoStart();
  if (!current.supported || typeof enabled !== 'boolean') return current;
  try {
    app.setLoginItemSettings({
      ...loginItemOptions(),
      ...(process.platform === 'win32' ? { name: LOGIN_ITEM_NAME, enabled } : {}),
      openAtLogin: enabled,
    });
    const result = getAutoStart();
    if (!result.error && result.enabled !== enabled) result.error = 'startup.writeError';
    return result;
  } catch {
    return { ...getAutoStart(), error: 'startup.writeError' };
  }
}

function compareVersions(left, right) {
  const leftParts = parseVersion(left);
  const rightParts = parseVersion(right);
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const diff = (leftParts[index] || 0) - (rightParts[index] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

async function checkForUpdates() {
  const currentVersion = app.getVersion();
  try {
    const response = await fetch(UPDATE_RELEASES_API, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'Desktop-Cat-Reminder',
      },
    });

    if (!response.ok) {
      throw new Error(`GitHub returned ${response.status}`);
    }

    const release = await response.json();
    const latestVersion = String(release.tag_name || release.name || '').replace(/^v/i, '');
    const downloadAsset = (release.assets || []).find((asset) => {
      return /\.exe$/i.test(asset.name || '');
    });
    const releaseUrl = release.html_url || UPDATE_RELEASES_PAGE;
    const downloadUrl = downloadAsset?.browser_download_url || releaseUrl;

    return {
      ok: true,
      currentVersion,
      latestVersion,
      hasUpdate: compareVersions(latestVersion, currentVersion) > 0,
      releaseName: release.name || `v${latestVersion}`,
      releaseUrl,
      downloadUrl,
    };
  } catch (error) {
    return {
      ok: false,
      currentVersion,
      latestVersion: null,
      hasUpdate: false,
      message: 'Could not check updates. Please try again later.',
      detail: error.message,
    };
  }
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

function lunchBlockAt(date, settings = state.settings) {
  return blockedIntervalsAround(date, settings).find((block) => {
    return block.type === 'lunch' && date >= block.start && date < block.end;
  });
}

function adjustOutOfBlockedWindow(candidate, settings = state.settings, options = {}) {
  let adjusted = new Date(candidate);
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const block = blockedIntervalsAround(adjusted, settings).find(
      (item) => adjusted >= item.start && adjusted < item.end,
    );
    if (!block) return adjusted.getTime();
    if (block.type === 'lunch' && Number.isFinite(options.restartAfterLunchMinutes)) {
      adjusted = addMinutes(block.end, options.restartAfterLunchMinutes);
    } else {
      adjusted = new Date(block.end.getTime() + 1000);
    }
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
  const activeLunch = lunchBlockAt(fromDate, settings);
  const baseDate = activeLunch ? activeLunch.end : fromDate;
  const candidate = addMinutes(baseDate, delayMinutes);
  return adjustOutOfBlockedWindow(candidate, settings, {
    restartAfterLunchMinutes: delayMinutes,
  });
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
  if (state.doNotDisturb) {
    state.reminders.stretch.nextAt = null;
    state.reminders.walk.nextAt = null;
    return;
  }
  const stretchDelay = options.resetStretchCountdown
    ? state.settings.stretchIntervalMinutes
    : options.stretchDelayMinutes;
  state.reminders.stretch.nextAt = nextStretchAt(fromDate, state.settings, {
    delayMinutes: stretchDelay,
  });
  state.reminders.walk.nextAt = nextWalkAt(fromDate, state.settings);
}

function setDoNotDisturb(enabled) {
  if (typeof enabled !== 'boolean') throw new TypeError('Expected a boolean');
  if (state.doNotDisturb === enabled) return publicState();
  state.doNotDisturb = enabled;
  if (enabled) closeOverlay();
  rescheduleFrom(new Date(), { resetStretchCountdown: true });
  saveState();
  pushState();
  return publicState();
}

function rescheduleReminderFrom(reminderId, fromDate) {
  if (reminderId === 'walk') {
    state.reminders.walk.nextAt = nextWalkAt(fromDate, state.settings);
  } else if (reminderId === 'stretch') {
    state.reminders.stretch.nextAt = nextStretchAt(fromDate, state.settings);
  }
}

function rescheduleDueRemindersFrom(fromDate) {
  const now = fromDate.getTime();
  for (const reminderId of ['walk', 'stretch']) {
    const nextAt = state.reminders[reminderId].nextAt;
    if (nextAt && nextAt <= now) {
      rescheduleReminderFrom(reminderId, fromDate);
    }
  }
}

function recoverUnattendedReminder(now) {
  if (!overlayWindow) {
    if (activeReminderId) {
      clearActiveReminder();
    }
    return false;
  }
  if (!activeReminderStartedAt) {
    activeReminderStartedAt = now;
    return false;
  }
  if (now - activeReminderStartedAt <= UNHANDLED_REMINDER_TIMEOUT_MS) return false;

  rescheduleDueRemindersFrom(new Date(now));
  closeOverlay();
  saveState();
  pushState();
  return true;
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
  petMouseIgnored = false;

  petWindow.setAlwaysOnTop(true, 'floating');
  petWindow.loadFile(path.join(__dirname, 'src', 'pet.html'));
  petWindow.webContents.once('did-finish-load', () => {
    setPetMouseIgnored(true);
  });
  petWindow.on('moved', persistPetBounds);
  petWindow.on('closed', () => {
    petWindow = null;
    petMouseIgnored = false;
  });
}

function setPetMouseIgnored(ignored) {
  if (!petWindow || petWindow.isDestroyed() || petMouseIgnored === ignored) return;
  petMouseIgnored = ignored;
  petWindow.setIgnoreMouseEvents(ignored, { forward: true });
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
    height: 600,
    minWidth: 420,
    minHeight: 520,
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
  const copy = reminderCopy(reminderId);
  const currentOverlayWindow = new BrowserWindow({
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
  overlayWindow = currentOverlayWindow;

  currentOverlayWindow.setAlwaysOnTop(true, 'screen-saver');
  currentOverlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  currentOverlayWindow.loadFile(path.join(__dirname, 'src', 'overlay.html'), {
    query: { reminderId },
  });
  currentOverlayWindow.once('ready-to-show', () => {
    if (state.doNotDisturb || currentOverlayWindow.isDestroyed() || overlayWindow !== currentOverlayWindow) return;
    currentOverlayWindow.show();
    currentOverlayWindow.focus();
    currentOverlayWindow.webContents.send('reminder:data', {
      id: reminder.id,
      language: state.settings.language,
      label: copy.label,
      title: copy.title,
      message: copy.message,
      snoozeMinutes: state.settings.snoozeMinutes,
    });
  });
  currentOverlayWindow.on('closed', () => {
    if (overlayWindow === currentOverlayWindow) {
      overlayWindow = null;
      clearActiveReminder();
    }
  });
}

function triggerReminder(reminderId) {
  if (state.doNotDisturb) return;
  const entry = state.reminders[reminderId];
  entry.lastAt = Date.now();
  activeReminderId = reminderId;
  activeReminderStartedAt = entry.lastAt;
  saveState();
  createOverlayWindow(reminderId);
  if (petWindow) {
    petWindow.webContents.send('pet:alert', { reminderId });
  }
  pushState();
}

function completeReminder(reminderId) {
  if (state.doNotDisturb || activeReminderId !== reminderId) return;
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
  if (state.doNotDisturb || activeReminderId !== reminderId) return;
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
  if (state.doNotDisturb || activeReminderId !== reminderId) return;
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
  clearActiveReminder();
}

function clearActiveReminder() {
  activeReminderId = null;
  activeReminderStartedAt = null;
  if (petWindow && !petWindow.isDestroyed()) {
    petWindow.webContents.send('pet:calm');
  }
}

function startScheduler() {
  clearInterval(tickTimer);
  tickTimer = setInterval(() => {
    resetDailyIfNeeded();
    if (state.doNotDisturb) {
      pushState();
      return;
    }
    const now = Date.now();
    if (recoverUnattendedReminder(now)) return;
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
  const language = state.settings.language;
  return {
    isDemo,
    doNotDisturb: state.doNotDisturb,
    appVersion: app.getVersion(),
    now: Date.now(),
    reminders: {
      stretch: { ...state.reminders.stretch, label: reminderCopy('stretch', language).label },
      walk: {
        ...state.reminders.walk,
        label: reminderCopy('walk', language).label,
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
ipcMain.handle('dnd:set', (_event, enabled) => setDoNotDisturb(enabled));
ipcMain.handle('update:check', () => checkForUpdates());
ipcMain.handle('startup:get', () => getAutoStart());
ipcMain.handle('startup:set', (_event, enabled) => setAutoStart(enabled));
ipcMain.on('pet:open-status', createStatusWindow);
ipcMain.on('app:quit', quitApp);
ipcMain.on('external:open', (_event, url) => {
  if (/^https:\/\/github\.com\/ziqizhengwrk-coder\/Desktop-Cat-Reminder\/releases/i.test(String(url))) {
    shell.openExternal(url);
  }
});
ipcMain.on('pet:drag-move', (_event, deltaX, deltaY) => movePetBy(deltaX, deltaY));
ipcMain.on('pet:mouse-ignore', (_event, ignored) => setPetMouseIgnored(Boolean(ignored)));
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

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  let openStatusOnReady = shouldOpenWindowOnStart;
  let startupComplete = false;

  app.on('second-instance', () => {
    // A second launch can arrive before state and windows are initialized.
    openStatusOnReady = true;
    if (startupComplete) {
      createStatusWindow();
    }
  });

  app.whenReady().then(() => {
    if (process.platform === 'win32') {
      app.setAppUserModelId('com.desktop-cat-reminder.app');
    }
    Menu.setApplicationMenu(null);
    loadState();
    createPetWindow();
    if (openStatusOnReady) {
      createStatusWindow();
    }
    startScheduler();
    startupComplete = true;
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
    if (state) saveState();
  });
}
