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

  window.electron.ipcRenderer.on('show-animation', (_event, id) => {
    if (dotLottie) {
      dotLottie.destroy()
      dotLottie = null
      dotLottie = new DotLottie({
        src: animations[id],
        autoplay: false,
        loop: false,
        canvas: lottieCanvas,
        layout: {
          align: [1, 1]
        }
      })
      dotLottie.addEventListener('load', () => {
        dotLottie.play()
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
  <canvas bind:this={lottieCanvas} width="500" height="500"></canvas>
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
  }
</style>
