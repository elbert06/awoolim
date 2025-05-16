import {
  app,
  BrowserWindow,
  ipcMain,
  IpcMainEvent,
  systemPreferences,
  screen,
  dialog,
  Menu,
  Tray
} from 'electron'
import 'dotenv/config'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { GoogleGenAI, Type } from '@google/genai'
import '@tensorflow/tfjs-backend-cpu'
import * as tf from '@tensorflow/tfjs-core'
import { loadTFLiteModel } from 'tfjs-tflite-node'
import Store from 'electron-store'
import consola from 'consola'
import sharp from 'sharp'
import icon from '../../resources/icon.png?asset'

const geminiKey = process.env.GEMINI_API_KEY

let mainWindow: BrowserWindow | null = null
let setupWindow: BrowserWindow | null = null
let charaWindow: BrowserWindow | null = null
let tray: Tray | null = null

const store = new Store()
let now = new Date().getTime()
let newDate = new Date().getTime()
let poseNow = new Date().getTime()
let isChecking = true
const isFixed = [0, 0, 0]
let userData: userData = {
  language: 'en',
  name: '',
  age: 0,
  gender: 'unspecified',
  conditions: [],
  otherConditionDetail: ''
}
const howBadPoseIs = [0, 0, 0, 0, 0, 0, 0, 0, 0]

async function createMainWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 500,
    height: 300,
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
    mainWindow?.show()
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/main/index.html`)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/main/index.html'))
  }

  createCharaWindow()

  checkSetup()

  ipcMain.on('webcam-error', async () => {
    dialog.showErrorBox(
      'Initializing webcam failed',
      'Webcam is not available.\nPlease check your webcam or permission settings.\n\nApplication will be terminated.'
    )
    consola.error('Initializing webcam failed, terminating application')
    app.quit()
  })

  consola.start('Getting data from Gemini...\nProgram will be started after getting data')
  const timeDid = await getDataAndCommunicateWithGemini()
  consola.info('Time to work per resting 10 minutes:', timeDid)
  consola.success('Program is successfully started!')

  ipcMain.on('webcam-frame', async (_event, base64: string) => {
    const imageBuffer = Buffer.from(base64.split(',')[1], 'base64')
    await checkTime(imageBuffer, timeDid)
    await readImages(imageBuffer)
  })
}

function createCharaWindow(): void {
  const primaryDisplay = screen.getPrimaryDisplay()
  const { width, height } = primaryDisplay.workAreaSize
  const windowWidth = width / 2
  const windowHeight = 500
  charaWindow = new BrowserWindow({
    transparent: true,
    frame: false,
    resizable: false,
    focusable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    width: windowWidth,
    height: windowHeight,
    x: width - windowWidth,
    y: height - windowHeight,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false
    }
  })

  charaWindow.setIgnoreMouseEvents(true)

  charaWindow.on('ready-to-show', () => {
    charaWindow?.show()
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    charaWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/chara/index.html`)
  } else {
    charaWindow.loadFile(join(__dirname, '../renderer/chara/index.html'))
  }
}

