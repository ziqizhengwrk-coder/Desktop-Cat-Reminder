const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('catReminder', {
  getState: () => ipcRenderer.invoke('state:get'),
  openStatus: () => ipcRenderer.send('pet:open-status'),
  dragPet: (deltaX, deltaY) => ipcRenderer.send('pet:drag-move', deltaX, deltaY),
  updateSettings: (settings) => ipcRenderer.send('settings:update', settings),
  done: (reminderId) => ipcRenderer.send('reminder:done', reminderId),
  snooze: (reminderId) => ipcRenderer.send('reminder:snooze', reminderId),
  ignore: (reminderId) => ipcRenderer.send('reminder:ignore', reminderId),
  resetPetPosition: () => ipcRenderer.send('status:reset-position'),
  onState: (callback) => {
    ipcRenderer.on('state:update', (_event, state) => callback(state));
  },
  onReminderData: (callback) => {
    ipcRenderer.on('reminder:data', (_event, data) => callback(data));
  },
  onPetAlert: (callback) => {
    ipcRenderer.on('pet:alert', (_event, data) => callback(data));
  },
  onPetCalm: (callback) => {
    ipcRenderer.on('pet:calm', () => callback());
  },
});
