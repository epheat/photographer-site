<template>
  <div class="ps-confirmation-form form">
    <p>Enter your username, the 6 digit confirmation code that was sent to your email, and your new password below.</p>
    <form-field
      v-model="username"
      label="Username"
    />
    <form-field
      v-model="code"
      label="Code"
      :secret="!showCode"
    />
    <div class="form-container mb-10">
      <label>Show Code</label>
      <input type="checkbox" v-model="showCode"/>
    </div>
    <p>Password requirements: {{ passwordRequirementsText }}</p>
    <form-field
      v-model="password1"
      label="New password"
      :secret="!showPassword"
    />
    <form-field
      v-model="password2"
      label="Comfirm new password"
      :secret="!showPassword"
    />
    <div class="form-container mb-10">
      <label>Show Passwords</label>
      <input type="checkbox" v-model="showPassword"/>
    </div>
    <button @click="submit">Change password</button>
    <div class="error-message" v-if="localError || errorMessage">{{ localError || errorMessage }}</div>
  </div>
</template>

<script>
import FormField from "./FormField.vue";
import { PASSWORD_REQUIREMENTS_TEXT, validatePassword } from "../auth/passwordPolicy";

export default {
  props: {
    initialUsername: String,
    errorMessage: String
  },
  data() {
    return {
      username: this.initialUsername,
      code: "",
      password1: "",
      password2: "",
      showCode: false,
      showPassword: false,
      localError: undefined,
      passwordRequirementsText: PASSWORD_REQUIREMENTS_TEXT,
    }
  },
  methods: {
    submit() {
      if (this.password1 !== this.password2) {
        this.localError = "New password fields must match.";
        return;
      }
      this.localError = validatePassword(this.password1);
      if (this.localError) return;
      this.$emit('submit', {
        username: this.username,
        code: this.code,
        newPassword1: this.password1,
        newPassword2: this.password2,
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