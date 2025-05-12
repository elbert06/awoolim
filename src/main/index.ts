import { app, shell, BrowserWindow, ipcMain, IpcMainEvent, systemPreferences } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { GoogleGenAI, Type } from '@google/genai'
import * as tf from '@tensorflow/tfjs'
import * as tflite from 'tfjs-tflite-node'
import Store from 'electron-store'
import consola from 'consola'
import sharp from 'sharp'
import icon from '../../resources/icon.png?asset'

const store = new Store()
let now = new Date().getTime()
let newDate = new Date().getTime()
let bendTime = new Date().getTime()
let newBendTime = new Date().getTime()
let collapseTime = new Date().getTime()
let newCollapseTime = new Date().getTime()
let focusTime = new Date().getTime()
let newFocusTime = new Date().getTime()
consola.log(now)

let userData: userData = {
  language: 'en',
  name: '',
  age: 0,
  gender: 'unspecified',
  conditions: [],
  otherConditionDetail: ''
}

async function createMainWindow(): Promise<void> {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    transparent: true,
    frame: false,
    resizable: false,
    focusable: false,
    skipTaskbar: true,
    hasShadow: false,
    show: false,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false
    }
  })

  mainWindow.setIgnoreMouseEvents(true)

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/main/index.html`)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/main/index.html'))
  }

  checkSetup()

  const timeDid = await getDataAndCommunicateWithGemini()
  consola.log('time_analyze : ', timeDid)

  ipcMain.on('webcam-frame', async (_event, base64: string) => {
    const imageBuffer = Buffer.from(base64.split(',')[1], 'base64')
    await checkTime(imageBuffer, timeDid)
    await readImages(imageBuffer)
  })
}

function createSetupWindow(): void {
  const setupWindow = new BrowserWindow({
    width: 900,
    height: 600,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false
    }
  })

  setupWindow.on('ready-to-show', () => {
    setupWindow.show()
  })

  setupWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    setupWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/setup/index.html`)
  } else {
    setupWindow.loadFile(join(__dirname, '../renderer/setup/index.html'))
  }

  ipcMain.on('get-permission-state', sendPermissionState)
  ipcMain.on('ask-permission', askPermission)
  ipcMain.on('setup-complete', setupComplete)
}

app.whenReady().then(async () => {
  consola.box('Awoolim is starting up...')
  consola.info('App version:', app.getVersion())
  consola.info('Node version:', process.versions.node)
  consola.info('Chromium version:', process.versions.chrome)
  consola.info('Electron version:', process.versions.electron)
  consola.info('OS version:', process.platform, process.getSystemVersion())
  consola.info('OS architecture:', process.arch)

  electronApp.setAppUserModelId('com.electron')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // if (store.get('userData') == undefined) {
  //   consola.warn('User data not found, creating setup window')
  createSetupWindow()
  // } else {
  //   consola.success('User data found, loading user data')
  //   userData = (await store.get('userData')) as userData
  //   consola.debug('User data loaded:', userData)
  //   createMainWindow()
  // }

  // tflite 모델 로드 여부
  // ipcMain.on('three', () => three())

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('window-all-closed', () => {
  consola.warn('All windows closed, quitting app')
  app.quit()
})

async function sendPermissionState(event: IpcMainEvent): Promise<void> {
  consola.info('Checking camera permission state')
  // darwin, windows only method
  const camera = await systemPreferences.getMediaAccessStatus('camera')
  consola.info('Checking camera permission state:', camera)
  event.sender.send('permission-state', camera)
}

async function askPermission(event: IpcMainEvent): Promise<void> {
  // darwin only method
  if (process.platform == 'darwin') {
    const camera = await systemPreferences.askForMediaAccess('camera')
    if (camera) {
      consola.success('Camera permission granted')
      event.sender.send('permission-state', 'granted')
    } else {
      consola.error('Camera permission denied')
      event.sender.send('permission-state', 'denied')
    }
  } else {
    // todo : ask for permission on other platforms
    consola.error('Camera permission is not supported on this platform')
  }
}

function setupComplete(_event: IpcMainEvent, data: userData): void {
  userData = data
  store.set('userData', userData)
  consola.success('User data saved')
  consola.info('User data from store:', store.get('userData'))
  ipcMain.off('get-permission-state', sendPermissionState)
  ipcMain.off('ask-permission', askPermission)
  ipcMain.off('setup-complete', setupComplete)

  const setupWindow = BrowserWindow.getAllWindows().find((window) => window.getTitle() === 'Setup')
  if (setupWindow) {
    setupWindow.close()
  }

  createMainWindow()
}

async function checkTflite(): Promise<boolean> {
  try {
    // 1. .tflite 모델 로드
    const model = await tflite.loadTFLiteModel(join(__dirname, '../../resources/model/1.tflite'))
    // 2. ?��?�� ?��?�� ?��?�� (?��: 224x224 RGB ?��미�??)
    const input = tf.zeros([1, 353, 257, 3])
    // 3. 추론
    // @ts-ignore "This error is caused by the version difference of tfjs and tfjs-tflite-node"
    model.predict(input)
    return true
  } catch (error) {
    consola.error('Error loading tflite model:', error)
    return false
  }
}

async function checkSetup(): Promise<void> {
  if (await checkTflite()) {
    consola.log('tflite model loaded')
  } else {
    consola.log('Failed to load tflite model')
    consola.error('Failed to load tflite model')
  }
}

async function getDataAndCommunicateWithGemini(): Promise<number> {
  const sendScript =
    '\
  this person is ' +
    userData.age +
    ' years old, gender is ' +
    userData.gender +
    '\
  this person has these diseases : ' +
    userData.conditions.join(', ') +
    '\
  this person is developer, and this person work. \
  Tell me how much time we have to work per resting 10 minutes'
  const sendGemini = await getSendGemini(sendScript, 0)
  if (sendGemini == undefined) {
    consola.error('Gemini response is undefined')
    return 0
  }
  const result = JSON.parse(sendGemini)

  return parseInt(result['result'])
}

async function getSendGemini(geminiThing: string, option: number): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: 'AIzaSyAzyrPJFxwRD_uvl6rdyjYW0-NjE4MDd-g' })
  let config = {}
  if (option == 0) {
    config = {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          result: {
            type: Type.NUMBER
          }
        }
      }
    }
  }
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-pro-exp-03-25',
    config: config,
    contents: geminiThing
  })
  return response.text || ''
}

