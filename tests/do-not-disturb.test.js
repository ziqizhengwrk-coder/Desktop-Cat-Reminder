const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
const at = (day, hour, minute = 0) => new Date(2026, 9, day, hour, minute).getTime();

function harness(savedState = null, initialTime = at(20, 9)) {
  let now = initialTime;
  let saved = savedState;
  let tick;
  const windows = [];
  const handlers = {};
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  class Window extends EventEmitter {
    constructor(options) {
      super();
      this.options = options;
      this.destroyed = false;
      this.shown = false;
      this.messages = [];
      this.webContents = new EventEmitter();
      this.webContents.send = (...args) => this.messages.push(args);
      windows.push(this);
    }
    loadFile() {}
    setAlwaysOnTop() {}
    setVisibleOnAllWorkspaces() {}
    isDestroyed() { return this.destroyed; }
    show() { this.shown = true; }
    focus() {}
    close() { this.destroyed = true; this.emit('closed'); }
  }
  const electron = {
    app: {
      requestSingleInstanceLock: () => false,
      quit() {},
      getPath: () => '/mock-user-data',
      getVersion: () => '0.1.5',
    },
    ipcMain: { handle: (name, fn) => { handlers[name] = fn; }, on() {} },
    BrowserWindow: Window,
    screen: { getPrimaryDisplay: () => ({ workAreaSize: { width: 1920, height: 1080 } }) },
  };
  const context = vm.createContext({
    require(name) {
      if (name === 'electron') return electron;
      if (name === 'fs') return {
        readFileSync() { if (!saved) throw Error('No state'); return JSON.stringify(saved); },
        mkdirSync() {},
        writeFileSync(_path, data) { saved = JSON.parse(data); },
      };
      return require(name);
    },
    __dirname: root,
    process: { argv: [], platform: 'win32' },
    Date: Clock,
    setInterval(fn) { tick = fn; return 1; },
    clearInterval() {},
  });
  const run = code => vm.runInContext(code, context);
  run(source);
  run('loadState(); startScheduler();');
  return {
    run, windows,
    get saved() { return saved; },
    get state() { return handlers['state:get'](); },
    toggle: value => handlers['dnd:set']({}, value),
    advance(time) { now = time; tick(); },
  };
}

test('entering DND cancels a pending reminder without counting it as ignored or done', () => {
  const h = harness();
  h.run("createPetWindow(); triggerReminder('stretch');");
  const overlay = h.windows[1];
  h.toggle(true);
  assert.equal(overlay.destroyed, true);
  assert.equal(h.run('activeReminderId'), null);
  assert.ok(h.windows[0].messages.some(([name]) => name === 'pet:calm'));
  overlay.emit('ready-to-show');
  assert.equal(overlay.shown, false);
  for (const fn of ['completeReminder', 'ignoreReminder', 'snoozeReminder']) {
    h.run(`${fn}('stretch')`);
  }
  assert.equal(h.state.reminders.stretch.done, 0);
  assert.equal(h.state.reminders.stretch.ignored, 0);
  assert.equal(h.state.reminders.stretch.snoozed, 0);
  assert.equal(h.state.reminders.stretch.nextAt, null);
  assert.equal(h.state.reminders.walk.nextAt, null);
});

test('DND stays paused across due times, midnight, and restart', () => {
  const h = harness();
  h.toggle(true);
  h.advance(at(21, 18));
  h.run("triggerReminder('walk')");
  assert.equal(h.windows.length, 0);
  assert.equal(h.state.reminders.stretch.nextAt, null);
  assert.equal(h.state.reminders.walk.nextAt, null);
  const restarted = harness(h.saved, at(22, 9));
  assert.equal(restarted.state.doNotDisturb, true);
  assert.equal(restarted.state.reminders.stretch.nextAt, null);
  assert.equal(restarted.state.reminders.walk.nextAt, null);
});

test('resume starts a full stretch interval and skips missed walks and snoozes', () => {
  const h = harness();
  h.run("state.reminders.stretch.nextAt = Date.now() + 60000; state.reminders.walk.nextAt = Date.now() + 60000;");
  h.toggle(true);
  h.advance(at(20, 15));
  h.toggle(false);
  assert.equal(h.state.reminders.stretch.nextAt, at(20, 15, 45));
  assert.equal(h.state.reminders.walk.nextAt, at(20, 17, 30));
  h.advance(at(20, 15, 44));
  assert.equal(h.windows.length, 0);
  h.advance(at(20, 15, 45));
  assert.equal(h.windows.length, 1);
  assert.equal(h.run('activeReminderId'), 'stretch');
});

test('resume retains lunch and walk-buffer exclusions', () => {
  const h = harness();
  h.toggle(true);
  h.advance(at(20, 12, 15));
  h.toggle(false);
  assert.equal(h.state.reminders.stretch.nextAt, at(20, 14, 15));
  h.toggle(true);
  h.advance(at(20, 16, 30));
  h.toggle(false);
  assert.equal(h.state.reminders.stretch.nextAt, at(20, 18) + 1000);
});

test('editing settings while paused does not resume; the new interval applies on resume', () => {
  const h = harness();
  h.toggle(true);
  h.run('updateSettings({ stretchIntervalMinutes: 20 });');
  assert.equal(h.state.doNotDisturb, true);
  assert.equal(h.state.settings.stretchIntervalMinutes, 20);
  assert.equal(h.state.reminders.stretch.nextAt, null);
  h.advance(at(20, 15));
  h.toggle(false);
  assert.equal(h.state.reminders.stretch.nextAt, at(20, 15, 20));
});

test('older states default to DND off and repeated requests do not reset a running timer', () => {
  const h = harness({ settings: {} });
  assert.equal(h.state.doNotDisturb, false);
  const nextAt = h.state.reminders.stretch.nextAt;
  h.advance(at(20, 9, 10));
  h.toggle(false);
  assert.equal(h.state.reminders.stretch.nextAt, nextAt);
  assert.throws(() => h.toggle('true'), /boolean/);
  assert.equal(h.state.doNotDisturb, false);
});
