<template>
  <div class="recipe-view">
    <div class="recipe-header">
      <img v-if="recipe.pictureUrl" :src="recipe.pictureUrl" :alt="recipe.title" class="hero-image" />
      <h1>{{ recipe.title || 'Untitled Recipe' }}</h1>
      <h2 v-if="recipe.author"><span class="by">by</span> {{ recipe.author }}</h2>
      <h3 v-if="recipe.createdDate">{{ formattedDate }}</h3>
      <div class="tags" v-if="recipe.recipeTags && recipe.recipeTags.length">
        <span class="tag" v-for="tag in recipe.recipeTags" :key="tag">{{ tag }}</span>
      </div>
      <p class="description" v-if="recipe.description">{{ recipe.description }}</p>
      <recipe-metadata
        :prepTime="recipe.prepTime"
        :cookTime="recipe.cookTime"
        :servings="recipe.servings"
      />
    </div>
    <div class="recipe-content">
      <recipe-ingredients v-if="recipe.ingredients && recipe.ingredients.length" :ingredients="recipe.ingredients" />
      <recipe-instructions v-if="recipe.instructions" :instructions="recipe.instructions" />
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, PropType } from 'vue';
import { Recipe } from '@/types/recipe';
import RecipeMetadata from '@/components/recipes/RecipeMetadata.vue';
import RecipeIngredients from '@/components/recipes/RecipeIngredients.vue';
import RecipeInstructions from '@/components/recipes/RecipeInstructions.vue';

export default defineComponent({
  name: 'RecipeView',
  props: {
    recipe: {
      type: Object as PropType<Recipe>,
      required: true,
    },
  },
  computed: {
    formattedDate(): string {
      if (!this.recipe.createdDate) return '';
      return new Date(this.recipe.createdDate).toLocaleDateString();
    }
  },
  components: {
    RecipeMetadata,
    RecipeIngredients,
    RecipeInstructions,
  }
})
</script>

<style lang="scss" scoped>
@import "../../scss/colors.scss";

.recipe-view {
  .recipe-header {
    text-align: center;
    margin-bottom: 30px;

    .hero-image {
      max-width: 100%;
      max-height: 400px;
      object-fit: cover;
      border-radius: 8px;
      margin-bottom: 20px;
    }

    h1 {
      margin-bottom: 10px;
    }

    h2 {
      .by {
        font-size: 0.8em;
        font-weight: normal;
      }
    }

    h3 {
      color: $ps-light-grey;
      font-weight: normal;
    }

    .tags {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 8px;
      margin: 15px 0;

      .tag {
        background-color: $ps-jeans;
        color: white;
        padding: 4px 12px;
        border-radius: 15px;
        font-size: 0.85em;
      }
    }

    .description {
      font-style: italic;
      color: $ps-text-default;
      max-width: 600px;
      margin: 15px auto;
    }
  }

  .recipe-content {
    display: grid;
    grid-template-columns: 2fr 3fr;
    gap: 30px;
    margin-bottom: 30px;

    @media screen and (max-width: 768px) {
      grid-template-columns: 1fr;
    }
  }
}
</style>