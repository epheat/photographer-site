<template>
  <div class="ps-nav-auth">
    <div class="ps-nav-container" v-if="!authStoreState.loggedIn">
      <router-link to="/auth/login">Login</router-link>
      <router-link to="/auth/register">Register</router-link>
    </div>
    <div class="ps-nav-container" v-else>
      <div class="nav-icon"></div>
      <div class="nav-welcome">Hello, {{ authStoreState.user.username }}!</div>
      <a href="#" @click="logout">Logout</a>
    </div>
  </div>
</template>

<script>
import { authStore } from '@/auth/store';
import { Auth } from 'aws-amplify';

export default {
  data() {
    return {
      authStoreState: authStore.state,
    }
  },
  methods: {
    async logout() {
      try {
        await Auth.signOut();
        authStore.setLoggedOut();
        this.$router.push('/');
      } catch (err) {
        console.log(err);
      }
    }
  }
}
</script>

<style lang="scss" scoped>
@import "../scss/_colors.scss";

.ps-nav-auth {
  font-size: 0.8em;
  padding-top: 3px;
  a {
    text-decoration: none;
    color: $ps-daisy;
  }
}

.ps-nav-container {
  display: flex;
  justify-content: space-around;

  .nav-welcome {
    color: $ps-light-grey;
  }
}
</style>