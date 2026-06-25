const stretchNext = document.getElementById('stretchNext');
const walkNext = document.getElementById('walkNext');
const walkTimes = document.getElementById('walkTimes');
const updated = document.getElementById('updated');
const resetPosition = document.getElementById('resetPosition');
const settingsForm = document.getElementById('settingsForm');
const saveStatus = document.getElementById('saveStatus');
const stretchInterval = document.getElementById('stretchInterval');
const snoozeMinutes = document.getElementById('snoozeMinutes');
const walkCount = document.getElementById('walkCount');
const walkTimeFields = document.getElementById('walkTimeFields');
const lunchEnabled = document.getElementById('lunchEnabled');
const lunchStart = document.getElementById('lunchStart');
const lunchEnd = document.getElementById('lunchEnd');
const calendarEnabled = document.getElementById('calendarEnabled');
const languageSelect = document.getElementById('languageSelect');
const calendarTab = document.getElementById('calendarTab');
const calendarTitle = document.getElementById('calendarTitle');
const calendarGrid = document.getElementById('calendarGrid');
const todayProgress = document.getElementById('todayProgress');
const appVersion = document.getElementById('appVersion');
const checkUpdates = document.getElementById('checkUpdates');
const openUpdate = document.getElementById('openUpdate');
const updateStatus = document.getElementById('updateStatus');
const tabButtons = document.querySelectorAll('[data-tab]');
const settingsMenuItems = document.querySelectorAll('[data-settings-target]');
const settingsBackButtons = document.querySelectorAll('[data-settings-back]');
const settingsViews = document.querySelectorAll('.settings-view');
const tabPages = {
  overview: document.getElementById('overviewPage'),
  calendar: document.getElementById('calendarPage'),
  settings: document.getElementById('settingsPage'),
};

