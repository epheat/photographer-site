<template>
  <div class="ps-recipe-ingredients">
    <h3>Ingredients</h3>
    <template v-for="(item, index) in ingredients" :key="index">
      <template v-if="isSection(item)">
        <h4 class="section-header">{{ item.name }}</h4>
        <ul>
          <li v-for="(ingredient, i) in item.ingredients" :key="`${index}-${i}`">
            <span class="quantity" v-if="ingredient.quantity">{{ ingredient.quantity }}</span>
            <span class="unit" v-if="ingredient.unit">{{ ingredient.unit }}</span>
            <span class="name">{{ ingredient.name }}</span>
            <span class="notes" v-if="ingredient.notes">({{ ingredient.notes }})</span>
          </li>
        </ul>
      </template>
      <div v-else class="ingredient-item">
        <span class="quantity" v-if="item.quantity">{{ item.quantity }}</span>
        <span class="unit" v-if="item.unit">{{ item.unit }}</span>
        <span class="name">{{ item.name }}</span>
        <span class="notes" v-if="item.notes">({{ item.notes }})</span>
      </div>
    </template>
  </div>
</template>

<script lang="ts">
import { defineComponent, PropType } from 'vue';
import { Ingredient, IngredientSection } from '@/types/recipe';

export default defineComponent({
  name: 'RecipeIngredients',
  props: {
    ingredients: {
      type: Array as PropType<(IngredientSection | Ingredient)[]>,
      required: true,
    }
  },
  methods: {
    isSection(item: IngredientSection | Ingredient): item is IngredientSection {
      return 'ingredients' in item;
    }
  }
})
</script>

<style lang="scss" scoped>
@import "../../scss/colors.scss";

.ps-recipe-ingredients {
  h3 {
    margin-bottom: 15px;
    border-bottom: 2px solid $ps-jeans;
    padding-bottom: 5px;
  }

  .section-header {
    margin-top: 20px;
    margin-bottom: 5px;
    font-size: 1em;
    color: $ps-jeans;

    &:first-of-type {
      margin-top: 0;
    }
  }

  ul {
    list-style: none;
    padding: 0;
    margin: 0;

    li {
      padding: 4px 0;
      border-bottom: 1px solid $ps-lightest-grey;

      &:last-child {
        border-bottom: none;
      }

      .quantity {
        font-weight: 600;
        margin-right: 4px;
      }

      .unit {
        margin-right: 4px;
      }

      .name {
        color: $ps-text-default;
      }

      .notes {
        color: $ps-light-grey;
        font-style: italic;
        margin-left: 5px;
      }
    }
  }

  .ingredient-item {
    padding: 4px 0;
    border-bottom: 1px solid $ps-lightest-grey;

    .quantity {
      font-weight: 600;
      margin-right: 4px;
    }

    .unit {
      margin-right: 4px;
    }

    .name {
      color: $ps-text-default;
    }

    .notes {
      color: $ps-light-grey;
      font-style: italic;
      margin-left: 5px;
    }
  }
}
</style>
