<template>
  <div class="page survivor-page">
    <h1>FantasySurvivor</h1>
    <div class="tabs">
      <div class="tab" :class="{active: currentTab === 0}" @click="setTab(0)">Predictions</div>
      <div class="tab" :class="{active: currentTab === 1}" @click="setTab(1)">Leaderboard</div>
      <div class="tab" :class="{active: currentTab === 2}" @click="setTab(2)">Cast</div>
      <div class="tab" v-if="shouldShowAdminPage" :class="{active: currentTab === 3}" @click="setTab(3)">Admin</div>
    </div>
    <div class="info-banner" v-if="!loggedIn">This game requires an account to play. Please <router-link to="/auth/login">Login</router-link> or <router-link to="/auth/register">Register</router-link>.</div>
    <div class="error-message" v-if="errorMessage">{{ errorMessage }}</div>
    <div class="success-message" v-if="successMessage">{{ successMessage }}</div>
    <div class="loading-message" v-if="loading">loading...</div>
    <Modal :show="showUserPredictionModal" @close="closeUserPredictionModal">
      <template #header>
        <h2>{{ selectedPrediction.episode }} - {{ selectedPrediction.predictionType }} prediction</h2>
        <p v-if="confirmedItem"><i>Using Item - {{ confirmedItem.itemType }}</i></p>
        <p>{{ selectedPredictionInstructions }}</p>
      </template>
      <SurvivorSelector
          :cast="filterCast(cast, selectedPrediction)"
          :maxSelect="maxSelect"
          v-model="userPredictionSelections"
      />
      <template #actions>
        <Button submit @press="submitUserPrediction">Submit</Button>
      </template>
    </Modal>
    <Modal :show="showPredictionCompleteModal" @close="closePredictionCompleteModal">
      <template #header>
        <h2>Complete the {{ adminSelectedPrediction.episode }} - {{ adminSelectedPrediction.predictionType }} prediction?</h2>
        <p>Select the winners for this prediction. For ImmunityChallenge predictions, select the winning survivors. For TribalCouncil, select the survivor who went home.</p>
      </template>
      <SurvivorSelector
          :cast="filterCast(cast, adminSelectedPrediction)"
          v-model="completePredictionSelections"
      />
      <template #actions>
        <Button cancel @press="deletePrediction">Delete</Button>
        <Button submit @press="submitCompletePrediction">Submit</Button>
      </template>
    </Modal>
    <Modal :show="showItemModal" @close="closeItemModal">
      <template #header>
        <h2>Use your {{ selectedItem.itemType }} item?</h2>
        <p>{{ selectedItemDescription }}</p>
        <p v-if="selectedItem.message">{{ selectedItem.message }}</p>
      </template>
      <div></div>
      <template #actions>
        <Button cancel @press="cancelItemModal">Cancel</Button>
        <Button submit @press="confirmUseItem">Confirm</Button>
      </template>
    </Modal>
    <div class="tab-content home" v-if="currentTab === 0">
      <h2>Inventory</h2>
      <Button style="display: inline-block" @press="getInventory">Refresh</Button>
      <p>Items that you acquire over the course of the game will show up here. Click on an item to learn more.</p>
      <div class="inventory">
        <template v-if="userInventory.length">
          <InventoryItem
              v-for="item in userInventory"
              :key="item.id"
              :id="item.id"
              :itemType="item.itemType"
              :highlight="confirmedItem?.id === item.id"
              @click="openItemModal(item)"
          />
        </template>
        <span v-else>Your inventory is empty.</span>
      </div>
      <h2>Predictions</h2>
      <Button style="display: inline-block" @press="refreshPredictions">Refresh</Button>
      <p>Past and future predictions will show up here. You can only edit your predictions up until the day that the episode airs. Click on a prediction to make your selection.</p>
      <h3 v-if="ongoingPredictions.length > 0">Active predictions</h3>
      <PredictionDisplay
        class="user-prediction-display"
        v-for="prediction in ongoingPredictions"
        v-bind="prediction"
        :key="prediction.id"
        @click="openUserPredictionModal(prediction)"
        :submitted="getUserSelectionsForPrediction(prediction).length > 0"
        :cast="filterCastForSelections(this.cast, getUserSelectionsForPrediction(prediction))"
        :userSelections="getUserSelectionsForPrediction(prediction)"
      />
      <h3 v-if="closedPredictions.length > 0">Closed predictions</h3>
      <PredictionDisplay
          class="user-prediction-display"
          v-for="prediction in closedPredictions"
          v-bind="prediction"
          :key="prediction.id"
          :submitted="getUserSelectionsForPrediction(prediction).length > 0"
          :cast="filterCastForSelections(this.cast, getUserSelectionsForPrediction(prediction))"
          :userSelections="getUserSelectionsForPrediction(prediction)"
      />
      <h3 v-if="completedPredictions.length > 0">Past predictions</h3>
      <PredictionDisplay
          class="user-prediction-display"
          v-for="prediction in completedPredictions"
          v-bind="prediction"
          :key="prediction.id"
          :submitted="getUserSelectionsForPrediction(prediction).length > 0"
          :cast="filterCastForSelections(this.cast, getUserSelectionsForPrediction(prediction))"
          :userSelections="getUserSelectionsForPrediction(prediction)"
      />
    </div>
    <div class="tab-content leaderboard" v-if="currentTab === 1">
      <h2>Rankings</h2>
      <Button @press="getLeaderboard">Refresh</Button>
      <Leaderboard
        :data="leaderboardData"
        :userSub="userSub"
      />
      <h2>Points over Time</h2>
      <LeaderboardGraph :leaderboardData="leaderboardData" />
      <h2>User Predictions</h2>
      <p>View user predictions from previous rounds here. Use this information to help determine who to select in your future predictions.</p>
      <Button @press="getAllUserPredictions">Refresh</Button>
      <input id="userPredictionCheck" type="checkbox" v-if="shouldShowAdminPage" v-model="showCurrentUserPredictions"/>
      <label for="userPredictionCheck" v-if="shouldShowAdminPage">Show current</label>
      <UserPredictionsTable
        :userPredictions="filteredUserPredictions"
        :predictions="predictions"
        :cast="cast"
        :leaderboardData="leaderboardData"
      />
    </div>
    <div class="tab-content cast" v-if="currentTab === 2">
      <div class="cast-container">
        <CastMember v-for="survivor in cast" v-bind="survivor" :key="survivor.id"/>
      </div>
    </div>
    <div class="tab-content admin" v-if="currentTab === 3">
      <h2>Cast editor</h2>
      <p>Use these controls to edit the cast over the course of the season, as survivors get voted out each episode. Could also be used to track who has an idol.</p>
      <textarea :value="castEditorValue" @input="updateCastEditorValue"></textarea>
      <div class="controls">
        <div class="reload" @click="getCast">Reload from db</div>
        <div class="submit" @click="setCast">Set cast data</div>
      </div>
      <h2>Prediction editor</h2>
      <p>List all the current predictions here. For predictions, allow completion of the prediction while providing the winner of the challenge. Allow deletion of predictions.</p>
      <PredictionDisplay
          class="admin-prediction-display"
          v-for="prediction in predictions"
          v-bind="prediction"
          :key="prediction.id"
          @click="openPredictionCompleteModal(prediction)"
      />
      <h3>New Prediction:</h3>
      <PredictionEditor :cast="cast" @submitPrediction="putPrediction" />
      <h3>Grant an item:</h3>
      <ItemEditor :users="activePlayers" />
    </div>
    <Footer></Footer>
  </div>
