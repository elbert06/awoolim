<script lang="ts">
  import { onMount } from 'svelte'
  import { DotLottie } from '@lottiefiles/dotlottie-web'
  import turtleNeckAnim from './assets/1.lottie'
  import postureWarnAnim from './assets/2.lottie'
  // import tooCloseAnim from './assets/3.lottie'
  // import timeAlertAnim from './assets/4.lottie'

  const animations = {
    1: turtleNeckAnim,
    2: postureWarnAnim
    // 3: tooCloseAnim,
    // 4: timeAlertAnim
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

<canvas bind:this={lottieCanvas} width="500" height="500"></canvas>

<style>
  canvas {
    width: 500px;
    height: 500px;
    position: absolute;
    top: 0;
    left: 0;
    z-index: 1;
  }
</style>
