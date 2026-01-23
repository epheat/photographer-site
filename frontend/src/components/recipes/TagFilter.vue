<template>
  <div class="ps-tag-filter">
    <button
      :class="{ active: selectedTags.length === 0 }"
      @click="clearFilter"
    >
      All
    </button>
    <button
      v-for="tag in availableTags"
      :key="tag"
      :class="{ active: selectedTags.includes(tag) }"
      @click="toggleTag(tag)"
    >
      {{ tag }}
    </button>
  </div>
</template>

<script>
export default {
  name: 'TagFilter',
  props: {
    availableTags: {
      type: Array,
      required: true,
    },
    modelValue: {
      type: Array,
      default: () => []
    }
  },
  computed: {
    selectedTags() {
      return this.modelValue;
    }
  },
  methods: {
    toggleTag(tag) {
      const tags = [...this.selectedTags];
      const index = tags.indexOf(tag);
      if (index === -1) {
        tags.push(tag);
      } else {
        tags.splice(index, 1);
      }
      this.$emit('update:modelValue', tags);
    },
    clearFilter() {
      this.$emit('update:modelValue', []);
    }
  }
}
</script>

<style lang="scss" scoped>
@import "../../scss/colors.scss";

.ps-tag-filter {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 20px;

  button {
    padding: 6px 14px;
    border: 1px solid $ps-jeans;
    border-radius: 20px;
    background-color: transparent;
    color: $ps-jeans;
    cursor: pointer;
    transition: all 0.2s;

    &:hover {
      background-color: $ps-jeans;
      color: white;
    }

    &.active {
      background-color: $ps-jeans;
      color: white;
    }
  }
}
</style>
