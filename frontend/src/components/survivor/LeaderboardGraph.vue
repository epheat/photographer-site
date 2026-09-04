<template>
  <div class="ps-leaderboard-graph-container">
    <svg class="ps-leaderboard-graph" id="leaderboard-graph" />
  </div>
</template>

<script>
import * as c3 from 'c3';
import 'c3/c3.css';

export default {
  name: "LeaderboardGraph",
  props: {
    leaderboardData:  Array,
  },
  mounted() {
    this.graph = c3.generate({
      bindto: '#leaderboard-graph',
      data: {
        columns: this.getColumnsData(this.leaderboardData),
      }
    })
  },
  watch: {
    leaderboardData(newData) {
      this.graph.load({
        columns: this.getColumnsData(newData)
      })
    }
  },
  methods: {
    getColumnsData(leaderboardData) {
      return leaderboardData.map(leaderboardEntry => {
        return [
          leaderboardEntry.username,
          ...leaderboardEntry.pointHistory.map(pointEvent => {
            return pointEvent.points;
          })
        ]
      });
    }
  },
}
</script>

<style scoped>
.ps-leaderboard-graph {
  box-sizing: border-box;
  width: 100%;
  min-height: 400px;
}
</style>