<template>
  <div class="ps-ingredient-editor">
    <h3>Ingredients</h3>
    <draggable
      v-model="ingredients"
      :item-key="(el) => el"
      handle=".drag-handle"
      @end="emitUpdate"
    >
      <template #item="{ element, index }">
        <div class="ingredient-row">
          <span class="drag-handle">&#9776;</span>
          <input
            v-model="element.name"
            placeholder="Ingredient name"
            class="name"
            @input="emitUpdate"
          />
          <input
            v-model="element.quantity"
            placeholder="Qty"
            class="quantity"
            @input="emitUpdate"
          />
          <input
            v-model="element.unit"
            placeholder="Unit"
            class="unit"
            @input="emitUpdate"
          />
          <input
            v-model="element.notes"
            placeholder="Notes"
            class="notes"
            @input="emitUpdate"
          />
          <button type="button" class="remove" @click="removeIngredient(index)">X</button>
        </div>
      </template>
    </draggable>
    <button type="button" class="add" @click="addIngredient">+ Add Ingredient</button>
  </div>
</template>

<script>
import draggable from 'vuedraggable';

export default {
  name: 'IngredientEditor',
  components: {
    draggable,
  },
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
    align-items: center;

    .drag-handle {
      flex-shrink: 0;
      cursor: grab;
      padding: 4px;
      color: $ps-light-grey;
      user-select: none;

      &:active {
        cursor: grabbing;
      }
    }

    input {
      padding: 8px;
      border: 1px solid $ps-lighter-grey;
      border-radius: 4px;
      min-width: 0;

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
      flex-shrink: 0;
      width: 28px;
      height: 28px;
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
