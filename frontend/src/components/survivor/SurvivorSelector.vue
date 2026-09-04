<template>
  <div class="survivor-selector">
    <div class="options-container">
      <div class="survivor-option" v-for="survivor in cast" :key="survivor.id">
        <input
            :id="survivor.id"
            type="checkbox"
            :checked="hasId(survivor.id)"
            :disabled="shouldDisable(survivor.id)"
            @click="handleOption(survivor.id)"
            :class="{disable: shouldDisable(survivor.id)}"
        />
        <div class="name-div" :class="{disable: shouldDisable(survivor.id)}">
          <label class="name-label" :for="survivor.id">
            <CastHead :votedOut="survivor.votedOut" :id="survivor.id" :tribe="survivor.tribe" />
            <span class="vertical">
              <span class="name">{{ shortenName(survivor.name) }}</span>
              <span class="tribe">{{ survivor.tribe }}</span>
            </span>
          </label>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import CastHead from "@/components/survivor/CastHead";

export default {
  name: "SurvivorSelector",
  components: {CastHead},
  props: {
    cast: Array,
    maxSelect: Number,
    // ["SurvivorId", "SurvivorId"]
    modelValue: Array,
  },
  data() {
    return {
      // none
    }
  },
  methods: {
    handleOption(id) {
      const indexOfSurvivor = this.modelValue.indexOf(id);
      if (indexOfSurvivor === -1) {
        // that survivor id is not present in modelValue currently. If we're not at our limit, add it.
        if (!this.atLimit) {
          this.$emit('update:modelValue', [...this.modelValue, id ]);
        }
      } else {
        // survivor id is already present in options. Therefore, remove it.
        this.$emit('update:modelValue', [...this.modelValue].filter(s => s !== id));
      }
    },
    hasId(id) {
      return this.modelValue.includes(id);
    },
    shouldDisable(id) {
      return this.atLimit && !this.hasId(id);
    },
    shortenName(name) {
      const spaceIndex = name.indexOf(" ");
      return spaceIndex === -1 ? name : name.substring(0, spaceIndex);
    }
  },
  computed: {
    atLimit() {
      return this.maxSelect && this.modelValue.length >= this.maxSelect;
    }
  }
}
</script>

<style lang="scss" scoped>
@import "../../scss/sizes.scss";

.options-container {
  display: flex;
  flex-wrap: wrap;

  .survivor-option {
    display: flex;
    margin-bottom: 5px;
    flex-basis: 25%;
    @media screen and (max-width: $tablet) {
      flex-basis: 33%;
    }
    @media screen and (max-width: $phone) {
      flex-basis: 50%;
    }
    input.disable {
      cursor: not-allowed;
    }

    .name-label {
      display: flex;
      .vertical {
        display: flex;
        flex-direction: column;
        justify-content: space-around;
        .name {
          font-weight: bold;
        }
        .tribe {
          font-size: 0.8em;
        }
      }
    }
  }
  label {
    display: inline-block;
    vertical-align: middle;
    &.disable {
      cursor: not-allowed;
    }
  }
  .cast-head-container {
    width: 34px;
    margin-right: 5px;
  }
}
</style>