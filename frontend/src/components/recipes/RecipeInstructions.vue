<template>
  <div class="ps-recipe-instructions">
    <h3>Instructions</h3>
    <div class="content" v-html="renderedInstructions"></div>
  </div>
</template>

<script>
import { marked } from 'marked';

export default {
  name: 'RecipeInstructions',
  props: {
    instructions: {
      type: String,
      required: true,
    }
  },
  computed: {
    renderedInstructions() {
      return marked(this.instructions);
    }
  }
}
</script>

<style lang="scss" scoped>
@import "../../scss/colors.scss";

.ps-recipe-instructions {
  h3 {
    margin-bottom: 15px;
    border-bottom: 2px solid $ps-jeans;
    padding-bottom: 5px;
  }

  .content {
    line-height: 1.6;

    ::v-deep(ol), ::v-deep(ul) {
      padding-left: 20px;
    }

    ::v-deep(li) {
      margin-bottom: 0;
    }

    ::v-deep(p) {
      margin-bottom: 15px;
    }

    ::v-deep(img) {
      max-width: 100%;
      border-radius: 8px;
      margin: 15px 0;
    }
  }
}
</style>
