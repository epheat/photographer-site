<template>
  <div class="ps-recipe-editor-page page">
    <h1>{{ isEditing ? 'Edit Recipe' : 'New Recipe' }}</h1>
    <p class="success-message" v-if="successMessage">{{ successMessage }}</p>
    <p class="error-message" v-if="errorMessage">{{ errorMessage }}</p>

    <div class="mode-toggle">
      <button :class="{ active: mode === 'edit' }" @click="mode = 'edit'">Edit</button>
      <button :class="{ active: mode === 'preview' }" @click="mode = 'preview'">Preview</button>
    </div>

    <template v-if="mode === 'edit'">
      <div class="form-section">
        <h2>Basic Info</h2>
        <form-field v-model="title" label="Title" />
        <div class="field">
          <label>Description</label>
          <textarea v-model="description" placeholder="Brief description of the recipe"></textarea>
        </div>
        <div class="field">
          <label>Tags (comma-separated)</label>
          <input v-model="tagsInput" placeholder="e.g., main, quick, vegetarian" />
        </div>
      </div>

      <div class="form-section">
        <h2>Time & Servings</h2>
        <div class="meta-inputs">
          <div class="field">
            <label>Prep Time (minutes)</label>
            <input type="number" v-model.number="prepTime" />
          </div>
          <div class="field">
            <label>Cook Time (minutes)</label>
            <input type="number" v-model.number="cookTime" />
          </div>
          <div class="field">
            <label>Servings</label>
            <input type="number" v-model.number="servings" />
          </div>
        </div>
      </div>

      <div class="form-section">
        <ingredient-editor v-model="ingredientRows" />
      </div>

      <div class="form-section">
        <h2>Instructions</h2>
        <p class="hint">Use Markdown for formatting. Use numbered lists for steps.</p>
        <div class="editor">
          <textarea v-model="instructions" placeholder="1. First step..."></textarea>
          <div class="rendered" v-html="compiledInstructions"></div>
        </div>
      </div>

      <div class="form-section">
        <h2>Image</h2>
        <div v-if="pictureUrl" class="current-image">
          <img :src="pictureUrl" alt="Current recipe image" />
          <button type="button" @click="pictureUrl = ''">Remove</button>
        </div>
        <input type="file" @change="onFileChange" accept="image/*" />
        <button v-if="imageData" @click="uploadImage" :disabled="uploading">
          {{ uploading ? 'Uploading...' : 'Upload Image' }}
        </button>
      </div>

      <div class="actions">
        <button class="submit" @click="submit" :disabled="saving">
          {{ saving ? 'Saving...' : (isEditing ? 'Save Changes' : 'Create Recipe') }}
        </button>
        <button class="cancel" @click="$router.push('/recipes')">Cancel</button>
      </div>
    </template>

    <template v-else>
      <div class="preview">
        <recipe-view :recipe="previewRecipe" />
      </div>
    </template>

    <Footer></Footer>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import Footer from '@/components/Footer.vue';
import FormField from '@/components/FormField.vue';
import IngredientEditor from '@/components/recipes/IngredientEditor.vue';
import RecipeView from '@/components/recipes/RecipeView.vue';
import { Recipe, Ingredient, IngredientRow, IngredientSection } from '@/types/recipe';
import { marked } from 'marked';
import { API, Auth } from 'aws-amplify';
import { authStore } from "@/auth/store";

interface RecipeEditorData {
  mode: 'edit' | 'preview';
  title: string;
  description: string;
  tagsInput: string;
  prepTime: number | null;
  cookTime: number | null;
  servings: number | null;
  ingredientRows: IngredientRow[];
  instructions: string;
  pictureUrl: string;
  imageData: File | null;
  imageFileName: string | null;
  saving: boolean;
  uploading: boolean;
  successMessage: string;
  errorMessage: string;
}

