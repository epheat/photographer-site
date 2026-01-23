<template>
  <div class="ps-recipe-page page">
    <template v-if="loading">
      <h1>Loading...</h1>
      <spinner></spinner>
    </template>
    <template v-else-if="recipe">
      <div class="actions">
        <router-link to="/recipes">Back to recipes</router-link>
        <router-link v-if="isAdmin" :to="`/recipes/${recipe.postId}/edit`">Edit</router-link>
      </div>
      <div class="recipe-header">
        <img v-if="recipe.pictureUrl" :src="recipe.pictureUrl" :alt="recipe.title" class="hero-image" />
        <h1>{{ recipe.title }}</h1>
        <h2><span class="by">by</span> {{ recipe.author }}</h2>
        <h3>{{ localeDateString }}</h3>
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
        <recipe-ingredients :ingredients="recipe.ingredients" />
        <recipe-instructions :instructions="recipe.instructions" />
      </div>
    </template>
    <div class="controls">
      <Button info v-if="recipe?.previous" @press="goToRecipe(recipe.previous.postId)">Previous</Button>
      <div v-else></div>
      <Button info v-if="recipe?.next" @press="goToRecipe(recipe.next.postId)">Next</Button>
      <div v-else></div>
    </div>
    <Footer></Footer>
  </div>
</template>

<script>
import Footer from '@/components/Footer.vue';
import Spinner from '@/components/Spinner.vue';
import Button from '@/components/Button.vue';
import RecipeMetadata from '@/components/recipes/RecipeMetadata.vue';
import RecipeIngredients from '@/components/recipes/RecipeIngredients.vue';
import RecipeInstructions from '@/components/recipes/RecipeInstructions.vue';
import { API } from 'aws-amplify';
import { authStore } from "@/auth/store";

export default {
  name: 'RecipePage',
  data() {
    return {
      loading: true,
      recipe: null,
      isAdmin: authStore.state.isAdmin,
    }
  },
  mounted() {
    this.loadRecipe(this.$route.params.postId);
  },
  methods: {
    goToRecipe(postId) {
      this.$router.push(`/recipes/${postId}`);
      this.loadRecipe(postId);
    },
    async loadRecipe(postId) {
      this.loading = true;
      try {
        const response = await API.get('ps-api', `/posts/${postId}`);
        this.recipe = response.post;
        this.loading = false;
      } catch (err) {
        this.loading = false;
        console.log(err);
      }
    }
  },
  computed: {
    localeDateString() {
      if (!this.recipe?.createdDate) return '';
      return new Date(this.recipe.createdDate).toLocaleDateString();
    }
  },
  components: {
    Footer,
    Spinner,
    Button,
    RecipeMetadata,
    RecipeIngredients,
    RecipeInstructions,
  }
}
</script>

<style lang="scss" scoped>
@import "../../scss/colors.scss";

.ps-recipe-page {
  .actions {
    display: flex;
    gap: 20px;
    margin-bottom: 20px;

    a {
      color: $ps-jeans;
    }
  }

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
    grid-template-columns: 1fr 2fr;
    gap: 30px;
    margin-bottom: 30px;

    @media screen and (max-width: 768px) {
      grid-template-columns: 1fr;
    }
  }

  .controls {
    display: flex;
    gap: 20px;
    justify-content: space-between;
  }
}
</style>
