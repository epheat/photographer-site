<template>
  <div class="ps-login-form form">
    <form-field v-model="username" label="Username" />
    <form-field v-model="password" label="Password" :secret="!showPassword" />
    <div class="form-container mb-10">
      <label>Show Password</label>
      <input type="checkbox" v-model="showPassword"/>
    </div>
    <div class="form-container mb-10">
      <div>Forgot Password? Click <router-link :to="{ path: '/auth/forgor', query: $route.query }">here.</router-link></div>
    </div>
    <button @click="submit">Login</button>
    <div class="error-message" v-if="errorMessage">{{ errorMessage }}</div>
  </div>
</template>

<script>
import FormField from "./FormField.vue";

export default {
  props: {
    errorMessage: String
  },
  data() {
    return {
      username: "",
      password: "",
      showPassword: false,
    }
  },
  methods: {
    submit() {
      this.$emit('submit', {
        username: this.username,
        password: this.password
      })
    }
  },
  components: {
    'form-field': FormField
  }
}
</script>

<style lang="scss" scoped>

</style>