export default defineComponent({
  name: 'RecipeEditorPage',
  data(): RecipeEditorData {
    return {
      mode: 'edit',
      title: '',
      description: '',
      tagsInput: '',
      prepTime: null,
      cookTime: null,
      servings: null,
      ingredientRows: [{rowType: 'ingredient', name: ''}],
      instructions: '',
      pictureUrl: '',
      imageData: null,
      imageFileName: null,
      saving: false,
      uploading: false,
      successMessage: '',
      errorMessage: '',
    }
  },
  computed: {
    isEditing(): boolean {
      return !!this.$route.params.postId;
    },
    parsedTags(): string[] {
      if (!this.tagsInput) return [];
      return this.tagsInput.split(',').map(t => t.trim()).filter(t => t);
    },
    compiledInstructions(): string {
      return this.instructions ? marked(this.instructions) as string : '';
    },
    previewRecipe(): Recipe {
      return this.getRecipe();
    }
  },
  mounted() {
    if (this.isEditing) {
      this.loadRecipe();
    }
  },
  methods: {
    rowsToIngredients(rows: IngredientRow[]): (IngredientSection | Ingredient)[] {
      const result: (IngredientSection | Ingredient)[] = [];
      let currentSection: IngredientSection | null = null;

      for (const row of rows) {
        if (row.rowType === 'section') {
          // Push current section if it exists
          if (currentSection) {
            result.push(currentSection);
          }
          // Start a new section
          currentSection = { name: row.name, ingredients: [] };
        } else {
          const ingredient: Ingredient = { name: row.name };
          if (row.quantity) ingredient.quantity = row.quantity;
          if (row.unit) ingredient.unit = row.unit;
          if (row.notes) ingredient.notes = row.notes;

          if (currentSection) {
            // Add to current section
            currentSection.ingredients.push(ingredient);
          } else {
            // No section yet - add as standalone ingredient
            result.push(ingredient);
          }
        }
      }

      // Push the last section if it exists
      if (currentSection) {
        result.push(currentSection);
      }

      return result;
    },
    ingredientsToRows(ingredients: (IngredientSection | Ingredient)[]): IngredientRow[] {
      const rows: IngredientRow[] = [];

      const isSection = (item: IngredientSection | Ingredient): item is IngredientSection => {
        return 'ingredients' in item;
      };

      for (const item of ingredients) {
        if (isSection(item)) {
          rows.push({ rowType: 'section', name: item.name });
          for (const ingredient of item.ingredients) {
            rows.push({
              rowType: 'ingredient',
              name: ingredient.name,
              quantity: ingredient.quantity,
              unit: ingredient.unit,
              notes: ingredient.notes,
            });
          }
        } else {
          rows.push({
            rowType: 'ingredient',
            name: item.name,
            quantity: item.quantity,
            unit: item.unit,
            notes: item.notes,
          });
        }
      }

      return rows;
    },
    getRecipe(): Recipe {
      return {
        title: this.title,
        pictureUrl: this.pictureUrl,
        recipeTags: this.parsedTags,
        description: this.description,
        prepTime: this.prepTime ?? undefined,
        cookTime: this.cookTime ?? undefined,
        servings: this.servings ?? undefined,
        ingredients: this.rowsToIngredients(this.ingredientRows),
        instructions: this.instructions,
      };
    },
    async loadRecipe(): Promise<void> {
      try {
        const response = await API.get('ps-api', `/posts/${this.$route.params.postId}`, {});
        const recipe = response.post as Recipe;
        this.title = recipe.title || '';
        this.description = recipe.description || '';
        this.tagsInput = recipe.recipeTags ? recipe.recipeTags.join(', ') : '';
        this.prepTime = recipe.prepTime ?? null;
        this.cookTime = recipe.cookTime ?? null;
        this.servings = recipe.servings ?? null;
        this.ingredientRows = recipe.ingredients ? this.ingredientsToRows(recipe.ingredients) : [];
        this.instructions = recipe.instructions || '';
        this.pictureUrl = recipe.pictureUrl || '';
      } catch (err) {
        this.errorMessage = 'Failed to load recipe.';
        console.log(err);
      }
    },
    onFileChange(event: Event): void {
      const target = event.target as HTMLInputElement;
      this.imageData = target.files?.[0] ?? null;
      this.imageFileName = target.files?.[0]?.name ?? null;
    },
    async uploadImage(): Promise<void> {
      if (!this.imageData) return;
      this.uploading = true;
      this.errorMessage = '';
      try {
        if (!authStore.state.loggedIn) {
          this.errorMessage = 'You must be logged in to upload images.';
          this.uploading = false;
          return;
        }
        const token = (await Auth.currentSession()).getAccessToken().getJwtToken();
        const response = await API.get('ps-api', `/images/uploadUrl/${this.imageFileName}`, {
          headers: { Authorization: `Bearer ${token}` }
        });

        await fetch(response.uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': 'multipart/form-data' },
          body: this.imageData,
        });

        // Finalize the image metadata (removes TTL)
        await API.post('ps-api', '/images/metadata', {
          body: {
            imageId: response.imageId,
            title: this.title || this.imageFileName,
            description: `Image for recipe "${this.title}".`,
          },
          headers: { Authorization: `Bearer ${token}` }
        });

        this.pictureUrl = response.imageUrl;
        this.imageData = null;
        this.successMessage = 'Image uploaded successfully.';
      } catch (err) {
        this.errorMessage = 'Failed to upload image.';
        console.log(err);
      }
      this.uploading = false;
    },
    async submit(): Promise<void> {
      this.saving = true;
      this.errorMessage = '';
      this.successMessage = '';

      if (!this.title || !this.instructions || this.ingredientRows.length === 0) {
        this.errorMessage = 'Title, instructions, and at least one ingredient are required.';
        this.saving = false;
        return;
      }

      try {
        if (!authStore.state.loggedIn) {
          this.errorMessage = 'You must be logged in to save recipes.';
          this.saving = false;
          return;
        }

        const token = (await Auth.currentSession()).getAccessToken().getJwtToken();
        const payload = {
          post: {
            postType: 'RECIPE',
            ...this.getRecipe()
          }
        };

        if (this.isEditing) {
          await API.post('ps-api', `/posts/${this.$route.params.postId}`, {
            body: payload,
            headers: { Authorization: `Bearer ${token}` }
          });
          this.successMessage = 'Recipe updated successfully.';
        } else {
          const response = await API.post('ps-api', '/posts/new', {
            body: payload,
            headers: { Authorization: `Bearer ${token}` }
          });
          this.successMessage = 'Recipe created successfully.';
          if (response.postId) {
            this.$router.push(`/recipes/${response.postId}`);
          }
        }
      } catch (err) {
        this.errorMessage = (err as Error).message || 'Failed to save recipe.';
        console.log(err);
      }
      this.saving = false;
    }
  },
  components: {
    Footer,
    FormField,
    IngredientEditor,
    RecipeView,
  }
})
</script>

