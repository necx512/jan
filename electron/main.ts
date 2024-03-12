import { app, BrowserWindow, Tray } from 'electron'

import { join } from 'path'
/**
 * Managers
 **/
import { windowManager } from './managers/window'
import { log } from '@janhq/core/node'

/**
 * IPC Handlers
 **/
import { injectHandler } from './handlers/common'
import { handleAppUpdates } from './handlers/update'
import { handleAppIPCs } from './handlers/native'

/**
 * Utils
 **/
import { setupMenu } from './utils/menu'
import { createUserSpace } from './utils/path'
import { migrateExtensions } from './utils/migration'
import { cleanUpAndQuit } from './utils/clean'
import { setupExtensions } from './utils/extension'
import { setupCore } from './utils/setup'
import { setupReactDevTool } from './utils/dev'
import { cleanLogs } from './utils/log'

import { registerShortcut } from './utils/selectedText'
import { trayManager } from './managers/tray'

const preloadPath = join(__dirname, 'preload.js')
const rendererPath = join(__dirname, '..', 'renderer')
const quickAskPath = join(rendererPath, 'search.html')
const mainPath = join(rendererPath, 'index.html')

const mainUrl = 'http://localhost:3000'
const quickAskUrl = `${mainUrl}/search`

const quickAskHotKey = 'CommandOrControl+J'

const gotTheLock = app.requestSingleInstanceLock()

app
  .whenReady()
  .then(setupReactDevTool)
  .then(setupCore)
  .then(createUserSpace)
  .then(migrateExtensions)
  .then(setupExtensions)
  .then(setupMenu)
  .then(handleIPCs)
  .then(handleAppUpdates)
  .then(() => process.env.CI !== 'e2e' && createQuickAskWindow())
  .then(createMainWindow)
  .then(() => {
    if (!app.isPackaged) {
      windowManager.mainWindow?.webContents.openDevTools()
    }
  })
  .then(() => process.env.CI !== 'e2e' && trayManager.createSystemTray())
  .then(() => {
    log(`Version: ${app.getVersion()}`)
  })
  .then(() => {
    if (!gotTheLock) {
      app.quit()
    } else {
      app.on('second-instance', (_event, _commandLine, _workingDirectory) => {
        // Someone tried to run a second instance, we should focus our window.
        windowManager.showMainWindow()
      })
    }
    app.on('activate', () => {
      if (!BrowserWindow.getAllWindows().length) {
        createMainWindow()
      }
    })
  })
  .then(() => cleanLogs())

app.on('ready', () => {
  registerGlobalShortcuts()
})

app.on('before-quit', function (evt) {
  trayManager.destroyCurrentTray()
})

app.once('quit', () => {
  cleanUpAndQuit()
})

function createQuickAskWindow() {
  const startUrl = app.isPackaged ? `file://${quickAskPath}` : quickAskUrl
  windowManager.createQuickAskWindow(preloadPath, startUrl)
}

function createMainWindow() {
  const startUrl = app.isPackaged ? `file://${mainPath}` : mainUrl
  windowManager.createMainWindow(preloadPath, startUrl)
}

function registerGlobalShortcuts() {
  const ret = registerShortcut(quickAskHotKey, (selectedText: string) => {
    if (!windowManager.isQuickAskWindowVisible()) {
      windowManager.showQuickAskWindow()
      windowManager.sendQuickAskSelectedText(selectedText)
    } else {
      windowManager.hideQuickAskWindow()
    }
  })

  if (!ret) {
    console.error('Global shortcut registration failed')
  } else {
    console.log('Global shortcut registered successfully')
  }
}

/**
 * Handles various IPC messages from the renderer process.
 */
function handleIPCs() {
  // Inject core handlers for IPCs
  injectHandler()

  // Handle native IPCs
  handleAppIPCs()
}

/*
 ** Suppress Node error messages
 */
process.on('uncaughtException', function (err) {
  log(`Error: ${err}`)
})