const translations = {
  'zh-CN': {
    'tabs.overview': '概览',
    'tabs.calendar': '日历',
    'tabs.settings': '设置',
    'overview.stretchTitle': '拉伸活动',
    'overview.stretchText': '在工位附近活动颈肩、手臂和身体',
    'overview.walkTitle': '户外走路',
    'overview.walkScheduled': '计划时间',
    'overview.resetCat': '重置小猫位置',
    'overview.updated': '最后更新 {time}',
    'calendar.title': '{year}年{month}月',
    'weekdays.mon': '一',
    'weekdays.tue': '二',
    'weekdays.wed': '三',
    'weekdays.thu': '四',
    'weekdays.fri': '五',
    'weekdays.sat': '六',
    'weekdays.sun': '日',
    'settings.title': '设置',
    'settings.saved': '已保存',
    'settings.unsaved': '未保存',
    'settings.save': '保存设置',
    'settings.interval': '时间间隔',
    'settings.intervalDesc': '拉伸间隔、稍后提醒、走路次数和时间',
    'settings.lunch': '午休',
    'settings.lunchDesc': '设置不打扰的午休时间段',
    'settings.calendar': '日历',
    'settings.calendarDesc': '控制是否显示日历页面',
    'settings.language': '语言',
    'settings.languageDesc': '切换中文或英文界面',
    'fields.stretchInterval': '拉伸间隔',
    'fields.snoozeTime': '稍后提醒',
    'fields.walkCount': '每日走路次数',
    'fields.walkTime': '第 {index} 次走路',
    'fields.lunchQuiet': '午休静默时间',
    'fields.lunchStart': '午休开始',
    'fields.lunchEnd': '午休结束',
    'fields.calendarTab': '显示日历页面',
    'fields.language': '界面语言',
    'units.minutes': '分钟',
    'units.timesPerDay': '次/天',
    'updates.manual': '手动检查更新',
    'updates.check': '检查更新',
    'updates.download': '下载',
    'updates.checking': '正在检查 GitHub Release...',
    'updates.error': '暂时无法检查更新，请稍后再试。',
    'updates.current': '已经是最新版本 v{version}',
    'updates.new': '发现新版本 v{version}',
  },
  en: {
    'tabs.overview': 'Overview',
    'tabs.calendar': 'Calendar',
    'tabs.settings': 'Settings',
    'overview.stretchTitle': 'Stretch break',
    'overview.stretchText': 'Near-desk stretch, neck and shoulder movement',
    'overview.walkTitle': 'Outdoor walk',
    'overview.walkScheduled': 'Scheduled at',
    'overview.resetCat': 'Reset cat position',
    'overview.updated': 'Last updated {time}',
    'calendar.title': '{month} {year}',
    'weekdays.mon': 'Mon',
    'weekdays.tue': 'Tue',
    'weekdays.wed': 'Wed',
    'weekdays.thu': 'Thu',
    'weekdays.fri': 'Fri',
    'weekdays.sat': 'Sat',
    'weekdays.sun': 'Sun',
    'settings.title': 'Settings',
    'settings.saved': 'Saved',
    'settings.unsaved': 'Unsaved',
    'settings.save': 'Save settings',
    'settings.interval': 'Interval',
    'settings.intervalDesc': 'Stretch interval, snooze time, walk count and times',
    'settings.lunch': 'Lunch',
    'settings.lunchDesc': 'Set a quiet lunch period',
    'settings.calendar': 'Calendar',
    'settings.calendarDesc': 'Control whether the calendar tab is shown',
    'settings.language': 'Language',
    'settings.languageDesc': 'Switch between Chinese and English',
    'fields.stretchInterval': 'Stretch interval',
    'fields.snoozeTime': 'Snooze time',
    'fields.walkCount': 'Outdoor walk count',
    'fields.walkTime': 'Walk time {index}',
    'fields.lunchQuiet': 'Lunch quiet time',
    'fields.lunchStart': 'Lunch start',
    'fields.lunchEnd': 'Lunch end',
    'fields.calendarTab': 'Calendar tab',
    'fields.language': 'Display language',
    'units.minutes': 'minutes',
    'units.timesPerDay': 'times/day',
    'updates.manual': 'Manual check only',
    'updates.check': 'Check update',
    'updates.download': 'Download',
    'updates.checking': 'Checking GitHub releases...',
    'updates.error': 'Could not check updates. Please try again later.',
    'updates.current': 'You are up to date on v{version}.',
    'updates.new': 'New version v{version} is available.',
  },
};

let isHydrating = false;
let hasUnsavedSettings = false;
let updateDownloadUrl = null;
let currentLanguage = 'zh-CN';
let updateStatusState = { key: 'updates.manual', values: {} };

function t(key, values = {}) {
  const template = translations[currentLanguage]?.[key] || translations.en[key] || key;
  return template.replace(/\{(\w+)\}/g, (_match, name) => values[name] ?? '');
}

function applyTranslations() {
  document.documentElement.lang = currentLanguage;
  for (const element of document.querySelectorAll('[data-i18n]')) {
    element.textContent = t(element.dataset.i18n);
  }
  for (const button of settingsBackButtons) {
    button.setAttribute('aria-label', currentLanguage === 'zh-CN' ? '返回' : 'Back');
  }
  updateStatus.textContent = t(updateStatusState.key, updateStatusState.values);
}

