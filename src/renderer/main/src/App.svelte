<script lang="ts">
  import { onMount } from 'svelte'

  let videoElement

  let stream = null

  // 웹캠 시작
  const startCamera = async (): Promise<void> => {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: true })
      videoElement.srcObject = stream
      await videoElement.play()
    } catch (err) {
      console.error('웹캠 접근 실패:', err)
    }
  }

  // 프레임 캡처
  const captureFrame = (): string => {
    const canvas = document.createElement('canvas')
    canvas.width = videoElement.videoWidth
    canvas.height = videoElement.videoHeight
    const ctx = canvas.getContext('2d')
    ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/png')
  }

  // 주기적 전송
  const startCaptureLoop = (): void => {
    const base64 = captureFrame()
    window.electron.ipcRenderer.send('webcam-frame', base64)
    setTimeout(startCaptureLoop, 1000)
  }

  // mount 시 실행
  onMount(() => {
    startCamera().then(() => {
      startCaptureLoop()
    })
  })
</script>

<video bind:this={videoElement} autoplay playsinline muted></video>

<style>
  video {
    width: 100%;
    max-width: 640px;
    border: 1px solid #ccc;
    border-radius: 8px;
    /* opacity: 0; */
  }
</style>