</template>

<script>
import Footer from '@/components/Footer';
import { apiGet, apiPost } from "@/utils/api";
import { getAuthSession } from "@/auth/session";
import {authStore} from "@/auth/store";
import CastMember from "@/components/survivor/CastMember";
import PredictionEditor from "@/components/survivor/PredictionEditor";
import PredictionDisplay from "@/components/survivor/PredictionDisplay";
import Modal from "@/components/Modal";
import SurvivorSelector from "@/components/survivor/SurvivorSelector";
import Button from "@/components/Button";
import Leaderboard from "@/components/survivor/Leaderboard";
import UserPredictionsTable from "@/components/survivor/UserPredictionsTable";
import InventoryItem from "@/components/survivor/InventoryItem";
import ItemEditor from "@/components/survivor/ItemEditor";
import LeaderboardGraph from "@/components/survivor/LeaderboardGraph";

export default {
  name: "SurvivorGamePage",
  props: {

  },
  data() {
    return {
      currentTab: 0,
      errorMessage: "",
      successMessage: "",
      loggedIn: authStore.state.loggedIn,
      loading: false,
      showUserPredictionModal: false,
      cast: [],
      predictions: [],
      userPredictions: [],
      allUserPredictions: [],
      selectedPrediction: null,
      selectedUserPrediction: null,
      userPredictionSelections: [],
      leaderboardData: [],
      userInventory: [],
      showItemModal: false,
      selectedItem: null,
      confirmedItem: null,

      // admin only
      shouldShowAdminPage: authStore.state.isAdmin,
      castEditorValue: "",
      showPredictionCompleteModal: false,
      adminSelectedPrediction: null,
      completePredictionSelections: [],
      showCurrentUserPredictions: false,
    }
  },
  mounted() {
    this.getCast();
    this.getPredictions();
    this.getUserPredictions();
    this.getAllUserPredictions();
    this.getLeaderboard();
    this.getInventory();
  },
  methods: {
    setTab(tab) {
      this.resetMessages();
      this.currentTab = tab;
    },
    updateCastEditorValue(e) {
      this.castEditorValue = e.target.value;
    },
    openUserPredictionModal(prediction) {
      if (!prediction.results && prediction.predictBefore > new Date().getTime()) {
        this.selectedPrediction = prediction;
        this.userPredictionSelections = this.getUserSelectionsForPrediction(prediction);
        this.showUserPredictionModal = true;
      }
    },
    openPredictionCompleteModal(prediction) {
      this.adminSelectedPrediction = prediction;
      this.completePredictionSelections = [];
      this.showPredictionCompleteModal = true;
    },
    openItemModal(item) {
      this.selectedItem = item;
      this.showItemModal = true;
    },
    getUserSelectionsForPrediction(prediction) {
      const userPrediction = this.userPredictions.find(up => up.predictionId === prediction.resourceId);
      return userPrediction ? userPrediction.selections : [];
    },
    refreshPredictions() {
      this.getPredictions();
      this.getUserPredictions();
    },
    async getCast() {
      this.resetMessages();
      try {
        let token = (await getAuthSession()).accessToken;
        this.loading = true;
        let response = await apiGet('/games/survivor/cast', {
          headers: {
            Authorization: `Bearer ${token}`,
          }
        });
        if (response.items) {
          this.cast = response.items.sort((s1, s2) => s1.tribe.localeCompare(s2.tribe));
          this.castEditorValue = JSON.stringify(response.items, null, 2);
        } else {
          this.cast = [];
          this.castEditorValue = "[]";
        }
        this.loading = false;
      } catch (err) {
        this.errorMessage = err.message;
        this.loading = false;
      }
    },
    async setCast() {
      this.resetMessages();
      try {
        const survivors = JSON.parse(this.castEditorValue);
        let token = (await getAuthSession()).accessToken;
        this.loading = true;
        let response = await apiPost('/games/survivor/cast', {
          body: {
            survivors: survivors,
          },
          headers: {
            Authorization: `Bearer ${token}`,
          }
        });
        this.successMessage = response.message;
        this.loading = false;
      } catch (err) {
        this.errorMessage = err.message;
        this.loading = false;
      }
    },
    async getLeaderboard() {
      this.resetMessages();
      try {
        let token = (await getAuthSession()).accessToken;
        this.loading = true;
        let response = await apiGet('/games/survivor/leaderboard', {
          headers: {
            Authorization: `Bearer ${token}`,
          }
        });
        this.leaderboardData = response.items;
        this.loading = false;
      } catch (err) {
        this.errorMessage = err.message;
        this.loading = false;
      }
    },
    async getPredictions() {
      this.resetMessages();
      try {
        let token = (await getAuthSession()).accessToken;
        let response = await apiGet('/games/survivor/predictions', {
          headers: {
            Authorization: `Bearer ${token}`,
          }
        })
        this.predictions = response.items;
        this.successMessage = response.message;
        this.loading = false;
      } catch (err) {
        this.errorMessage = err.message;
        this.loading = false;
      }
    },
    async putPrediction(prediction) {
      this.resetMessages();
      try {
        let token = (await getAuthSession()).accessToken;
        this.loading = true;
        let response = await apiPost('/games/survivor/predictions', {
          body: {
            prediction: prediction,
          },
          headers: {
            Authorization: `Bearer ${token}`,
          }
        });
        this.successMessage = response.message;
        this.loading = false;
      } catch (err) {
        this.errorMessage = err.message;
        this.loading = false;
      }
    },
    async getUserPredictions() {
      this.resetMessages();
      try {
        let session = await getAuthSession();
        let jwt = session.accessToken;
        let response = await apiGet(`/games/survivor/userPredictions/${session.idTokenPayload.sub}`, {
          headers: {
            Authorization: `Bearer ${jwt}`,
          }
        })
        this.userPredictions = response.items;
        this.successMessage = response.message;
        this.loading = false;
      } catch (err) {
        this.errorMessage = err.message;
        this.loading = false;
      }
    },
    async getAllUserPredictions() {
      this.resetMessages();
      try {
        let token = (await getAuthSession()).accessToken;
        let response = await apiGet('/games/survivor/userPredictions', {
          headers: {
            Authorization: `Bearer ${token}`,
          }
        })
        this.allUserPredictions = response.items;
        this.successMessage = response.message;
        this.loading = false;
      } catch (err) {
        this.errorMessage = err.message;
        this.loading = false;
      }
    },
    async submitUserPrediction() {
      this.resetMessages();
      try {
        let token = (await getAuthSession()).accessToken;
        this.loading = true;
        let response = await apiPost('/games/survivor/userPredictions', {
          body: {
            userPrediction: {
              episode: this.selectedPrediction.episode,
              predictionType: this.selectedPrediction.predictionType,
              selections: this.userPredictionSelections,
              item: this.confirmedItem?.id ?? null
            },
          },
          headers: {
            Authorization: `Bearer ${token}`,
          }
        });
        this.successMessage = response.message;
        this.loading = false;
        const newUserPrediction = {
          episode: this.selectedPrediction.episode,
          predictionType: this.selectedPrediction.predictionType,
          selections: this.userPredictionSelections,
          resourceType: "UserPrediction",
          predictionId: this.selectedPrediction.resourceId,
        };
        const existingUserPredictionIndex = this.userPredictions.findIndex(up => up.predictionId === this.selectedPrediction.resourceId);
        if (existingUserPredictionIndex === -1) {
          this.userPredictions.push(newUserPrediction);
        } else {
          this.userPredictions.splice(existingUserPredictionIndex, 1, newUserPrediction);
        }
        // if there was an item used on this prediction, remove it from the inventory.
        if (this.confirmedItem) {
          const itemIndex = this.userInventory.findIndex(item => item.id === this.confirmedItem.id);
          if (itemIndex !== -1) {
            this.userInventory.splice(itemIndex, 1);
          }
          this.confirmedItem = null;
        }
        this.closeUserPredictionModal();
      } catch (err) {
        this.errorMessage = err.message;
        this.loading = false;
        this.closeUserPredictionModal();
      }
    },
    async deletePrediction() {
      this.resetMessages();
      const confirmation = confirm("Are you sure you want to delete?");
      if (!confirmation) {
        return;
      }
      try {
        let token = (await getAuthSession()).accessToken;
        this.loading = true;
        let response = await apiPost('/games/survivor/predictions/delete', {
          body: {
            prediction: {
              episode: this.adminSelectedPrediction.episode,
              predictionType: this.adminSelectedPrediction.predictionType,
            },
            revokePoints: true,
          },
          headers: {
            Authorization: `Bearer ${token}`,
          }
        });
        this.successMessage = response.message;
        this.loading = false;
        this.closePredictionCompleteModal();
      } catch (err) {
        this.errorMessage = err.message;
        this.loading = false;
        this.closePredictionCompleteModal();
      }
    },
    async submitCompletePrediction() {
      this.resetMessages();
      try {
        let token = (await getAuthSession()).accessToken;
        this.loading = true;
        let response = await apiPost('/games/survivor/predictions/complete', {
          body: {
            prediction: {
              episode: this.adminSelectedPrediction.episode,
              predictionType: this.adminSelectedPrediction.predictionType,
              selections: this.completePredictionSelections,
            },
          },
          headers: {
            Authorization: `Bearer ${token}`,
          }
        });
        this.successMessage = response.message;
        this.loading = false;
        this.closePredictionCompleteModal();
      } catch (err) {
        this.errorMessage = err.message;
        this.loading = false;
        this.closePredictionCompleteModal();
      }
    },
    async getInventory() {
      this.resetMessages();
      try {
        let session = await getAuthSession();
        let jwt = session.accessToken;
        let response = await apiGet(`/games/survivor/userInventory/${session.idTokenPayload.sub}`, {
          headers: {
            Authorization: `Bearer ${jwt}`,
          }
        })
        this.userInventory = response.item?.items ?? [];
        this.successMessage = response.message;
        this.loading = false;
      } catch (err) {
        this.errorMessage = err.message;
        this.loading = false;
      }
    },
    confirmUseItem() {
      this.confirmedItem = this.selectedItem;
      this.closeItemModal();
    },
    resetMessages() {
      this.successMessage = undefined;
      this.errorMessage = undefined;
    },
    closeUserPredictionModal() {
      this.showUserPredictionModal = false;
      this.selectedPrediction = null;
      this.selectedUserPrediction = null;
    },
    closePredictionCompleteModal() {
      this.showPredictionCompleteModal = false;
      this.adminSelectedPrediction = null;
    },
    cancelItemModal() {
      this.confirmedItem = null;
      this.closeItemModal();
    },
    closeItemModal() {
      this.showItemModal = false;
      this.selectedItem = null;
    },
    filterCast(cast, prediction) {
      return cast.filter(survivor => prediction.options.includes(survivor.id));
    },
    filterCastForSelections(cast, selections) {
      return cast.filter(survivor => selections.includes(survivor.id));
    }
  },
  computed: {
    // ALL user predictions (not just current user), filtered to only be completed ones
    filteredUserPredictions() {
      let filteredPredictions = this.allUserPredictions.filter(userPrediction => {
        return this.predictions.find(prediction => prediction.resourceId === userPrediction.predictionId && ( this.showCurrentUserPredictions || prediction.results))
      });
      filteredPredictions.sort((p1, p2) => p1.predictionId > p2.predictionId ? -1 : 1);
      return filteredPredictions;
    },
    completedPredictions() {
      return this.predictions.filter(prediction => prediction.results).sort((p1, p2) => p2.predictBefore - p1.predictBefore);
    },
    closedPredictions() {
      return this.predictions.filter(prediction => !prediction.results && prediction.predictBefore < new Date().getTime());
    },
    ongoingPredictions() {
      return this.predictions.filter(prediction => !prediction.results && prediction.predictBefore > new Date().getTime());
    },
    selectedPredictionInstructions() {
      // ImmunityChallenge, TribalCouncil, Finalist
      if (this.selectedPrediction.predictionType === "ImmunityChallenge") {
        return `Select ${this.maxSelect} survivors. Earn ${this.selectedPrediction.reward} points for each selected survivor that wins the immunity challenge this episode.`;
      } else if (this.selectedPrediction.predictionType === "TribalCouncil") {
        return `Select ${this.maxSelect} survivors. Earn ${this.selectedPrediction.reward} points if a selected survivor gets voted out at tribal council this episode.`;
      } else if (this.selectedPrediction.predictionType === "Finalist") {
        return `Select ${this.maxSelect} survivors. Earn ${this.selectedPrediction.reward} points for each selected survivor that makes it to final tribal.`;
      } else {
        return "";
      }
    },
    selectedItemDescription() {
      if (this.selectedItem?.itemType === "ExtraVoteAdvantage") {
        return `This advantage allows you to select ${this.selectedItem.extraVotes} extra survivors on your next prediction. You will earn points as normal for each survivor that wins the prediction.
        Use it wisely! The last time this can be used is when there are 8 survivors remaining.`;
      } else if (this.selectedItem?.itemType ==="PointMultiplierAdvantage") {
        return `This advantage will multiply the reward points for your next prediction by ${this.selectedItem.multiplier}x. Use it wisely! The last time this can be used is when there are 8 survivors remaining.`;
      } else {
        return "";
      }
    },
    maxSelect() {
      if (this.confirmedItem?.itemType === "ExtraVoteAdvantage") {
        return this.selectedPrediction.select + this.confirmedItem.extraVotes;
      } else {
        return this.selectedPrediction.select;
      }
    },
    activePlayers() {
      return this.leaderboardData.map(entry => {
        return {
          username: entry.username,
          userSub: entry.entityId,
        }
      })
    },
    userSub() {
      return authStore.state?.idTokenPayload?.sub;
    }
  },
  components: {
    LeaderboardGraph,
    ItemEditor,
    InventoryItem,
    Leaderboard,
    SurvivorSelector,
    Modal,
    PredictionEditor,
    PredictionDisplay,
    CastMember,
    Footer,
    Button,
    UserPredictionsTable,
  }
}
</script>

