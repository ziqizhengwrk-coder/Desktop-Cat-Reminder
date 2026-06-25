const stretchNext = document.getElementById('stretchNext');
const walkNext = document.getElementById('walkNext');
const walkTimes = document.getElementById('walkTimes');
const updated = document.getElementById('updated');
const mode = document.getElementById('mode');
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
const calendarTab = document.getElementById('calendarTab');
const calendarTitle = document.getElementById('calendarTitle');
const calendarGrid = document.getElementById('calendarGrid');
const todayProgress = document.getElementById('todayProgress');
const tabButtons = document.querySelectorAll('[data-tab]');
const tabPages = {
  overview: document.getElementById('overviewPage'),
  calendar: document.getElementById('calendarPage'),
  settings: document.getElementById('settingsPage'),
};

let isHydrating = false;
let hasUnsavedSettings = false;

function formatRemaining(nextAt, now) {
  if (!nextAt) return '--:--';
  const totalSeconds = Math.max(0, Math.ceil((nextAt - now) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return `${hours}h ${rest}m`;
  }
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function formatClock(value) {
  if (!value) return '--:--';
  return new Date(value).toLocaleTimeString('zh-CN', {
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
  return date.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
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
  if (currentInputs.length === count) return;

  walkTimeFields.textContent = '';
  for (let index = 0; index < count; index += 1) {
    const label = document.createElement('label');
    const text = document.createElement('span');
    const input = document.createElement('input');

    text.textContent = `Walk time ${index + 1}`;
    input.type = 'time';
    input.value = values[index] || '';
    input.dataset.walkTime = String(index);

    label.append(text, input);
    walkTimeFields.append(label);
  }
}

function render(state) {
  const now = Date.now();
  stretchNext.textContent = formatRemaining(state.reminders.stretch.nextAt, now);
  walkNext.textContent = formatRemaining(state.reminders.walk.nextAt, now);
  walkTimes.textContent = state.reminders.walk.configuredTimes.join(' / ');
  updated.textContent = `Last updated ${formatClock(now)}`;
  mode.textContent = state.isDemo ? 'Demo' : 'Running';
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
  };
}

function markDirty() {
  if (!isHydrating) {
    hasUnsavedSettings = true;
    saveStatus.textContent = 'Unsaved';
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
  saveStatus.textContent = 'Saved';
});

resetPosition.addEventListener('click', () => {
  window.catReminder.resetPetPosition();
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
