<template>
  <div class="ps-recipe-ingredients">
    <h3>Ingredients</h3>
    <ul>
      <li v-for="(ingredient, index) in ingredients" :key="index">
        <span class="quantity" v-if="ingredient.quantity">{{ ingredient.quantity }}</span>
        <span class="unit" v-if="ingredient.unit">{{ ingredient.unit }}</span>
        <span class="name">{{ ingredient.name }}</span>
        <span class="notes" v-if="ingredient.notes">({{ ingredient.notes }})</span>
      </li>
    </ul>
  </div>
</template>

<script lang="ts">
import { defineComponent, PropType } from 'vue';
import { Ingredient } from '@/types/recipe';

export default defineComponent({
  name: 'RecipeIngredients',
  props: {
    ingredients: {
      type: Array as PropType<Ingredient[]>,
      required: true,
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

  ul {
    list-style: none;
    padding: 0;
    margin: 0;

    li {
      padding: 8px 0;
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
}
</style>
