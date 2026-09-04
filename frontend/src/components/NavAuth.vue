<template>
  <div class="ps-nav-auth">
    <div class="ps-nav-container" v-if="!authStoreState.loggedIn">
      <router-link :to="{ path: '/auth/login', query: { redirect: $route.fullPath } }">Login</router-link>
      <router-link :to="{ path: '/auth/register', query: { redirect: $route.fullPath } }">Register</router-link>
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
import { signOut } from 'aws-amplify/auth';

export default {
  data() {
    return {
      authStoreState: authStore.state,
    }
  },
  methods: {
    async logout() {
      try {
        await signOut();
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