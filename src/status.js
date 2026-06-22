const lightNext = document.getElementById('lightNext');
const bigNext = document.getElementById('bigNext');
const walkNext = document.getElementById('walkNext');
const walkTimes = document.getElementById('walkTimes');
const walkDone = document.getElementById('walkDone');
const doneCount = document.getElementById('doneCount');
const ignoredCount = document.getElementById('ignoredCount');
const updated = document.getElementById('updated');
const mode = document.getElementById('mode');
const resetPosition = document.getElementById('resetPosition');
const settingsForm = document.getElementById('settingsForm');
const saveStatus = document.getElementById('saveStatus');
const lightInterval = document.getElementById('lightInterval');
const bigInterval = document.getElementById('bigInterval');
const snoozeMinutes = document.getElementById('snoozeMinutes');
const walkTime1 = document.getElementById('walkTime1');
const walkTime2 = document.getElementById('walkTime2');
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

function formatRemaining(nextAt, now) {
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
  return ['light', 'big', 'walk'].filter((key) => day[key]).length;
}

function renderCalendar(state) {
  const today = new Date(state.now || Date.now());
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const gridStart = new Date(monthStart);
  const mondayOffset = (monthStart.getDay() + 6) % 7;
  gridStart.setDate(monthStart.getDate() - mondayOffset);

  calendarTitle.textContent = monthTitle(today);
  const todayKey = toDateKey(today);
  todayProgress.textContent = `${completionCount(state.calendar?.[todayKey])}/3`;
  calendarGrid.textContent = '';

  for (let index = 0; index < 42; index += 1) {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    const dateKey = toDateKey(date);
    const day = state.calendar?.[dateKey] || null;
    const isCurrentMonth = date.getMonth() === today.getMonth();
    const isToday = dateKey === todayKey;
    const isLit = Boolean(day?.lit);

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
    for (const key of ['light', 'big', 'walk']) {
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

function render(state) {
  const now = Date.now();
  lightNext.textContent = formatRemaining(state.reminders.light.nextAt, now);
  bigNext.textContent = formatRemaining(state.reminders.big.nextAt, now);
  walkNext.textContent = formatClock(state.reminders.walk.nextAt);
  walkTimes.textContent = state.reminders.walk.configuredTimes.join(' / ');

  const totalDone =
    state.reminders.light.done + state.reminders.big.done + state.reminders.walk.done;
  const totalIgnored =
    state.reminders.light.ignored + state.reminders.big.ignored + state.reminders.walk.ignored;

  walkDone.textContent = `${Math.min(state.daily.walkDone, 2)}/2`;
  doneCount.textContent = String(totalDone);
  ignoredCount.textContent = String(totalIgnored);
  updated.textContent = `Last updated ${formatClock(now)}`;
  mode.textContent = state.isDemo ? 'Demo' : 'Running';
  renderCalendar(state);

  isHydrating = true;
  setInputValue(lightInterval, state.settings.lightIntervalMinutes);
  setInputValue(bigInterval, state.settings.bigIntervalMinutes);
  setInputValue(snoozeMinutes, state.settings.snoozeMinutes);
  setInputValue(walkTime1, state.settings.walkTimes[0]);
  setInputValue(walkTime2, state.settings.walkTimes[1]);
  isHydrating = false;
}

function collectSettings() {
  return {
    lightIntervalMinutes: Number(lightInterval.value),
    bigIntervalMinutes: Number(bigInterval.value),
    snoozeMinutes: Number(snoozeMinutes.value),
    walkTimes: [walkTime1.value, walkTime2.value],
  };
}

function markDirty() {
  if (!isHydrating) {
    saveStatus.textContent = 'Unsaved';
  }
}

window.catReminder.getState().then(render);
window.catReminder.onState(render);

settingsForm.addEventListener('input', markDirty);

settingsForm.addEventListener('submit', (event) => {
  event.preventDefault();
  window.catReminder.updateSettings(collectSettings());
  saveStatus.textContent = 'Saved';
});

resetPosition.addEventListener('click', () => {
  window.catReminder.resetPetPosition();
});

for (const button of tabButtons) {
  button.addEventListener('click', () => {
    const tabName = button.dataset.tab;
    for (const item of tabButtons) {
      item.classList.toggle('active', item === button);
    }
    for (const [name, page] of Object.entries(tabPages)) {
      page.classList.toggle('active', name === tabName);
    }
  });
}
