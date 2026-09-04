<template>
  <div class="battletd-wave-info">
    <div class="row">
      <span class="wave-number">{{ waveState.waveNumber }}</span>
      <div class="bar">
        <div class="background"></div>
        <div class="timeline"></div>
        <div class="wave-indicator next" :style="indicatorStyle"></div>
        <div class="waveinfo current"></div>
        <div class="waveinfo next"></div>
        <div class="waveinfo future"></div>
      </div>
    </div>
    <div class="row">
      <p class="description">{{ phaseDescription }}</p>
    </div>
  </div>
</template>
<script lang="ts">
import { WavePhase, WaveState } from '@/phaser/battletd/model/GameState';
import { defineComponent, PropType, StyleValue } from 'vue';

export default defineComponent({
  props: {
    waveState: {
      type: Object as PropType<WaveState>,
      required: true,
    }
  },
  data() {
    return {
      foo: "initial value"
    }
  },
  computed: {
    indicatorStyle(): StyleValue {
      return {
        left: `${(1 - this.waveState.phaseTimeRemainingMillis / this.waveState.phaseTime) * 100}%`,
      }
    },
    phaseDescription(): string | undefined {
      if (this.waveState.phase == WavePhase.BuyPhase) {
        return "Buy new towers from the shop!";
      } else if (this.waveState.phase == WavePhase.BattlePhase) {
        return "Destroy all enemies!";
      } else if (this.waveState.phase == WavePhase.PreBattlePhase) {
        return "Preparing for battle...";
      }
      return undefined;
    }
  }
})
</script>

<style lang="scss" scoped>
.battletd-wave-info {
  
  .row {
    display: flex;
  }

  .wave-number {
    height: 20px;
    width: 20px;
    text-align: center;
    background-color: rgba(240, 240, 240, 0.8);
    padding: 1px;
    box-sizing: border-box;
    border-radius: 2px;
  }
  .bar {
    height: 20px;
    width: 80%;
    margin: 0 auto;
    position: relative;
    border: solid black;
    border-width: 0 2px;

    .background {
      position: absolute;
      height: 12px;
      width: 100%;
      margin: 4px 0;
      background-color: rgba(240, 240, 240, 0.8);
    }

    .timeline {
      position: absolute;
      height: 10px;
      width: 100%;

      border-bottom: 2px solid black;

    }

    .wave-indicator {
      height: 100%;
      width: 0;
      position: absolute;
      border-right: 2px solid black;

      &.current {
        left: 0%;
      }
      &.next {
        left: 50%;
      }
      &.future {
        left: 100%;
      }
    }
  }
  .description {
    margin-top: 5px;
    text-align: center;
    margin: 0 auto;
    color: white;
    font-weight: bold;
    transform: scale(1);
    animation: pulse 4s infinite;
  }
}

@keyframes pulse {
	0% {
		transform: scale(0.95);
	}

	50% {
		transform: scale(1);
	}

	100% {
		transform: scale(0.95);
	}
}

</style>