async function readImages(imageBuffer: Buffer): Promise<void> {
  consola.success('Image buffer received, processing image...')

  const targetWidth = 257
  const targetHeight = 353
  const metadata = await sharp(imageBuffer).metadata()

  const centerX = Math.floor((metadata.width! - targetWidth) / 2)
  const centerY = Math.floor((metadata.height! - targetHeight) / 2)
  const resizedImageBuffer = await sharp(imageBuffer)
    .extract({ left: centerX, top: centerY, width: targetWidth, height: targetHeight })
    .removeAlpha()
    .raw()
    .toBuffer()

  // 2. Tensor�? �??�� (shape: [1, 353, 257, 3])
  const input = tf.tensor(new Uint8Array(resizedImageBuffer), [1, 353, 257, 3])

  // 1. .tflite 모델 로드
  const model = await tflite.loadTFLiteModel(join(__dirname, '../../resources/model/1.tflite'))

  // 3. 추론
  // @ts-ignore "This error is caused by the version difference of tfjs and tfjs-tflite-node"
  const output = model.predict(input)
  // @ts-ignore "This error is caused by the version difference of tfjs and tfjs-tflite-node"
  const heatmapTensor = output.float_heatmaps
  const transposed = heatmapTensor.transpose([0, 3, 1, 2])
  const heatmapArray = await transposed.array()

  const [, numKeypoints, h, w] = transposed.shape
  const inputHeight = 353
  const inputWidth = 257

  const scaleY = inputHeight / h
  const scaleX = inputWidth / w

  const keypoints: { x: number; y: number; confidence: number }[] = []

  for (let k = 0; k < numKeypoints; k++) {
    let maxVal = -Infinity
    let maxX = 0
    let maxY = 0

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const val = heatmapArray[0][k][y][x]
        if (val > maxVal) {
          maxVal = val
          maxX = x
          maxY = y
        }
      }
    }

    keypoints.push({
      x: maxX * scaleX,
      y: maxY * scaleY,
      confidence: maxVal
    })
  }

  const getAvg = (...values: number[]): number => {
    return values.reduce((a, b) => a + b) / values.length
  }

  // 좌표 할당
  const nose = keypoints[0]
  const leftEye = keypoints[1]
  const rightEye = keypoints[2]
  // const leftEar = keypoints[3]
  // const rightEar = keypoints[4]
  const leftShoulder = keypoints[5]
  const rightShoulder = keypoints[6]
  const leftElbow = keypoints[7]
  const rightElbow = keypoints[8]
  const leftWrist = keypoints[9]
  const rightWrist = keypoints[10]
  const leftHip = keypoints[11]
  const rightHip = keypoints[12]

  // 0: 목 기울어짐 (코가 어깨 중심선에서 벗어남)
  const shoulderCenterX = getAvg(leftShoulder.x, rightShoulder.x)
  const 목기울어짐 = Math.abs(nose.x - shoulderCenterX) > 30

  // 1: 어깨 비대칭 (좌우 어깨 높이 차이)
  const 어깨비대칭 = Math.abs(leftShoulder.y - rightShoulder.y) > 20

  // 2: 어깨 굽음 (어깨가 코보다 아래에 위치)
  const avgShoulderY = getAvg(leftShoulder.y, rightShoulder.y)
  const 어깨굽음 = avgShoulderY - nose.y > 30

  // 3: 상체 기울어짐 (좌우 엉덩이 x좌표 차이)
  const 상체기울어짐 = Math.abs(leftHip.x - rightHip.x) > 40

  // 4: 고개 숙임 (코가 어깨보다 지나치게 아래)
  const 고개숙임 = nose.y - avgShoulderY < 10

  // 5: 어깨 말림 (팔이 안쪽으로 접혀 있음 → 어깨-팔꿈치-손목 라인 좁아짐)
  const leftFolded = leftWrist.x > leftElbow.x && leftElbow.x > leftShoulder.x
  const rightFolded = rightWrist.x < rightElbow.x && rightElbow.x < rightShoulder.x
  const 어깨말림 = leftFolded && rightFolded

  // 6: 몸 비틀림 (어깨-엉덩이 간 좌우 x 거리 차이)
  const leftOffset = leftShoulder.x - leftHip.x
  const rightOffset = rightShoulder.x - rightHip.x
  const 몸비틀림 = Math.abs(leftOffset - rightOffset) > 40

  // 7: 좌우 기울어짐 (코가 치우쳐 있고 어깨 높이도 차이남)
  const 좌우기울어짐 = 목기울어짐 && 어깨비대칭

  // 8: 화면 거리 과도함 (코 + 눈 높이가 지나치게 높으면 얼굴이 너무 가까이 있음)
  const avgFaceY = getAvg(nose.y, leftEye.y, rightEye.y)
  const 화면가까움 = avgFaceY < 100

  // 결과 정리
  const result = {
    '0': 목기울어짐,
    '1': 어깨비대칭,
    '2': 어깨굽음,
    '3': 상체기울어짐,
    '4': 고개숙임,
    '5': 어깨말림,
    '6': 몸비틀림,
    '7': 좌우기울어짐,
    '8': 화면가까움
  }
  newBendTime = new Date().getTime()
  newCollapseTime = new Date().getTime()
  newFocusTime = new Date().getTime()
  if (
    result['3'] == true &&
    result['4'] == true &&
    result['8'] == true &&
    newBendTime - bendTime > 60000 * 2
  ) {
    //animation()
  } else if (result['3'] == false || result['4'] == false || result['8'] == false) {
    bendTime = new Date().getTime()
  }

  if (
    result['0'] == true &&
    result['2'] == true &&
    result['7'] == true &&
    newCollapseTime - collapseTime > 60000 * 2
  ) {
    //animation()
  } else if (result['0'] == false || result['2'] == false || result['7'] == false) {
    collapseTime = new Date().getTime()
  }

  if (result['2'] == true && result['4'] == true && newFocusTime - focusTime > 60000 * 2) {
    //animation()
  } else if (result['2'] == false || result['4'] == false) {
    focusTime = new Date().getTime()
  }

  // consola.log(getSendGemini('give one sentence advice with this json skeleton file. this array result means\
  //   const result = {\
  //   "0": "Neck Tilt"\
  //   "1": "Shoulder Asymmetry"\
  //   "2": "Rounded Shoulders"\
  //   "3": "Upper Body Tilt"\
  //   "4": "Head Drop"\
  //   "5": "Shoulder Roll"\
  //   "6": "Body Twist"\
  //   "7": "Lateral Tilt"\
  //   "8": "Too Close to Screen"\
  // }; '
  // +JSON.stringify(result),1));
}

