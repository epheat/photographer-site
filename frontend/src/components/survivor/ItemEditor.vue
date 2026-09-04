<template>
  <div class="item-editor">
    <div class="error-message" v-if="errorMessage">{{ errorMessage }}</div>
    <Spinner v-if="loading"></Spinner>
    <div class="inventories">
      <div class="user-inventory" v-for="user in users" :key="user.userSub">
        <span>{{ user.username }}</span> -
        <InventoryItem v-for="item in getInventory(user.userSub)" :key="item.id" v-bind="item"/>
        <span class="none" v-if="!getInventory(user.userSub).length">none</span>
      </div>
    </div>
    <div class="options">
      <FormSelect
          v-model="userSub"
          :options="users.map(user => { return { value: user.userSub, label: user.username }})"
          label="User"
      />
      <div class="item-options">
        <FormSelect v-model="itemType" :options="[
            { value: 'ExtraVoteAdvantage', label: 'Extra vote' },
            { value: 'PointMultiplierAdvantage', label: 'Point multiplier' },
        ]" label="ItemType"/>
        <FormField v-if="itemType === 'ExtraVoteAdvantage'" v-model="extraVotes" label="ExtraVotes"/>
        <FormField v-else-if="itemType === 'PointMultiplierAdvantage'" v-model="multiplier" label="Multiplier"/>
        <FormField v-else disabled label="Property"></FormField>
      </div>
      <FormField v-model="message" label="Message"/>
    </div>
    <div class="buttons">
      <Button @press="getInventories">Refresh</Button>
      <Button submit @press="submitItem">Submit</Button>
    </div>
  </div>
</template>

<script>
import FormField from "@/components/FormField";
import FormSelect from "@/components/FormSelect";
import Button from "@/components/Button";
import { apiGet, apiPost } from "@/utils/api";
import { getAuthSession } from "@/auth/session";
import InventoryItem from "@/components/survivor/InventoryItem";
import Spinner from "@/components/Spinner";

export default {
  name: "ItemEditor",
  props: {
    users: Array, // [{ username: xxx, userSub: yyy }]
  },
  data() {
    return {
      inventories: [],
      errorMessage: null,
      loading: false,
      userSub: "",
      itemType: "",
      extraVotes: 1,
      multiplier: 1.5,
      message: null,
    }
  },
  mounted() {
    this.getInventories();
  },
  methods: {
    async getInventories() {
      this.loading = true;
      try {
        let token = (await getAuthSession()).accessToken;
        let response = await apiGet('/games/survivor/userInventory', {
          headers: {
            Authorization: `Bearer ${token}`,
          }
        })
        this.inventories = response.items;
        this.loading = false;
      } catch (err) {
        this.errorMessage = err.message;
        this.loading = false;
      }
    },
    async submitItem() {
      this.loading = true;
      let item = {
        itemType: this.itemType,
        message: this.message,
      };
      if (this.itemType === 'ExtraVoteAdvantage') {
        item.extraVotes = parseInt(this.extraVotes);
      } else if (this.itemType === 'PointMultiplierAdvantage') {
        item.multiplier = parseFloat(this.multiplier);
      }
      try {
        let token = (await getAuthSession()).accessToken;
        this.loading = true;
        await apiPost(`/games/survivor/items/${this.userSub}`, {
          body: {
            item: item,
          },
          headers: {
            Authorization: `Bearer ${token}`,
          }
        });
        await this.getInventories();
      } catch (err) {
        this.errorMessage = err.message;
        this.loading = false;
      }
    },
    getInventory(userSub) {
      return this.inventories.find(inventory => inventory.entityId === userSub)?.items || [];
    }
  },
  components: {
    Spinner,
    InventoryItem,
    Button,
    FormField,
    FormSelect,
  }
}
</script>

<style lang="scss" scoped>
@import "../../scss/colors.scss";
@import "../../scss/sizes.scss";

.item-editor {
  padding: 10px;
  background-color: $ps-lighter-grey;
}

.users {
  margin-bottom: 10px;
}
.inventories {
  margin-bottom: 10px;

  .user-inventory {
    display: flex;
    align-items: center;
    gap: 5px;
    img {
      height: 40px;
    }

    .none {
      color: $ps-light-grey;
    }
  }
}
.options {
  display: grid;
  grid-template-columns: 1fr 2fr 1fr;
  grid-gap: 5px;

  .item-options {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    grid-gap: 5px;
    @media screen and (max-width: $phone) {
      grid-template-columns: 1fr;
    }
  }

  @media screen and (max-width: $tablet) {
    grid-template-columns: 1fr;
  }
}

.buttons {
  margin-top: 5px;
  display: flex;
  justify-content: space-around;
  .ps-button {
    display: inline-block;
  }

}

</style>