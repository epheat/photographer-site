<template>
    <div class="ps-login-page page">
      <h1>{{ currentFlow.title }}</h1>
      <p class="success-message" v-if="successMessage">{{ successMessage }}</p>
      <login-form
        v-if="currentFlow.route === 'login'"
        :errorMessage="errorMessage"
        @submit="onSubmit"
      />
      <reset-password-form
        v-if="currentFlow.route === 'reset'"
        :errorMessage="errorMessage"
        @submit="onReset"
      />
      <register-form
        v-if="currentFlow.route === 'register'"
        :errorMessage="errorMessage"
        @submit="onRegister"
      />
      <confirmation-form
        v-if="currentFlow.route === 'confirm'"
        :initialUsername="stashedUsername"
        :errorMessage="errorMessage"
        @submit="onConfirm"
      />
      <forgot-password-form
        v-if="currentFlow.route === 'forgor'"
        :errorMessage="errorMessage"
        @submit="onForgot"
      />
      <forgot-confirmation-form
        v-if="currentFlow.route === 'forgor2'"
        :initialUsername="stashedUsername"
        :errorMessage="errorMessage"
        @submit="onForgotConfirm"
      />
      <Footer></Footer>
    </div>
</template>

<script>
import LoginForm from "../components/LoginForm.vue";
import { signIn, updatePassword, signUp, confirmSignUp, resetPassword, confirmResetPassword } from "aws-amplify/auth";
import { refreshAuthState } from "../auth/session.js";
import ResetPasswordForm from '../components/ResetPasswordForm.vue';
import RegisterForm from '../components/RegisterForm.vue';
import ConfirmationForm from '../components/ConfirmationForm.vue';
import Footer from '../components/Footer.vue';
import ForgotPasswordForm from '../components/ForgotPasswordForm.vue';
import ForgotConfirmationForm from '../components/ForgotConfirmationForm.vue';

const authFlows = [
  {
    route: 'login',
    title: 'Login 🔑',
  },
  {
    route: 'reset',
    title: 'Reset Password 🔄',
  },
  {
    route: 'register',
    title: 'Register 📖',
  },
  {
    route: 'confirm',
    title: 'Confirmation ✅'
  },
  {
    route: 'forgor',
    title: 'Forgot Password 🤕',
  },
  {
    route: 'forgor2',
    title: 'Confirmation ✅'
  }
]

export default {
  name: 'LoginPage',
  props: {
    flowRoute: String
  },
  beforeMount() {

  },
  data() {
    return {
      successMessage: undefined,
      errorMessage: undefined,
      stashedUsername: undefined,
    }
  },
  methods: {
    // Login flow
    async onSubmit(e) {
      this.resetMessages();
      try {
        let result = await signIn({ username: e.username, password: e.password });
        if (result.nextStep?.signInStep === "CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED") {
          this.$router.push({ path: 'reset' });
        } else {
          await refreshAuthState();
          this.$router.push('/');
        }
      } catch (err) {
        this.errorMessage = err.message;
      }
    },
    // Reset password flow
    async onReset(e) {
      this.resetMessages();
      if (e.newPassword1 !== e.newPassword2) {
        this.errorMessage = "New password fields must match.";
        return;
      }
      try {
        await updatePassword({ oldPassword: e.currentPassword, newPassword: e.newPassword1 });
      } catch (err) {
        this.errorMessage = err.message;
      }
    },
    // Registration flow
    async onRegister(e) {
      this.resetMessages();
      try {
        let signUpResult = await signUp({
          username: e.username,
          password: e.password,
          options: {
            userAttributes: {
              email: e.email
            }
          }
        })
        let codeDeliveryDetails = signUpResult.nextStep?.codeDeliveryDetails;
        if (codeDeliveryDetails?.deliveryMedium === "EMAIL") {
          this.stashedUsername = e.username;
          this.successMessage = `Sent a code to your email ${codeDeliveryDetails.destination}`;
          this.$router.push({ path: 'confirm' });
        }
      } catch (err) {
        this.errorMessage = err.message;
      }
    },
    // Registration part2: confirmation flow
    async onConfirm(e) {
      this.resetMessages();
      try {
        let confirmationResult = await confirmSignUp({ username: e.username, confirmationCode: e.code });
        if (confirmationResult.isSignUpComplete) {
          this.$router.push({ path: 'login' });
        }
      } catch (err) {
        this.errorMessage = err.message;
      }
    },
    // Forgot password flow (I forgor)
    async onForgot(e) {
      this.resetMessages();
      try {
        let forgotResult = await resetPassword({ username: e.username });
        let codeDeliveryDetails = forgotResult.nextStep?.codeDeliveryDetails;
        if (codeDeliveryDetails?.deliveryMedium === "EMAIL") {
          this.stashedUsername = e.username;
          this.successMessage = `Sent a code to your email ${codeDeliveryDetails.destination}`;
          this.$router.push({ path: 'forgor2' });
        }
      } catch (err) {
        this.errorMessage = err.message;
      }
    },
    // Forgot password part2: confirmation flow
    async onForgotConfirm(e) {
      this.resetMessages();
      if (e.newPassword1 !== e.newPassword2) {
        this.errorMessage = "New password fields must match.";
        return;
      }
      try {
        await confirmResetPassword({ username: e.username, confirmationCode: e.code, newPassword: e.newPassword1 });
        this.successMessage = "Successfully reset password! 😇 Try logging in now...";
        this.$router.push({ path: 'login' });
      } catch (err) {
        this.errorMessage = err.message;
      }
    },
    resetMessages() {
      this.successMessage = undefined;
      this.errorMessage = undefined;
    }
  },
  computed: {
    currentFlow() {
      return authFlows.find(el => el.route === this.flowRoute)
    }
  },
  components: {
    LoginForm,
    ResetPasswordForm,
    RegisterForm,
    ConfirmationForm,
    Footer,
    ForgotPasswordForm,
    ForgotConfirmationForm,
  }
}
</script>

<style lang="scss">
@import "../scss/colors.scss";

.ps-login-page {
  h1 {
    margin: 0;
    padding: 10px 0px;
    text-align: center;
  }
}

.form {
  display: flex;
  flex-direction: column;
  background-color: $ps-true-white;
  max-width: 400px;
  padding: 10px;
  margin: 0 auto;
  box-shadow: 0px 2px 4px rgba(20, 20, 20, 0.5);

  button {
    height: 30px;
    margin-bottom: 10px;
  }
}

.error-message {
  color: $ps-red;
}
.success-message {
  color: $ps-green;
  text-align: center;
}

</style>