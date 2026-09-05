import { createApp } from 'vue'
import { router } from './router/router';
import App from './App.vue'
import { Amplify } from 'aws-amplify';

// see: https://docs.amplify.aws/javascript/build-a-backend/troubleshooting/migrate-from-javascript-v5-to-v6/
Amplify.configure({
    Auth: {
        Cognito: {
            userPoolId: process.env.VUE_APP_COGNITO_USERPOOL_ID as string,
            userPoolClientId: process.env.VUE_APP_COGNITO_CLIENT_ID as string,
        },
    },
    API: {
        REST: {
            "ps-api": {
                endpoint: process.env.VUE_APP_API_ENDPOINT as string,
                region: process.env.VUE_APP_COGNITO_REGION || "us-east-1",
            },
        },
    },
})

const app = createApp(App)

app.use(router)
app.mount('#app')
