<template>
  <div class="user-predictions-table">
    <table>
      <tbody>
        <tr>
          <th>username</th>
          <th>prediction</th>
          <th>selections</th>
          <th>points</th>
        </tr>
        <tr v-for="userPrediction in userPredictions" :key="`${userPrediction.entityId}-${userPrediction.resourceId}`">
          <td class="username">{{ userPrediction.username }}</td>
          <td>
            <div class="flex">
              <div>{{ getEpisode(userPrediction.predictionId) }}</div>
              <img class="icon" :src="getIcon(userPrediction.predictionId)" alt="icon"/>
            </div>
          </td>
          <td>
            <CastHead
                v-for="survivor in userPrediction.selections"
                :key="survivor"
                :id="survivor"
                :tribe="getTribe(survivor)"
                :correct="isCorrect(survivor, userPrediction.predictionId)"
            />
          </td>
          <td>
            {{ getPoints(userPrediction) }}
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script>
import CastHead from "@/components/survivor/CastHead";
import Necklace from "@/assets/necklace.png";
import Campfire from "@/assets/campfire.png";
import Medals from "@/assets/medals.png";

export default {
  name: "PredictionTable",
  components: {CastHead},
  props: {
    cast: Array,
    userPredictions: Array,
    predictions: Array,
    leaderboardData: Array,
  },
  methods: {
    getTribe(survivorId) {
      if (this.cast) {
        return this.cast.filter(survivor => survivor.id === survivorId)[0]?.tribe ?? null;
      } else {
        return null;
      }
    },
    getEpisode(predictionId) {
      return predictionId.split("-")[1];
    },
    getIcon(predictionId) {
      let predictionType = predictionId.split("-")[2];
      if (predictionType === "ImmunityChallenge") {
        return Necklace;
      } else if (predictionType === "TribalCouncil") {
        return Campfire;
      } else {
        return Medals
      }
    },
    isCorrect(survivorId, predictionId) {
      const results = this.predictions.find(pred => pred.resourceId === predictionId)?.results;
      return results?.includes(survivorId);
    },
    getPoints(userPrediction) {
      const pointHistoryForUser = this.leaderboardData.find(entry => entry.entityId === userPrediction.entityId)?.pointHistory;
      if (!pointHistoryForUser) {
        return 0;
      }
      const points = pointHistoryForUser.find(entry => entry.event === userPrediction.resourceId);
      if (!points) {
        return 0;
      }
      return points.pointsAdded;
    },
  }
}
</script>

<style lang="scss" scoped>
@import "../../scss/colors.scss";

.user-predictions-table {
  table {
    table-layout: fixed;
    border-collapse: collapse;
    width: 100%;
  }

  th:first-child {
    width: 90px;
  }
  th:nth-child(2) {
    width: 70px;
  }

  .flex {
    display: flex;
    align-items: center;
    justify-content: space-around;
  }

  th {
    font-size: 0.9em;
  }

  td, th {
    border: 1px solid #888888;
    text-align: left;
    padding: 8px;
    word-break: break-word;

    .icon {
      width: 35px;
      height: 35px;
    }

    &.center {
      text-align: center;
    }
  }

  tr:nth-child(even) {
    background-color: $ps-lightest-grey;
  }

  .cast-head-container {
    width: 34px;
    height: 34px;
    margin-right: 5px;
  }

  .username {
    word-break: break-all;
    font-size: 0.8em;
  }
}
</style>