<template>
  <div class="ps-recipe-card">
    <router-link :to="`/recipes/${postId}`" class="image">
      <img v-if="pictureUrl" :src="pictureUrl" :alt="title" />
      <div v-else class="placeholder">
        <span>No Image</span>
      </div>
    </router-link>
    <div class="details">
      <h2><router-link :to="`/recipes/${postId}`">{{ title }}</router-link></h2>
      <div class="subtitle">by <b>{{ author }}</b> - <span>{{ localeDateString }}</span></div>
      <div class="tags" v-if="recipeTags && recipeTags.length">
        <span class="tag" v-for="tag in recipeTags" :key="tag">{{ tag }}</span>
      </div>
      <div class="description" v-if="description">{{ trimmedDescription }}</div>
      <recipe-metadata :prepTime="prepTime" :cookTime="cookTime" :servings="servings" compact />
    </div>
  </div>
</template>

<script>
import RecipeMetadata from './RecipeMetadata.vue';

export default {
  name: 'RecipeCard',
  props: {
    postId: String,
    title: String,
    author: String,
    description: String,
    pictureUrl: String,
    recipeTags: Array,
    prepTime: Number,
    cookTime: Number,
    servings: Number,
    createdDate: Number,
  },
  computed: {
    localeDateString() {
      return new Date(this.createdDate).toLocaleDateString();
    },
    trimmedDescription() {
      if (this.description && this.description.length > 100) {
        return this.description.substring(0, 100) + '...';
      }
      return this.description;
    }
  },
  components: {
    RecipeMetadata,
  }
}
</script>

<style lang="scss" scoped>
@import "../../scss/colors.scss";
@import "../../scss/sizes.scss";

.ps-recipe-card {
  display: flex;
  gap: 15px;
  margin-bottom: 20px;
  padding: 15px;
  background-color: $ps-white;
  border-radius: 8px;

  .image {
    flex: 0 0 120px;
    height: 120px;

    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      border-radius: 6px;
    }

    .placeholder {
      width: 100%;
      height: 100%;
      background-color: $ps-lighter-grey;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: $ps-light-grey;
      font-size: 0.9em;
    }

    @media screen and (max-width: $phone) {
      flex: 0 0 80px;
      height: 80px;
    }
  }

  .details {
    flex: 1;

    h2 {
      margin: 0 0 5px 0;
      font-size: 1.2em;

      a {
        text-decoration: none;
        color: inherit;
      }
    }

    .subtitle {
      margin: 5px 0;
      font-size: 0.9em;

      span {
        color: $ps-light-grey;
      }
    }

    .tags {
      display: flex;
      flex-wrap: wrap;
      gap: 5px;
      margin: 8px 0;

      .tag {
        background-color: $ps-jeans;
        color: white;
        padding: 2px 8px;
        border-radius: 12px;
        font-size: 0.75em;
      }
    }

    .description {
      color: $ps-text-default;
      font-size: 0.9em;
      margin: 8px 0;
    }
  }
}
</style>