function formatRemaining(nextAt, now) {
  if (!nextAt) return '--:--';
  const totalSeconds = Math.max(0, Math.ceil((nextAt - now) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return currentLanguage === 'zh-CN' ? `${hours}小时 ${rest}分` : `${hours}h ${rest}m`;
  }
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function formatClock(value) {
  if (!value) return '--:--';
  return new Date(value).toLocaleTimeString(currentLanguage, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function monthTitle(date) {
  if (currentLanguage === 'zh-CN') {
    return t('calendar.title', {
      year: String(date.getFullYear()),
      month: String(date.getMonth() + 1),
    });
  }
  return t('calendar.title', {
    month: date.toLocaleDateString('en-US', { month: 'long' }),
    year: String(date.getFullYear()),
  });
}

function completionCount(day) {
  if (!day) return 0;
  return ['stretch', 'walk'].filter((key) => day[key]).length;
}

function renderCalendar(state) {
  const today = new Date(state.now || Date.now());
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const gridStart = new Date(monthStart);
  const mondayOffset = (monthStart.getDay() + 6) % 7;
  gridStart.setDate(monthStart.getDate() - mondayOffset);

  calendarTitle.textContent = monthTitle(today);
  const todayKey = toDateKey(today);
  todayProgress.textContent = `${completionCount(state.calendar?.[todayKey])}/2`;
  calendarGrid.textContent = '';

  for (let index = 0; index < 42; index += 1) {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    const dateKey = toDateKey(date);
    const day = state.calendar?.[dateKey] || null;
    const isCurrentMonth = date.getMonth() === today.getMonth();
    const isToday = dateKey === todayKey;
    const isLit = Boolean(day?.stretch && day?.walk);

    const cell = document.createElement('div');
    cell.className = [
      'calendar-day',
      isCurrentMonth ? '' : 'outside',
      isToday ? 'today' : '',
      isLit ? 'lit' : '',
    ]
      .filter(Boolean)
      .join(' ');
    cell.setAttribute('aria-label', `${dateKey} ${isLit ? 'complete' : 'in progress'}`);

    const number = document.createElement('span');
    number.textContent = String(date.getDate());
    cell.append(number);

    const dots = document.createElement('span');
    dots.className = 'dots';
    for (const key of ['stretch', 'walk']) {
      const dot = document.createElement('i');
      if (day?.[key]) {
        dot.className = 'done';
      }
      dots.append(dot);
    }
    cell.append(dots);
    calendarGrid.append(cell);
  }
}

function setInputValue(input, value) {
  if (document.activeElement !== input) {
    input.value = String(value);
  }
}

function ensureWalkTimeInputs(count, values = []) {
  const currentInputs = walkTimeFields.querySelectorAll('input[type="time"]');
  if (currentInputs.length !== count) {
    walkTimeFields.textContent = '';
    for (let index = 0; index < count; index += 1) {
      const label = document.createElement('label');
      const text = document.createElement('span');
      const input = document.createElement('input');

      input.type = 'time';
      input.value = values[index] || '';
      input.dataset.walkTime = String(index);

      label.append(text, input);
      walkTimeFields.append(label);
    }
  }

  for (const input of walkTimeFields.querySelectorAll('input[type="time"]')) {
    const index = Number(input.dataset.walkTime);
    input.previousElementSibling.textContent = t('fields.walkTime', { index: String(index + 1) });
  }
}

function render(state) {
  currentLanguage = state.settings.language || 'zh-CN';
  applyTranslations();

  const now = Date.now();
  stretchNext.textContent = formatRemaining(state.reminders.stretch.nextAt, now);
  walkNext.textContent = formatRemaining(state.reminders.walk.nextAt, now);
  walkTimes.textContent = state.reminders.walk.configuredTimes.join(' / ');
  updated.textContent = t('overview.updated', { time: formatClock(now) });
  appVersion.textContent = `v${state.appVersion || '--'}`;
  calendarTab.classList.toggle('hidden', !state.settings.calendarEnabled);
  if (!state.settings.calendarEnabled && tabPages.calendar.classList.contains('active')) {
    setActiveTab('overview');
  }
  renderCalendar(state);

  if (!hasUnsavedSettings) {
    isHydrating = true;
    setInputValue(stretchInterval, state.settings.stretchIntervalMinutes);
    setInputValue(snoozeMinutes, state.settings.snoozeMinutes);
    setInputValue(walkCount, state.settings.walkCount);
    ensureWalkTimeInputs(state.settings.walkCount, state.settings.walkTimes);
    for (const input of walkTimeFields.querySelectorAll('input[type="time"]')) {
      setInputValue(input, state.settings.walkTimes[Number(input.dataset.walkTime)] || '');
    }
    lunchEnabled.checked = Boolean(state.settings.lunchEnabled);
    calendarEnabled.checked = Boolean(state.settings.calendarEnabled);
    languageSelect.value = state.settings.language || 'zh-CN';
    setInputValue(lunchStart, state.settings.lunchStart);
    setInputValue(lunchEnd, state.settings.lunchEnd);
    isHydrating = false;
  }
}

function collectSettings() {
  const count = Number(walkCount.value);
  const walkInputs = [...walkTimeFields.querySelectorAll('input[type="time"]')];
  return {
    stretchIntervalMinutes: Number(stretchInterval.value),
    snoozeMinutes: Number(snoozeMinutes.value),
    walkCount: count,
    walkTimes: walkInputs.map((input) => input.value),
    lunchEnabled: lunchEnabled.checked,
    lunchStart: lunchStart.value,
    lunchEnd: lunchEnd.value,
    calendarEnabled: calendarEnabled.checked,
    language: languageSelect.value,
  };
}

function markDirty() {
  if (!isHydrating) {
    hasUnsavedSettings = true;
    saveStatus.textContent = t('settings.unsaved');
  }
}

function showSettingsView(name) {
  const targetId = name === 'root' ? 'settingsRoot' : `settings${name[0].toUpperCase()}${name.slice(1)}`;
  for (const view of settingsViews) {
    view.classList.toggle('active', view.id === targetId);
  }
}

window.catReminder.getState().then(render);
window.catReminder.onState(render);

function handleSettingsEdit(event) {
  if (event.target === walkCount) {
    const nextCount = Math.max(1, Math.min(6, Number(walkCount.value) || 1));
    const values = [...walkTimeFields.querySelectorAll('input[type="time"]')].map(
      (input) => input.value,
    );
    ensureWalkTimeInputs(nextCount, values);
  }
  markDirty();
}

settingsForm.addEventListener('input', handleSettingsEdit);
settingsForm.addEventListener('change', handleSettingsEdit);

settingsForm.addEventListener('submit', (event) => {
  event.preventDefault();
  hasUnsavedSettings = false;
  window.catReminder.updateSettings(collectSettings());
  saveStatus.textContent = t('settings.saved');
});

for (const item of settingsMenuItems) {
  item.addEventListener('click', () => {
    showSettingsView(item.dataset.settingsTarget);
  });
}

for (const button of settingsBackButtons) {
  button.addEventListener('click', () => {
    showSettingsView('root');
  });
}

resetPosition.addEventListener('click', () => {
  window.catReminder.resetPetPosition();
});

checkUpdates.addEventListener('click', async () => {
  checkUpdates.disabled = true;
  openUpdate.classList.add('hidden');
  updateDownloadUrl = null;
  updateStatusState = { key: 'updates.checking', values: {} };
  updateStatus.textContent = t(updateStatusState.key);

  const result = await window.catReminder.checkForUpdates();
  if (!result.ok) {
    updateStatusState = { key: 'updates.error', values: {} };
    updateStatus.textContent = t(updateStatusState.key);
    checkUpdates.disabled = false;
    return;
  }

  if (result.hasUpdate) {
    updateDownloadUrl = result.downloadUrl || result.releaseUrl;
    updateStatusState = { key: 'updates.new', values: { version: result.latestVersion } };
    updateStatus.textContent = t(updateStatusState.key, updateStatusState.values);
    openUpdate.classList.remove('hidden');
  } else {
    updateStatusState = { key: 'updates.current', values: { version: result.currentVersion } };
    updateStatus.textContent = t(updateStatusState.key, updateStatusState.values);
  }
  checkUpdates.disabled = false;
});

openUpdate.addEventListener('click', () => {
  if (updateDownloadUrl) {
    window.catReminder.openExternal(updateDownloadUrl);
  }
});

function setActiveTab(tabName) {
  for (const item of tabButtons) {
    item.classList.toggle('active', item.dataset.tab === tabName);
  }
  for (const [name, page] of Object.entries(tabPages)) {
    page.classList.toggle('active', name === tabName);
  }
}

for (const button of tabButtons) {
  button.addEventListener('click', () => {
    setActiveTab(button.dataset.tab);
  });
}
