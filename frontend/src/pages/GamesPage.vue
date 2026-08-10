<template>
  <div class="ps-music-page page">
    <h1>Games</h1>
    <p>Click on a game to join (must be signed in to play).</p>
    <div class="game-container" @click="onClickGame('FantasySurvivor')">
      <img class="game-image" alt="survivor logo" src="@/assets/survivor_logo.png"/>
      <div class="game-text">
        <div class="game-title">FantasySurvivor</div>
        <p class="game-description">Follow along with the latest Survivor season as you predict each week who will win challenges, who will lose, and who will get voted out. In this game, fire represents your life. When your fire's gone, so are you. Requires an account to play.</p>
      </div>
    </div>
    <div class="game-container" @click="onClickGame('BattleTD')">
      <img class="game-image" alt="survivor logo" src="@/assets/BattleTD.png"/>
      <div class="game-text">
        <div class="game-title">BattleTD</div>
        <p class="game-description">Protect your castle from increasingly strong waves of monsters in this tower-defense auto-battler game. Requires an account to play.</p>
      </div>
    </div>
    <div class="game-container" @click="onClickGame('MukHunt')">
      <img class="game-image" alt="muk hunt logo" src="@/assets/muk_hunt.png"/>
      <div class="game-text">
        <div class="game-title">MukHunt</div>
        <p class="game-description">A photo scavenger hunt around Mukilteo, WA. Track down each spot on the list, take a photo (a selfie, preferably), and rack up points for the harder finds. Running the weekend of July 15th, 2027. Requires an account to play.</p>
      </div>
    </div>

    <Footer></Footer>
  </div>
</template>

<script>
import Footer from '../components/Footer.vue';

export default {
  name: "GamesPage",
  props: {

  },
  methods: {
    onClickGame(name) {
      this.$router.push(`/games/${name}`);
    },
  },
  components: {
    Footer,
  }
}
</script>

<style lang="scss" scoped>
@import "../scss/colors.scss";
@import "../scss/sizes.scss";

.game-container {
  display: flex;
  margin: 5px 5px 10px;
  padding: 10px;
  background-color: $ps-lighter-grey;
  box-shadow: 0px 4px 4px #777777;

  transition: scale 0.2s;
  cursor: pointer;
  justify-content: center;

  @media screen and (max-width: $phone) {
    flex-direction: column;
    .game-image {
      margin: 0 auto 10px;
    }
  }

  &:hover {
    scale: 1.03;
  }

  .game-image {
    display: inline-block;
    flex-basis: 50px;
    max-width: 100px;
    object-fit: contain;
    flex-shrink: 0;
    background-color: $ps-offwhite;
  }
  .game-text {
    margin-left: 10px;
    flex-shrink: 1;
    .game-title {
      font-weight: bold;
    }
  }
}
</style>