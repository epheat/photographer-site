<template>
  <div class="ps-reset-password-form form">
    <p>You must reset your password in order to continue. Please select a password that you don't use anywhere else.</p>
    <p>Password requirements: {{ passwordRequirementsText }}</p>
    <form-field v-model="currentPassword" label="Current Password" :secret="!showPassword" />
    <form-field v-model="newPassword1" label="New Password" :secret="!showPassword" />
    <form-field v-model="newPassword2" label="Confirm Password" :secret="!showPassword" />

    <div class="form-container mb-10">
      <label>Show Passwords</label>
      <input type="checkbox" v-model="showPassword"/>
    </div>
    <button @click="submit">Reset</button>
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
      currentPassword: "",
      newPassword1: "",
      newPassword2: "",
      showPassword: false,
      localError: undefined,
      passwordRequirementsText: PASSWORD_REQUIREMENTS_TEXT,
    }
  },
  methods: {
    submit() {
      if (this.newPassword1 !== this.newPassword2) {
        this.localError = "New password fields must match.";
        return;
      }
      this.localError = validatePassword(this.newPassword1);
      if (this.localError) return;
      this.$emit('submit', {
        currentPassword: this.currentPassword,
        newPassword1: this.newPassword1,
        newPassword2: this.newPassword2
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