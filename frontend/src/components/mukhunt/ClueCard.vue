<template>
  <div class="clue-card" :class="{ done: !!submission }" @click="this.$emit('press')">
    <div class="points-chip" :class="{ discounted: effectivePoints !== clue.points }">
      <span class="value">{{ effectivePoints }}</span>
      <span class="unit">pts</span>
    </div>
    <div class="clue-body">
      <div class="clue-title">{{ clue.title }}</div>
      <p class="clue-description">{{ clue.description }}</p>
      <!-- every card carries exactly one tag, so the rows all come out the same height -->
      <span class="done-tag" v-if="submission">&#10003; Got it</span>
      <span class="selfie-tag" v-else-if="clue.selfie">&#9737; Selfie</span>
      <span class="photo-tag" v-else>&#9723; Photo</span>
    </div>
    <div class="thumb" v-if="submission">
      <img :src="submission.imageUrl" :alt="clue.title" />
    </div>
  </div>
</template>

<script>
export default {
  name: "ClueCard",
  props: {
    clue: Object,
    // the player's own submission for this clue, when they've already got it
    submission: Object,
    // { text, penalty } once the player has paid for this clue's hint
    revealedHint: Object,
  },
  computed: {
    // what this clue is actually worth to the player: the awarded value once submitted, or the
    // value net of a revealed hint's penalty before that
    effectivePoints() {
      if (this.submission) return this.submission.pointsAwarded;
      if (this.revealedHint) return Math.max(0, this.clue.points - (this.revealedHint.penalty ?? 0));
      return this.clue.points;
    },
  },
}
</script>

<style lang="scss" scoped>
@import "../../scss/mukhunt.scss";

.clue-card {
  @include mh-panel($bg: $wedding-cream, $offset: 2px, $border: $wedding-sage-dark);
  @include mh-pressable($offset: 2px);
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
    background-color: $mh-accent;
    color: $mh-on-accent;
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
      color: $mh-on-accent;
      font-size: 0.6rem;
      margin-top: 2px;
    }
  }

  .clue-body {
    // claims the free space so the thumbnail is pushed to the far edge rather than sitting
    // wherever the text happens to end
    flex: 1;
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
    }
    .selfie-tag, .done-tag, .photo-tag {
      @include mh-label;
      display: inline-block;
      margin-top: 8px;
      padding: 3px 8px;
      border-radius: 20px;
      font-size: 0.65rem;
    }
    .selfie-tag {
      background-color: $mh-lavender;
      color: white;
    }
    .done-tag {
      background-color: $ps-green;
      color: white;
    }
    // quieter than the selfie tag: it's the default, so a soft lavender tint rather than a solid fill
    .photo-tag {
      background-color: mix($mh-lavender, white, 20%);
      color: $mh-lavender;
    }
  }

  .thumb {
    flex-shrink: 0;
    width: 62px;
    height: 62px;
    border: 2px solid $mh-ink;
    border-radius: $mh-radius - 2px;
    overflow: hidden;
    background-color: $mh-ink;
    align-self: center;

    img {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
  }

  // a completed clue is marked done by its green border and chip
  &.done {
    border-color: $ps-green;
    box-shadow: 2px 2px 0 $ps-green;

    .points-chip {
      background-color: $ps-green;
      .value, .unit { color: white; }
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
