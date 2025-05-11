<script lang="ts">
  import { waitLocale, _ } from 'svelte-i18n'
  import { DotLottie } from '@lottiefiles/dotlottie-web'
  import globeIcon from './assets/globe.svg'
  import loadingAnim from './assets/loading.lottie'
  import { onMount } from 'svelte'

  let dotLottie
  let conditions

  let title = []
  let description = []
  let screen = -1
  let loadingCanvas
  let splashContainer
  let contentContainer

  let userData = {
    language: 'en',
    name: '',
    age: 0,
    gender: 'unspecified',
    conditions: [],
    otherConditionDetail: ''
  }

  waitLocale().then(() => {
    title = [
      $_('setup.permission.title'),
      $_('setup.welcome.title'),
      $_('setup.username.title'),
      $_('setup.basics.title'),
      $_('setup.details.title'),
      $_('setup.complete.title')
    ]
    description = [
      $_('setup.permission.description'),
      $_('setup.welcome.description'),
      $_('setup.username.description'),
      $_('setup.basics.description'),
      $_('setup.details.description'),
      $_('setup.complete.description')
    ]
    conditions = [
      { value: 'neck_disc', label: $_('setup.details.neck_disc') },
      { value: 'forward_head', label: $_('setup.details.forward_head') },
      { value: 'back_pain', label: $_('setup.details.back_pain') },
      { value: 'shoulder_pain', label: $_('setup.details.shoulder_pain') },
      { value: 'other', label: $_('setup.details.other') }
    ]
    window.electron.ipcRenderer.send('get-permission-state')
  })

  const nextPage = (): void => {
    switch (screen) {
      case 2:
        if (userData.name === '') {
          alert($_('setup.username.empty'))
          return
        }
        break
      case 3:
        if (userData.age <= 0) {
          alert($_('setup.basics.age.empty'))
          return
        }
        break
    }
    contentContainer.classList.remove('noblur')
    setTimeout(() => {
      contentContainer.classList.add('noblur')
      screen += 1
    }, 300)
  }

  const grantPermission = (): void => {
    window.electron.ipcRenderer.send('ask-permission')
  }

  const setupComplete = (): void => {
    userData.language = $_('language_code')
    window.electron.ipcRenderer.send('setup-complete', userData)
  }

  window.electron.ipcRenderer.on('permission-state', (_event, state) => {
    if (state === 'granted') {
      loadingCanvas.style.opacity = 0
      setTimeout(() => {
        dotLottie.stop()
        splashContainer.style.opacity = 0
        setTimeout(() => {
          splashContainer.style.display = 'none'
          screen = 1
        }, 1000)
      }, 1000)
    } else {
      screen = 0
    }
  })

  onMount(() => {
    dotLottie = new DotLottie({
      autoplay: true,
      loop: true,
      canvas: loadingCanvas,
      src: loadingAnim,
      speed: 2
    })
  })
</script>

