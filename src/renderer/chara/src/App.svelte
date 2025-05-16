<script lang="ts">
  import { onMount } from 'svelte'
  import { DotLottie } from '@lottiefiles/dotlottie-web'
  import turtleNeckAnim from './assets/1.lottie'
  import postureWarnAnim from './assets/2.lottie'
  import unfocusedAnim from './assets/3.lottie'
  import timeAlertAnim from './assets/4.lottie'
  import failureAnim from './assets/5.lottie'
  import successAnim from './assets/6.lottie'

  const animations = {
    1: turtleNeckAnim,
    2: postureWarnAnim,
    3: unfocusedAnim,
    4: timeAlertAnim,
    5: failureAnim,
    6: successAnim
  }

  let dotLottie: DotLottie | null = null
  let lottieCanvas: HTMLCanvasElement | null = null
  let message = '이곳에 자연어 피드백 메시지가 표시됩니다.'
  let show = false

  window.electron.ipcRenderer.on('show-animation', (_event, data) => {
    if (dotLottie) {
      dotLottie.destroy()
      dotLottie = null
      dotLottie = new DotLottie({
        src: animations[data.id],
        autoplay: false,
        loop: false,
        canvas: lottieCanvas,
        layout: {
          align: [1, 1]
        }
      })
      dotLottie.addEventListener('load', () => {
        message = data.message
        show = true
        dotLottie.play()
      })
      dotLottie.addEventListener('complete', () => {
        setTimeout(() => {
          show = false
        }, 5000)
      })
    }
  })

  onMount(() => {
    dotLottie = new DotLottie({
      autoplay: false,
      loop: false,
      canvas: lottieCanvas
    })
  })
</script>

<div id="container">
  <div id="dialog" class={show ? 'show' : ''}>
    <!-- eslint-disable-next-line svelte/no-at-html-tags -->
    <span>{@html message}</span>
  </div>
  <canvas bind:this={lottieCanvas} class={show ? 'show' : ''} width="500" height="500"> </canvas>
</div>

<style>
  #container {
    width: 100vw;
    height: 100vh;
    display: flex;
    justify-content: flex-end;
    align-items: flex-end;
  }
  canvas {
    width: 500px;
    height: 500px;
    opacity: 0;
    transition-duration: 0.5s;
  }

  canvas.show {
    opacity: 1;
    transition-duration: 0s;
  }

  #dialog::after {
    content: '';
    border-left: 12px solid #f1f1f1;
    border-top: 8px solid transparent;
    border-bottom: 8px solid transparent;
    position: absolute;
    bottom: calc(100% / 2 - 8px);
    right: -12px;
  }

  #dialog {
    background: #fff;
    border-radius: 1em;
    margin-bottom: 2em;
    padding: 1em 1em;
    position: relative;
    display: flex;
    justify-content: center;
    align-items: flex-end;
    text-align: right;
    transition-duration: 0.5s;
    opacity: 0;
  }

  #dialog.show {
    opacity: 1;
  }
</style>
