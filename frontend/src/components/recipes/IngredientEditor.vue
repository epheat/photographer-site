<template>
  <div class="ps-ingredient-editor">
    <h3>Ingredients</h3>
    <div class="ingredient-row" v-for="(ingredient, index) in ingredients" :key="index">
      <input
        v-model="ingredient.name"
        placeholder="Ingredient name"
        class="name"
        @input="emitUpdate"
      />
      <input
        v-model="ingredient.quantity"
        placeholder="Quantity"
        class="quantity"
        @input="emitUpdate"
      />
      <input
        v-model="ingredient.unit"
        placeholder="Unit"
        class="unit"
        @input="emitUpdate"
      />
      <input
        v-model="ingredient.notes"
        placeholder="Notes (optional)"
        class="notes"
        @input="emitUpdate"
      />
      <button type="button" class="remove" @click="removeIngredient(index)">X</button>
    </div>
    <button type="button" class="add" @click="addIngredient">+ Add Ingredient</button>
  </div>
</template>

<script>
export default {
  name: 'IngredientEditor',
  props: {
    modelValue: {
      type: Array,
      default: () => []
    }
  },
  data() {
    return {
      ingredients: this.modelValue.length > 0
        ? [...this.modelValue]
        : [{ quantity: '', unit: '', name: '', notes: '' }]
    }
  },
  watch: {
    modelValue: {
      handler(newVal) {
        if (JSON.stringify(newVal) !== JSON.stringify(this.ingredients)) {
          this.ingredients = newVal.length > 0
            ? [...newVal]
            : [{ quantity: '', unit: '', name: '', notes: '' }];
        }
      },
      deep: true
    }
  },
  methods: {
    addIngredient() {
      this.ingredients.push({ quantity: '', unit: '', name: '', notes: '' });
      this.emitUpdate();
    },
    removeIngredient(index) {
      this.ingredients.splice(index, 1);
      if (this.ingredients.length === 0) {
        this.addIngredient();
      } else {
        this.emitUpdate();
      }
    },
    emitUpdate() {
      this.$emit('update:modelValue', this.ingredients);
    }
  }
}
</script>

<style lang="scss" scoped>
@import "../../scss/colors.scss";

.ps-ingredient-editor {
  h3 {
    margin-bottom: 15px;
  }

  .ingredient-row {
    display: flex;
    gap: 8px;
    margin-bottom: 8px;

    input {
      padding: 8px;
      border: 1px solid $ps-lighter-grey;
      border-radius: 4px;

      &.quantity {
        flex: 0 0 60px;
      }

      &.unit {
        flex: 0 0 80px;
      }

      &.name {
        flex: 1;
      }

      &.notes {
        flex: 0 0 150px;
      }
    }

    .remove {
      flex: 0 0 30px;
      background-color: $ps-button-red;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;

      &:hover {
        filter: brightness(110%);
      }
    }
  }

  .add {
    margin-top: 10px;
    padding: 8px 16px;
    background-color: $ps-button-green;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;

    &:hover {
      filter: brightness(110%);
    }
  }
}

@media screen and (max-width: 600px) {
  .ps-ingredient-editor {
    .ingredient-row {
      flex-wrap: wrap;

      input {
        &.quantity, &.unit {
          flex: 0 0 calc(50% - 20px);
        }

        &.name, &.notes {
          flex: 1 1 100%;
        }
      }
    }
  }
}
</style>