<div id="container">
  {#if screen >= 0}
    <div id="languageDisplay">
      <img src={globeIcon} alt="Language" />
      <span>{$_('language')}</span>
    </div>
    <div id="contentContainer" class="noblur" bind:this={contentContainer}>
      <div id="information">
        <h1>{title[screen]}</h1>
        <!-- eslint-disable-next-line svelte/no-at-html-tags -->
        <span>{@html description[screen]}</span>
      </div>
      <div id="action">
        {#if screen === 0}
          <button id="next" on:click={grantPermission}>
            {$_('default.allow')}
          </button>
        {:else if 1 <= screen && screen <= 4}
          {#if screen == 2}
            <input
              type="text"
              placeholder={$_('setup.username.placeholder')}
              bind:value={userData.name}
            />
          {:else if screen == 3}
            <label>
              {$_('setup.basics.age')}
              <input type="number" bind:value={userData.age} min="0" />
            </label>
            <label>
              {$_('setup.basics.gender')}
              <select bind:value={userData.gender}>
                <option value="male">{$_('setup.basics.gender_male')}</option>
                <option value="female">{$_('setup.basics.gender_female')}</option>
                <option value="unspecified" selected>{$_('setup.basics.gender_unspecified')}</option
                >
              </select>
            </label>
          {:else if screen == 4}
            {#each conditions as condition (condition.value)}
              <label class="narrow">
                <input type="checkbox" value={condition.value} bind:group={userData.conditions} />
                {condition.label}
              </label>
            {/each}

            {#if userData.conditions.includes('other')}
              <input type="text" bind:value={userData.otherConditionDetail} />
            {/if}
          {/if}
          <button id="next" on:click={nextPage}>
            {$_('default.next')}
          </button>
        {:else if screen === 5}
          <button id="next" on:click={setupComplete}>
            {$_('default.complete')}
          </button>
        {/if}
      </div>
    </div>
  {:else}
    <div id="splashContainer" bind:this={splashContainer}>
      <span id="logo">Awoolim</span>
      <span id="phraze">Your tiny desk buddy</span>
      <canvas bind:this={loadingCanvas} id="loadingAnim" width="90" height="10"></canvas>
    </div>
  {/if}
</div>

<style>
  @media (prefers-color-scheme: dark) {
    :root {
      --windows-background-from: #28292e;
      --windows-background-to: #212226;
      --text-color: 255, 255, 255;
      --background-color: 0, 0, 0;
      --color-filter: invert(0);
      --button-border-color: rgba(255, 255, 255, 0);
    }
  }

  @media (prefers-color-scheme: light) {
    :root {
      --windows-background-from: #e9ecf4;
      --windows-background-to: #c3c7d8;
      --text-color: 0, 0, 0;
      --background-color: 255, 255, 255;
      --color-filter: invert(1);
      --button-border-color: rgba(255, 255, 255, 0.2);
    }
  }

  #container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100vh;
    width: 100vw;
    background: linear-gradient(
      to bottom,
      var(--windows-background-from),
      var(--windows-background-to)
    );
    color: rgb(var(--text-color));
    text-align: center;
    font-size: 14px;
  }

  #splashContainer {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    opacity: 1;
    transition-duration: 0.5s;
  }

  #logo {
    font-family: 'Playwrite DE SAS';
    font-size: 48px;
    color: rgb(var(--text-color));
  }

  #phraze {
    font-size: 16px;
    color: rgba(var(--text-color), 0.5);
    margin-bottom: 3em;
  }

  #loadingAnim {
    transition-duration: 0.5s;
    width: 90px;
    filter: var(--color-filter);
  }

  @keyframes fadeIn {
    0% {
      opacity: 0;
      transform: scale(0.8) translateY(20px);
      filter: blur(8px);
    }
    100% {
      opacity: 1;
      transform: scale(1) translateY(0);
      filter: blur(0);
    }
  }

  #contentContainer {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    transition-duration: 0.3s;
    opacity: 0;
    transform: scale(0.8) translateY(20px);
    filter: blur(8px);
    animation: fadeIn 0.5s ease-out;
    transition-timing-function: ease-in;
  }

  #contentContainer.noblur {
    opacity: 1;
    transform: scale(1) translateY(0);
    filter: blur(0);
    transition-timing-function: ease-out;
  }

  #languageDisplay {
    display: flex;
    align-items: center;
    justify-content: space-between;
    position: fixed;
    top: 20px;
    right: 20px;
    font-size: 0.8em;
    color: rgba(var(--text-color), 0.5);
    border: 1px solid rgba(var(--text-color), 0.5);
    height: 34px;
    padding: 0 10px 0 7px;
    border-radius: 17px;
    transition: background-color 0.3s ease;
  }

  #languageDisplay:hover {
    background-color: rgba(var(--text-color), 0.05);
  }

  #languageDisplay img {
    width: 20px;
    height: 20px;
    margin-right: 5px;
    filter: var(--color-filter);
  }

  #information > h1 {
    font-size: 2.5em;
    margin: 0 0 10px 0;
    font-weight: 400;
  }

  #information > span {
    font-size: 1em;
    color: rgba(var(--text-color), 0.5);
  }

  #action {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    margin-top: 3em;
    margin-bottom: 1em;
  }

  #next {
    font-size: 1.1em;
    background-color: rgba(255, 255, 255, 0.05);
    padding: 12px 24px;
    border: 1px solid var(--button-border-color);
    border-radius: 100vh;
    color: rgb(var(--text-color));
    cursor: pointer;
    transition: background-color 0.3s ease;
    box-shadow: 0 0.5em 1em rgba(30, 30, 30, 0.1);
    margin-top: 3em;
  }

  #next:hover {
    background-color: rgba(255, 255, 255, 0.1);
  }

  input[type='text'],
  input[type='number'],
  select {
    font-size: 1em;
    background: none;
    padding: 12px 24px;
    box-sizing: content-box;
    border: 1px solid rgba(var(--text-color), 0.2);
    background-color: rgba(255, 255, 255, 0.05);
    border-radius: 100vh;
    color: rgb(var(--text-color));
    transition: 0.3s ease;
    box-shadow: 0 0.5em 1em rgba(30, 30, 30, 0.1);
    width: 10em;
  }

  input[type='text']:focus,
  input[type='number']:focus {
    background-color: rgba(255, 255, 255, 0.1);
    border-color: rgba(var(--text-color), 0.5);
  }

  input[type='text']:hover,
  input[type='number']:hover,
  select:hover {
    background-color: rgba(255, 255, 255, 0.1);
  }

  label {
    width: 20em;
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 1em;
    font-size: 1em;
    color: rgb(var(--text-color));
  }

  label.narrow {
    width: 15em;
  }

  input[type='checkbox'] {
    width: 1.5em;
    height: 1.5em;
    margin-right: 1em;
    appearance: none;
    background-color: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(var(--text-color), 0.2);
    border-radius: 100vh;
    transition-duration: 0.3s;
  }

  input[type='checkbox']:hover {
    background-color: rgba(255, 255, 255, 0.1);
    border-color: rgba(var(--text-color), 0.5);
  }

  input[type='checkbox']:checked {
    background-color: rgba(var(--text-color), 0.8);
    border-color: rgba(var(--text-color), 0.5);
    transition-duration: 0.3s;
  }

  input[type='checkbox']:checked:hover {
    background-color: rgba(var(--text-color), 0.5);
    border-color: rgba(var(--text-color), 0.2);
  }
</style>
