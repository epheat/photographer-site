<template>
  <div class="battletd-bench">
    <TowerCard
        v-for="(card, index) in cards"
        :key="index"
        :card="card"
        :selected="selectedCard == index"
        @clickTowerCard="$emit('toggleSelected', index)"
    />
  </div>
</template>
<script lang="ts">
import { defineComponent, PropType } from "vue";
import { TowerCard as TowerCardDef } from "@/phaser/battletd/model/Cards";
import TowerCard from "@/components/battletd/TowerCard.vue";

export default defineComponent({
  components: {TowerCard},
  props: {
    cards: Array as PropType<Array<TowerCardDef>>,
    selectedCard: Number,
  },
  data() {
    return {

    }
  },
  methods: {

  },
  computed: {

  }
})
</script>

<style lang="scss" scoped>
.battletd-bench {
  position: absolute;
  bottom: 5px;
  width: 100%;

  display: flex;
  justify-content: center;
  gap: 5px;
}

.battletd-tower-card {
  position: relative;

  bottom: 0;
}
</style>