<style lang="scss" scoped>
@import "../scss/colors.scss";
@import "../scss/sizes.scss";

.error-message {
  color: $ps-red;
}

.tabs {
  display: flex;
  margin-bottom: 10px;

  .tab {
    border-top-left-radius: 5px;
    border-top-right-radius: 5px;
    padding: 8px;
    border: 2px solid $ps-light-grey;
    cursor: pointer;
    background-color: $ps-lighter-grey;

    &.active {
      border-bottom: none;
      cursor: auto;
      background-color: $ps-white;
    }
  }
}

.cast-container {
  display: grid;
  grid-template-columns: repeat(4, 1fr);

  @media screen and (max-width: $tablet) {
    grid-template-columns: repeat(3, 1fr);
  }

  @media screen and (max-width: $phone) {
    grid-template-columns: repeat(2, 1fr);
  }
}

.leaderboard {
  .ps-button {
    margin-bottom: 10px;
    display: inline-block;
  }
}
.inventory {
  background-color: $ps-lighter-grey;
  padding: 10px;
  border-radius: 5px;
  border: 2px dashed $ps-light-grey;

  .inventory-item {
    cursor: pointer;
    width: 60px;
  }
}

.admin {
  .controls {
    display: flex;
    justify-content: center;
    gap: 10px;
    .reload, .submit {
      text-decoration: underline;
      cursor: pointer;
    }
  }
  textarea {
    padding: 15px;
    border: none;
    outline: none;
    width: 100%;
    max-width: 100%;
    height: 20em;
    box-sizing: border-box;
    margin-bottom: 10px;
  }
}

.info-banner {
  padding: 10px;
  border-radius: 4px;
  background-color: $ps-red;
  color: $ps-white;
  box-shadow: 0px 2px 3px rgba(100, 100, 100, 0.6);

  a {
    color: $ps-white;
  }
}
</style>