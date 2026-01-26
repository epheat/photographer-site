<template>
  <div class="ps-ingredient-editor">
    <h3>Ingredients</h3>
    <draggable
      v-model="rows"
      :item-key="(el: any) => el"
      handle=".drag-handle"
      @end="emitUpdate"
    >
      <template #item="{ element, index }">
        <div class="ingredient-row">
          <span class="drag-handle">&#9776;</span>
          <input
            v-model="element.name"
            :placeholder="capitalize(element.rowType) + ' name'"
            class="name"
            @input="emitUpdate"
          />
          <input
            v-if="element.rowType == 'ingredient'"
            v-model="element.quantity"
            placeholder="Qty"
            class="quantity"
            @input="emitUpdate"
          />
          <input
            v-if="element.rowType == 'ingredient'"
            v-model="element.unit"
            placeholder="Unit"
            class="unit"
            @input="emitUpdate"
          />
          <input
            v-if="element.rowType == 'ingredient'"
            v-model="element.notes"
            placeholder="Notes"
            class="notes"
            @input="emitUpdate"
          />
          <button type="button" class="remove" @click="removeIngredient(index)">X</button>
        </div>
      </template>
    </draggable>
    <button type="button" class="add" @click="addIngredient('ingredient')">+ Add Ingredient</button>
    <button type="button" class="add" @click="addIngredient('section')">+ Add Section</button>
  </div>
</template>

<script lang="ts">
import { defineComponent, PropType } from 'vue';
import draggable from 'vuedraggable';
import { IngredientRow } from '@/types/recipe';

export default defineComponent({
  name: 'IngredientEditor',
  components: {
    draggable,
  },
  props: {
    modelValue: {
      type: Array as PropType<IngredientRow[]>,
      default: () => []
    }
  },
  data() {
    return {
      rows: this.modelValue as IngredientRow[]
    }
  },
  watch: {
    modelValue(newValue: IngredientRow[]) {
      this.rows = newValue;
    }
  },
  methods: {
    capitalize(str: string): string {
      return str.charAt(0).toUpperCase() + str.slice(1);
    },
    addIngredient(rowType: 'ingredient' | 'section'): void {
      this.rows.push({ rowType: rowType, quantity: '', unit: '', name: '', notes: '' });
      this.emitUpdate();
    },
    removeIngredient(index: number): void {
      this.rows.splice(index, 1);
      if (this.rows.length === 0) {
        this.addIngredient('ingredient');
      } else {
        this.emitUpdate();
      }
    },
    emitUpdate(): void {
      this.$emit('update:modelValue', this.rows);
    }
  }
})
</script>

<style lang="scss" scoped>
@import "../../scss/colors.scss";

.ps-ingredient-editor {
  h3 {
    margin-bottom: 15px;
  }

  button {
    margin-right: 10px;
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
