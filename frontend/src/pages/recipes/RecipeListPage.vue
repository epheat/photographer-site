<template>
  <div class="ps-recipe-list-page page">
    <h1>Recipes</h1>
    <div class="buttons">
      <Button @press="loadRecipes()">Refresh</Button>
      <Button v-if="isAdmin" submit @press="newRecipe()">New Recipe</Button>
    </div>
    <tag-filter
      v-if="availableTags.length > 0"
      :availableTags="availableTags"
      v-model="selectedTags"
    />
    <spinner v-if="loading"></spinner>
    <template v-else>
      <div v-if="filteredRecipes.length === 0" class="empty-state">
        <p v-if="selectedTags.length > 0">No recipes match the selected tags.</p>
        <p v-else>No recipes yet.</p>
      </div>
      <recipe-card
        v-for="recipe in filteredRecipes"
        :key="recipe.postId"
        v-bind="recipe"
      />
    </template>
    <Footer></Footer>
  </div>
</template>

<script>
import { API } from 'aws-amplify';
import Footer from '@/components/Footer.vue';
import Spinner from '@/components/Spinner.vue';
import Button from '@/components/Button.vue';
import RecipeCard from '@/components/recipes/RecipeCard.vue';
import TagFilter from '@/components/recipes/TagFilter.vue';
import { authStore } from "@/auth/store";

export default {
  name: 'RecipeListPage',
  data() {
    return {
      loading: false,
      recipes: [],
      selectedTags: [],
      isAdmin: authStore.state.isAdmin,
    }
  },
  mounted() {
    this.loadRecipes();
  },
  methods: {
    async loadRecipes() {
      this.loading = true;
      try {
        const response = await API.get('ps-api', '/posts?postType=RECIPE');
        this.recipes = response.items || [];
        this.loading = false;
      } catch (err) {
        this.loading = false;
        console.log(err);
      }
    },
    newRecipe() {
      this.$router.push("/recipes/new");
    }
  },
  computed: {
    availableTags() {
      const tags = new Set();
      this.recipes.forEach(recipe => {
        if (recipe.recipeTags) {
          recipe.recipeTags.forEach(tag => tags.add(tag));
        }
      });
      return Array.from(tags).sort();
    },
    filteredRecipes() {
      if (this.selectedTags.length === 0) {
        return this.recipes;
      }
      return this.recipes.filter(recipe => {
        if (!recipe.recipeTags) return false;
        return this.selectedTags.some(tag => recipe.recipeTags.includes(tag));
      });
    }
  },
  components: {
    Footer,
    Spinner,
    Button,
    RecipeCard,
    TagFilter,
  }
}
</script>

<style lang="scss" scoped>
.ps-recipe-list-page {
  .buttons {
    display: flex;
    margin-bottom: 20px;
    gap: 10px;
  }

  .empty-state {
    text-align: center;
    padding: 40px;
    color: #888;
  }
}
</style>
