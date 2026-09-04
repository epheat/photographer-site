<template>
  <div class="ps-editor-page">
    <h1>Post Editor 💻</h1>
    <p class="success-message" v-if="successMessage">{{ successMessage }}</p>
    <div class="options">
      <form-field v-model="title" label="Title" />
    </div>
    <div class="editor">
      <textarea :value="content" @input="update"/>
      <div class="rendered" v-html="compiledMarkdown"></div>
    </div>
    <div class="actions">
      <button @click="submit">Submit</button>
    </div>
    <h1>Image Upload 📷</h1>
    <div class="options">
      <input style="margin-bottom: 10px" type="file" @change="onFileChange"/>
      <form-field v-model="imageTitle" label="Title"/>
      <form-field v-model="imageDescription" label="Description"/>
      <button @click="submitImage" :disabled="!imageData">Upload</button>
    </div>
    <p class="error-message" v-if="errorMessage">{{ errorMessage }}</p>
    <Footer></Footer>
  </div>
</template>

<script>
import Footer from '@/components/Footer.vue';
import { marked } from 'marked';
import FormField from '@/components/FormField.vue';
import { apiGet, apiPost } from '@/utils/api';
import { getAuthSession } from '@/auth/session';
import { authStore } from "@/auth/store";

export default {
  name: 'EditorPage',
  props: {

  },
  data() {
    return {
      title: "",
      content: "",
      imageTitle: "",
      imageDescription: "",
      imageData: undefined,
      imageFileName: undefined,
      uploadUrl: undefined,
      imageId: undefined,
      successMessage: undefined,
      errorMessage: undefined,
    }
  },
  methods: {
    update(e) {
      this.content = e.target.value;
    },
    async submit() {
      try {
        if (!authStore.state.loggedIn) {
          this.errorMessage = "Error: not logged in.";
          return;
        }
        let token = (await getAuthSession()).accessToken;
        let response = await apiPost('/posts/new', {
          body: {
            post: {
              title: this.title,
              content: this.content,
            }
          },
          headers: { Authorization: `Bearer ${token}` }
        });
        this.successMessage = response.message;
      } catch (err) {
        this.errorMessage = err.message;
      }
    },
    onFileChange(event) {
      this.imageData = event.target.files[0];
      this.imageFileName = event.target.files[0].name;
    },
    async submitImage() {
      try {
        if (!authStore.state.loggedIn) {
          this.errorMessage = "Error: not logged in.";
          return;
        }
        let token = (await getAuthSession()).accessToken;
        let getUploadUrlResponse = await apiGet(`/images/uploadUrl/${this.imageFileName}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        this.uploadUrl = getUploadUrlResponse.uploadUrl;
        this.imageId = getUploadUrlResponse.imageId;
        this.successMessage = getUploadUrlResponse.message;

        // now that we have the presigned url, make a put request directly there.
        const uploadResponse = await fetch(this.uploadUrl, {
          method: "PUT",
          headers: {
            "Content-Type": this.imageData.type,
          },
          body: this.imageData,
        });
        console.log(uploadResponse);

        let putImageMetadataResponse = await apiPost('/images/metadata', {
          body: {
            imageId: this.imageId,
            title: this.imageTitle,
            description: this.imageDescription,
          },
          headers: { Authorization: `Bearer ${token}` }
        });
        this.successMessage = putImageMetadataResponse.message;
      } catch (err) {
        this.errorMessage = err.message;
      }
    }
  },
  computed: {
    compiledMarkdown() {
      return marked(this.content, { sanitized: true });
    }
  },
  components: {
    Footer,
    FormField,
  }
}
</script>
<style lang="scss" scoped>
@import "../scss/_colors.scss";

.ps-editor-page {
  padding: 0 10px;

  .options {
    margin: 0 auto;
    max-width: 500px;
  }
  h1 {
    text-align: center;
  }

  .success-message {
    color: $ps-green;
    text-align: center;
  }
  .error-message {
    color: $ps-red;
  }
}
.editor {
  display: flex;
  margin-bottom: 10px;
  textarea {
    flex: 1;
    padding: 15px;
    border: none;
    resize: none;
    outline: none;
  }
  .rendered {
    background-color: $ps-white;
    flex: 1;
    font-family: sans-serif;
    padding: 15px;
  }
}
</style>