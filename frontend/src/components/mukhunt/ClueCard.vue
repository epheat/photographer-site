<template>
  <div class="clue-card" @click="this.$emit('press')">
    <div class="points-chip">
      <span class="value">{{ clue.points }}</span>
      <span class="unit">pts</span>
    </div>
    <div class="clue-body">
      <div class="clue-title">{{ clue.title }}</div>
      <p class="clue-description">{{ clue.description }}</p>
      <span class="selfie-tag" v-if="clue.selfie">&#9737; Selfie</span>
    </div>
  </div>
</template>

<script>
export default {
  name: "ClueCard",
  props: {
    clue: Object,
  },
}
</script>

<style lang="scss" scoped>
@import "../../scss/mukhunt.scss";

.clue-card {
  @include mh-panel;
  @include mh-pressable;
  @include mh-tappable;

  display: flex;
  align-items: stretch;
  gap: 12px;
  padding: 12px;
  margin-bottom: 12px;

  .points-chip {
    flex-shrink: 0;
    width: 46px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background-color: $mh-ink;
    color: $mh-accent;
    border-radius: $mh-radius - 2px;
    padding: 6px 0;

    .value {
      font-family: $mh-mono;
      font-size: 1.25rem;
      font-weight: 700;
      line-height: 1;
    }
    .unit {
      @include mh-label;
      color: $mh-accent;
      font-size: 0.6rem;
      margin-top: 2px;
    }
  }

  .clue-body {
    min-width: 0;

    .clue-title {
      font-weight: 700;
      font-size: 1.05rem;
      line-height: 1.25;
      color: $mh-ink;
    }
    .clue-description {
      margin: 4px 0 0;
      font-size: 0.95rem;
      line-height: 1.4;
      color: $mh-muted;
    }
    .selfie-tag {
      @include mh-label;
      display: inline-block;
      margin-top: 8px;
      padding: 3px 8px;
      border-radius: 20px;
      background-color: $mh-accent;
      color: $mh-ink;
      font-size: 0.65rem;
    }
  }

  @media screen and (min-width: $mh-wide) {
    padding: 14px;
    gap: 14px;

    .points-chip {
      width: 56px;
    }
  }
}
</style>