function createSetupWindow(): void {
  setupWindow = new BrowserWindow({
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
    setupWindow?.show()
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

  electronApp.setAppUserModelId('com.awoolim.app')

  tray = new Tray(icon)
  const contextMenu = Menu.buildFromTemplate([{ label: 'Exit', role: 'quit' }])
  tray.setToolTip('Awoolim')
  tray.setContextMenu(contextMenu)

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  if (store.get('userData') == undefined) {
    consola.warn('User data not found, creating setup window')
    createSetupWindow()
  } else {
    consola.success('User data found, loading user data')
    userData = (await store.get('userData')) as userData
    consola.debug('User data loaded:', userData)
    createMainWindow()
  }
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
    const model = await loadTFLiteModel(join(__dirname, '../../resources/models/1.tflite'))
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
    consola.success('tflite model loaded')
  } else {
    consola.error('Failed to load tflite model')
  }
}

function fyi(): string {
  return `\
          FYI: this person is ${userData.age} years old,\
          gender is ${userData.gender},\
          ${userData.conditions.length > 0 ? `this person has these diseases : ${userData.conditions.join(', ')},` : ''}\
          ${userData.otherConditionDetail != '' ? `and this person's other conditions are theses : ${userData.otherConditionDetail}` : ''}\
          to make sure this person can understand the message, please use the language code ${userData.language}\
          `
}

async function getDataAndCommunicateWithGemini(): Promise<number> {
  const sendScript =
    '\
  this person working on the desk. this person have to rest regularly.\
  Tell me how much time we have to work per resting 10 minutes' + fyi()
  const sendGemini = await getSendGemini(sendScript, 0)
  if (sendGemini == undefined) {
    consola.error('Gemini response is undefined')
    return 0
  }
  const result = JSON.parse(sendGemini)

  return parseInt(result['result'])
}

async function getAdvicewithGemini(AdviceScript: string): Promise<string> {
  const sendScript = AdviceScript
  const sendGemini = await getSendGemini(sendScript, 1)
  if (sendGemini == undefined) {
    consola.error('Gemini response is undefined')
    return 'wrong response'
  }
  consola.info('Gemini response:', sendGemini)

  return sendGemini
}

async function getSendGemini(geminiThing: string, option: number): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: geminiKey })
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
    model: 'gemini-2.5-flash-preview-04-17',
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

  const input = tf.tensor(new Uint8Array(resizedImageBuffer), [1, 353, 257, 3])
  const model = await loadTFLiteModel(join(__dirname, '../../resources/models/1.tflite'))

  // @ts-ignore "This error is caused by the version difference of tfjs and tfjs-tflite-node"
  const output = model.predict(input)
  // @ts-ignore "This error is caused by the version difference of tfjs and tfjs-tflite-node"
  const heatmapTensor = output.float_heatmaps
  // console.log(heatmapTensor.shape)
  // console.log(heatmapTensor instanceof tf.Tensor); // true여야 함

  const transposed = tf.transpose(heatmapTensor, [0, 2, 3, 1])
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
  const newUpdateTime = new Date().getTime()
  if (newUpdateTime - poseNow > 60 * 1000) {
    const reference = 40 // 판단기준 (1초에 40회)

    if (howBadPoseIs[3] > reference && howBadPoseIs[4] > reference && howBadPoseIs[8] > reference) {
      // 거북목
      isFixed[0] += 1
      if (isFixed[0] > 3) {
        const advice = await getAdvicewithGemini(
          'The user has been warned that their posture\
            could lead to misalignment, yet they continue to maintain it.\
            Please firmly tell them that maintaining a forward head posture (turtle neck) can lead to serious negative consequences,\
            and they must correct it immediately.' + fyi()
        )

        charaWindow?.webContents.send('show-animation', {
          id: 5,
          message: advice
        })
      } else {
        const advice = await getAdvicewithGemini(
          'The user is currently maintaining a posture that can lead to poor alignment.\
             Please let them know that this could result in bad posture over time, and they should correct it' +
            fyi()
        )

        charaWindow?.webContents.send('show-animation', {
          id: 1,
          message: advice
        })
      }
    } else {
      if (isFixed[0] != 0) {
        const advice = await getAdvicewithGemini(
          'Can you give a polite compliment to the person who corrected their posture,\
            and also mention why turtle neck is bad?' + fyi()
        )

        charaWindow?.webContents.send('show-animation', {
          id: 6,
          message: advice
        })
      }
      isFixed[0] = 0
    }

    if (howBadPoseIs[0] > reference && howBadPoseIs[2] > reference && howBadPoseIs[7] > reference) {
      // 자세 무너짐
      isFixed[1] += 1
      if (isFixed[1] > 3) {
        const advice = await getAdvicewithGemini(
          'The user has been warned that their posture\
            could lead to misalignment, yet they continue to maintain it.\
            Please firmly tell them that maintaining a forward head posture (text neck) can lead to serious negative consequences,\
            and they must correct it immediately.' + fyi()
        )

        charaWindow?.webContents.send('show-animation', {
          id: 5,
          message: advice
        })
      } else {
        const advice = await getAdvicewithGemini(
          'The user is currently maintaining a posture that can lead to posture breakdown.\
             Please let them know that this could result in bad posture over time, and they should correct it' +
            fyi()
        )

        charaWindow?.webContents.send('show-animation', {
          id: 2,
          message: advice
        })
      }
    } else {
      if (isFixed[1] != 0) {
        const advice = await getAdvicewithGemini(
          'Can you give a polite compliment to the person who corrected their posture,\
            and also mention why posture breakdown is bad?' + fyi()
        )

        charaWindow?.webContents.send('show-animation', {
          id: 6,
          message: advice
        })
      }
      isFixed[1] = 0
    }

    if (howBadPoseIs[2] > reference && howBadPoseIs[4] > reference) {
      // 고개 숙임 & 집중 잃음
      isFixed[2] += 1
      if (isFixed[2] > 3) {
        const advice = await getAdvicewithGemini(
          'The user has been warned that their posture\
            could lead to misalignment, yet they continue to maintain it.\
            Please firmly tell them that maintaining a forward head posture (text neck) can lead to serious negative consequences,\
            and they must correct it immediately.' + fyi()
        )

        charaWindow?.webContents.send('show-animation', {
          id: 5,
          message: advice
        })
      } else {
        const advice = await getAdvicewithGemini(
          'The user is currently maintaining a posture that can lead to losing focus and head tilt.\
             Please let them know that this could result in bad posture over time, and they should correct it' +
            fyi()
        )

        charaWindow?.webContents.send('show-animation', {
          id: 3,
          message: advice
        })
      }
    } else {
      if (isFixed[2] != 0) {
        const advice = await getAdvicewithGemini(
          'Can you give a polite compliment to the person who corrected their posture,\
            and also mention why posture losing focus and head tilt is bad?' + fyi()
        )

        charaWindow?.webContents.send('show-animation', {
          id: 6,
          message: advice
        })
      }
      isFixed[2] = 0
    }

    poseNow = newUpdateTime
    for (let i = 0; i < 9; i++) {
      howBadPoseIs[i] = 0
    }
  } else {
    for (let i = 0; i < 9; i++) {
      if (result[i] == 1) {
        howBadPoseIs[i] += 1
      }
    }
  }
}

async function checkIsPerson(imageBuffer: Buffer): Promise<boolean> {
  const model = await loadTFLiteModel(join(__dirname, '../../resources/models/2.tflite'))
  const resizedImageBuffer = await sharp(imageBuffer)
    .resize(300, 300)
    .removeAlpha()
    .raw()
    .toBuffer()

  const input = tf.tensor(new Uint8Array(resizedImageBuffer), [1, 300, 300, 3], 'int32')
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

// 시간 체크 함수
async function checkTime(imageBuffer: Buffer, timeCanDo: number): Promise<void> {
  const isPerson = await checkIsPerson(imageBuffer)
  if (isPerson) {
    newDate = new Date().getTime()
    const timeDid = newDate - now
    if (isChecking == false && timeDid / 1000 > 600) {
      isChecking = true
      now = newDate
    } else if (timeDid / 1000 >= 60 * timeCanDo) {
      const advice = await getAdvicewithGemini(
        'Can you suggest the user take a 10-minute break for their health?' + fyi()
      )

      charaWindow?.webContents.send('show-animation', {
        id: 4,
        message: advice
      })
      isChecking = false
    }
  } else {
    now = new Date().getTime()
    consola.log('no person, so reset')
  }
}
