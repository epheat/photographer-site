<template>
  <div class="ps-recipe-metadata" :class="{ compact }">
    <div class="meta-item" v-if="prepTime">
      <span class="label">Prep:</span>
      <span class="value">{{ formatTime(prepTime) }}</span>
    </div>
    <div class="meta-item" v-if="cookTime">
      <span class="label">Cook:</span>
      <span class="value">{{ formatTime(cookTime) }}</span>
    </div>
    <div class="meta-item" v-if="totalTime">
      <span class="label">Total:</span>
      <span class="value">{{ formatTime(totalTime) }}</span>
    </div>
    <div class="meta-item" v-if="servings">
      <span class="label">Servings:</span>
      <span class="value">{{ servings }}</span>
    </div>
  </div>
</template>

<script>
export default {
  name: 'RecipeMetadata',
  props: {
    prepTime: Number,
    cookTime: Number,
    servings: Number,
    compact: Boolean,
  },
  computed: {
    totalTime() {
      if (this.prepTime && this.cookTime) {
        return this.prepTime + this.cookTime;
      }
      return null;
    }
  },
  methods: {
    formatTime(minutes) {
      if (minutes < 60) {
        return `${minutes} min`;
      }
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;
      if (mins === 0) {
        return `${hours} hr`;
      }
      return `${hours} hr ${mins} min`;
    }
  }
}
</script>

<style lang="scss" scoped>
@import "../../scss/colors.scss";

.ps-recipe-metadata {
  display: flex;
  flex-wrap: wrap;
  gap: 15px;
  padding: 10px 0;

  .meta-item {
    .label {
      color: $ps-light-grey;
      margin-right: 5px;
    }

    .value {
      font-weight: 600;
    }
  }

  &.compact {
    gap: 10px;
    padding: 5px 0;
    font-size: 0.85em;
  }
}
</style>