<style lang="scss" scoped>
@import "../../scss/colors.scss";

.ps-recipe-editor-page {
  max-width: 900px;
  margin: 0 auto;
  padding: 0 15px;

  h1 {
    text-align: center;
  }

  .success-message {
    color: $ps-green;
    text-align: center;
  }

  .error-message {
    color: $ps-red;
    text-align: center;
  }

  .mode-toggle {
    display: flex;
    justify-content: center;
    gap: 10px;
    margin-bottom: 20px;

    button {
      padding: 8px 20px;
      border: 1px solid $ps-jeans;
      background: transparent;
      color: $ps-jeans;
      cursor: pointer;
      border-radius: 4px;

      &.active {
        background: $ps-jeans;
        color: white;
      }
    }
  }

  .form-section {
    margin-bottom: 30px;
    padding: 20px;
    background: $ps-white;
    border-radius: 8px;

    h2 {
      margin-top: 0;
      margin-bottom: 15px;
      font-size: 1.2em;
    }

    .hint {
      color: $ps-light-grey;
      font-size: 0.9em;
      margin-bottom: 10px;
    }
  }

  .field {
    display: flex;
    flex-direction: column;
    margin-bottom: 15px;

    label {
      margin-bottom: 5px;
      font-weight: 500;
    }

    input, textarea {
      padding: 8px;
      border: 1px solid $ps-lighter-grey;
      border-radius: 4px;
    }

    textarea {
      min-height: 80px;
      resize: vertical;
    }
  }

  .meta-inputs {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 15px;

    @media screen and (max-width: 600px) {
      grid-template-columns: 1fr;
    }
  }

  .editor {
    display: flex;
    gap: 15px;

    textarea {
      flex: 1;
      min-height: 300px;
      padding: 15px;
      border: 1px solid $ps-lighter-grey;
      border-radius: 4px;
      resize: vertical;
      font-family: monospace;
    }

    .rendered {
      flex: 1;
      padding: 15px;
      background: white;
      border-radius: 4px;
      overflow: auto;
    }

    @media screen and (max-width: 768px) {
      flex-direction: column;
    }
  }

  .current-image {
    margin-bottom: 15px;

    img {
      max-width: 200px;
      max-height: 150px;
      object-fit: cover;
      border-radius: 4px;
    }

    button {
      display: block;
      margin-top: 5px;
      padding: 4px 10px;
      background: $ps-button-red;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
    }
  }

  .actions {
    display: flex;
    gap: 10px;
    justify-content: center;
    margin-bottom: 30px;

    button {
      padding: 10px 25px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 1em;

      &.submit {
        background: $ps-button-green;
        color: white;
      }

      &.cancel {
        background: $ps-button-default;
        color: white;
      }

      &:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }
    }
  }

}
</style>
