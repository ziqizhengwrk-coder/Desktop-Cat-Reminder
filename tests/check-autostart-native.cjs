// Run explicitly with Electron on Windows. Only a unique temporary login item is modified.
const { app } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const entryName = `Desktop Cat Reminder Test ${process.pid}`;

app.whenReady().then(() => {
  let exitCode = 0;
  const handlers = {};
  const appShim = {
    isPackaged: true,
    getAppPath: () => root,
    requestSingleInstanceLock: () => false,
    quit() {},
    setLoginItemSettings(options) {
      app.setLoginItemSettings({ ...options, name: entryName });
    },
    getLoginItemSettings(options) {
      const login = app.getLoginItemSettings(options);
      return {
        ...login,
        launchItems: login.launchItems
          .filter(item => item.name === entryName)
          .map(item => ({ ...item, name: 'Desktop Cat Reminder' })),
      };
    },
  };
  try {
    assert.equal(process.platform, 'win32');
    const context = vm.createContext({
      __dirname: root,
      process: { argv: [], platform: process.platform, execPath: process.execPath },
      require(name) {
        return name === 'electron'
          ? { app: appShim, ipcMain: { handle: (key, fn) => { handlers[key] = fn; }, on() {} } }
          : require(name);
      },
    });
    vm.runInContext(fs.readFileSync(path.join(root, 'main.js'), 'utf8'), context);
    for (const packaged of [true, false]) {
      appShim.isPackaged = packaged;
      const result = handlers['startup:set']({}, true);
      if (!result.enabled) {
        console.error(JSON.stringify({
          electron: process.versions.electron, packaged, result,
          login: app.getLoginItemSettings({ path: `"${process.execPath}"` }).launchItems
            .filter(item => item.name === entryName),
          unquoted: app.getLoginItemSettings({ path: process.execPath }).launchItems
            .filter(item => item.name === entryName),
        }));
      }
      assert.equal(result.enabled, true);
      assert.equal(handlers['startup:get']().error, null);
      const entry = app.getLoginItemSettings({ path: `"${process.execPath}"` })
        .launchItems.find(item => item.name === entryName);
      assert.deepEqual(entry.args, packaged ? [] : [root]);
      const command = execFileSync('reg.exe', [
        'query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run', '/v', entryName,
      ], { encoding: 'utf8', windowsHide: true });
      assert.ok(command.includes('--autostart'));
      if (!packaged) assert.ok(command.includes(`"${root}"`));
      app.setLoginItemSettings({
        name: entryName, path: process.execPath, args: packaged ? ['--autostart'] : [root, '--autostart'],
        openAtLogin: true, enabled: false,
      });
      assert.equal(handlers['startup:get']().enabled, false);
      assert.equal(handlers['startup:set']({}, true).enabled, true);
      assert.equal(handlers['startup:set']({}, false).enabled, false);
    }
    console.log('PASS: native Windows login item enable, read, disable, re-enable and quoted paths');
  } catch (error) {
    console.error(error);
    exitCode = 1;
  } finally {
    app.setLoginItemSettings({ name: entryName, openAtLogin: false });
    const entries = app.getLoginItemSettings({ path: `"${process.execPath}"` }).launchItems;
    if (entries.some(item => item.name === entryName)) {
      console.error('Temporary login item cleanup failed:', entryName);
      exitCode = 1;
    }
    app.exit(exitCode);
  }
});
