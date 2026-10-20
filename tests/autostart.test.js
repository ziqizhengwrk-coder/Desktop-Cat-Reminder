const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'main.js'), 'utf8');

function harness(packaged = true) {
  const execPath = 'C:\\Program Files\\Desktop Cat Reminder\\Desktop Cat Reminder.exe';
  const projectPath = 'C:\\My Projects\\Desktop Cat Reminder';
  const entries = new Map();
  const handlers = {};
  let lastWrite;
  let failWrite = false;
  const app = {
    isPackaged: packaged,
    getAppPath: () => projectPath,
    requestSingleInstanceLock: () => false,
    quit() {},
    getLoginItemSettings(options) {
      // Match Electron's distinction between AppUserModelId and custom names.
      return {
        openAtLogin: false,
        executableWillLaunchAtLogin: entries.size > 0,
        launchItems: options.path === `"${execPath}"` ? [...entries.values()] : [],
      };
    },
    setLoginItemSettings(options) {
      if (failWrite) throw Error('Access denied');
      lastWrite = options;
      if (options.openAtLogin) {
        entries.set(options.name, {
          name: options.name, scope: 'user', path: options.path,
          args: options.args.filter(arg => !arg.startsWith('--')), enabled: options.enabled,
        });
      } else {
        entries.delete(options.name);
      }
    },
  };
  const context = vm.createContext({
    __dirname: root,
    process: { argv: [], platform: 'win32', execPath },
    require(name) {
      return name === 'electron'
        ? { app, ipcMain: { handle: (name, fn) => { handlers[name] = fn; }, on() {} } }
        : require(name);
    },
  });
  vm.runInContext(source, context);
  return {
    entries, projectPath,
    get: () => handlers['startup:get'](),
    set: value => handlers['startup:set']({}, value),
    get lastWrite() { return lastWrite; },
    fail() { failWrite = true; },
  };
}

test('custom-name startup entries work with paths containing spaces', () => {
  const h = harness();
  assert.equal(h.get().enabled, false);
  assert.equal(h.set(true).enabled, true);
  assert.equal(h.get().error, null);
  assert.equal(h.lastWrite.name, 'Desktop Cat Reminder');
  assert.equal(h.set(false).enabled, false);
  assert.equal(h.entries.size, 0);
});

test('development arguments are passed unquoted for Electron to escape once', () => {
  const h = harness(false);
  assert.equal(h.set(true).enabled, true);
  assert.equal(h.lastWrite.args[0], h.projectPath);
  assert.equal(h.lastWrite.args[1], '--autostart');
  assert.equal(h.set(false).enabled, false);
});

test('other names, arguments, scopes and disabled entries do not enable the switch', () => {
  const h = harness();
  h.set(true);
  const entry = h.entries.get('Desktop Cat Reminder');
  for (const change of [
    { name: 'Another application' },
    { args: ['different-project'] },
    { scope: 'machine' },
    { enabled: false },
  ]) {
    h.entries.set('Desktop Cat Reminder', { ...entry, ...change });
    assert.equal(h.get().enabled, false);
  }
  assert.equal(h.set(true).enabled, true);
});

test('write failures report an error and preserve the actual startup state', () => {
  const h = harness();
  h.set(true);
  h.fail();
  const result = h.set(false);
  assert.equal(result.enabled, true);
  assert.equal(result.error, 'startup.writeError');
});