async function checkIsPerson(imageBuffer: Buffer): Promise<boolean> {
  // 1. .tflite 모델 로드
  const model = await tflite.loadTFLiteModel(join(__dirname, '../../models/2.tflite'))
  // 2. ?��?�� ?��?�� ?��?�� (?��: 224x224 RGB ?��미�??)
  const resizedImageBuffer = await sharp(imageBuffer)
    .resize(300, 300)
    .removeAlpha()
    .raw()
    .toBuffer()

  const input = tf.tensor(new Uint8Array(resizedImageBuffer), [1, 300, 300, 3], 'int32')
  // 3. 추론
  // @ts-ignore "This error is caused by the version difference of tfjs and tfjs-tflite-node"
  const response = model.predict(input)
  const classIds = response['TFLite_Detection_PostProcess:1']
  const scores = response['TFLite_Detection_PostProcess:2']

  // tensor -> array로 변환
  const classIdArray = classIds.arraySync()[0] // [1, 10] → [10]
  const scoreArray = scores.arraySync()[0] // [1, 10] → [10]

  // 사람 존재 여부 판단 (classId === 0, score > 0.5)
  let hasPerson = false
  for (let i = 0; i < classIdArray.length; i++) {
    if (classIdArray[i] === 0 && scoreArray[i] > 0.5) {
      hasPerson = true
      break
    }
  }

  return hasPerson
}

async function checkTime(imageBuffer: Buffer, timeCanDo: number): Promise<void> {
  const isPerson = await checkIsPerson(imageBuffer)
  if (isPerson) {
    newDate = new Date().getTime()
    const timeDid = newDate - now
    if (timeDid / 1000 > 60 * timeCanDo) {
      consola.log('timeDid : ', timeDid)
    }
  } else {
    now = new Date().getTime()
    consola.log('no person, so reset')
  }
}
