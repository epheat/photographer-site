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
      <recipe-view :recipe="recipe" />
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
import RecipeView from '@/components/recipes/RecipeView.vue';
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
  components: {
    Footer,
    Spinner,
    Button,
    RecipeView,
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

  .controls {
    display: flex;
    gap: 20px;
    justify-content: space-between;
  }
}
</style>
