<template>
  <div class="ps-post-page page">
    <template v-if="loading">
      <h1>Title</h1>
      <p>content loading...</p>
      <spinner></spinner>
    </template>
    <template v-else>
      <h1>{{ post.title }}</h1>
      <h2><span class="by">by</span> {{ post.author }}</h2>
      <div class="actions">
        <router-link to="/posts">Back to posts</router-link>
      </div>
      <h3>{{ localeDateString }}</h3>
      <div class="content" v-html="renderedContent" />
    </template>
    <div class="controls">
      <Button info v-if="post?.previous" @press="goToPost(post?.previous.postId)">⬅️ Previous</Button><div v-else></div>
      <Button info v-if="post?.next" @press="goToPost(post?.next.postId)">Next ➡️</Button><div v-else></div>
    </div>
    <Footer></Footer>
  </div>
</template>

<script>
import Footer from '@/components/Footer.vue';
import Spinner from '@/components/Spinner.vue';
import Button from '@/components/Button.vue';
import { apiGet } from '@/utils/api';
import { marked } from 'marked';

export default {
  name: 'PostsPage',
  props: {

  },
  data() {
    return {
      loading: true,
      post: null
    }
  },
  mounted() {
    this.loadPost(this.$route.params.postId);
  },
  methods: {
    goToPost(postId) {
      this.$router.push(`/posts/${postId}`);
      this.loadPost(postId);
    },
    async loadPost(postId) {
      this.loading = true;
      try {
        const response = await apiGet(`/posts/${postId}`);
        this.post = response.post;
        this.loading = false;
      } catch (err) {
        this.loading = false;
        console.log(err);
      }
    }
  },
  computed: {
    localeDateString() {
      return new Date(this.post.createdDate).toLocaleString();
    },
    renderedContent() {
      if (this.post.content) {
        return marked(this.post.content);
      } else {
        return "";
      }
    }
  },
  components: {
    Footer,
    Spinner,
    Button,
  }
}
</script>
<style lang="scss" scoped>
@import '../scss/colors.scss';
.ps-post-page {

  h2 {
    text-align: center;
    .by {
      font-size: 0.8em;
      font-weight: normal;
    }
  }

  .content ::v-deep(img) {
    margin: 0 auto;
    max-height: 400px;
    display: block;
    max-width: 100%;
  }

  .controls {
    display: flex;
    gap: 20px;
    justify-content: space-between;
  }
}
</style>