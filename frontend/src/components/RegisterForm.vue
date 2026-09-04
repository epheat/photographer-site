<template>
  <div class="ps-register-form form">
    <p>Welcome to the evanheaton website! Please register with your desired username, email, and a password that you don't use anywhere else.</p>
    <form-field v-model="username" label="Username"/>
    <form-field v-model="email" label="Email"/>
    <p>Password requirements: {{ passwordRequirementsText }}</p>
    <form-field v-model="password" label="Password" :secret="!showPassword" />
    <div class="form-container mb-10">
      <label>Show Password</label>
      <input type="checkbox" v-model="showPassword"/>
    </div>
    <button @click="submit">Register</button>
    <div class="error-message" v-if="localError || errorMessage">{{ localError || errorMessage }}</div>
  </div>
</template>

<script>
import FormField from "./FormField.vue";
import { PASSWORD_REQUIREMENTS_TEXT, validatePassword } from "../auth/passwordPolicy";

export default {
  props: {
    errorMessage: String
  },
  data() {
    return {
      username: "",
      email: "",
      password: "",
      showPassword: false,
      localError: undefined,
      passwordRequirementsText: PASSWORD_REQUIREMENTS_TEXT,
    }
  },
  methods: {
    submit() {
      this.localError = validatePassword(this.password);
      if (this.localError) return;
      this.$emit('submit', {
        username: this.username,
        email: this.email,
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