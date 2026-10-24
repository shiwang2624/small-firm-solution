'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // firms
  firmsList: () => ipcRenderer.invoke('firms:list'),
  firmCreate: (name) => ipcRenderer.invoke('firms:create', name),
  firmSwitch: (id) => ipcRenderer.invoke('firms:switch', id),
  firmRename: (payload) => ipcRenderer.invoke('firms:rename', payload),
  firmDelete: (id) => ipcRenderer.invoke('firms:delete', id),
  // data
  load: () => ipcRenderer.invoke('data:load'),
  save: (data) => ipcRenderer.invoke('data:save', data),
  dataPath: () => ipcRenderer.invoke('data:path'),
  // documents
  exportPdf: (payload) => ipcRenderer.invoke('doc:pdf', payload),
  // files
  saveText: (payload) => ipcRenderer.invoke('file:saveText', payload),
  // backup
  backupExport: () => ipcRenderer.invoke('backup:export'),
  backupImport: () => ipcRenderer.invoke('backup:import'),
  // camera (barcode / QR scanning)
  askCamera: () => ipcRenderer.invoke('media:askCamera')
});
