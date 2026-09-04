<template>
    <div class="ps-posts-page page">
      <h1>Posts</h1>
      <div class="buttons">
        <Button @press="loadPosts()">Refresh</Button>
        <Button v-if="isAdmin" submit @press="newPost()">New Post</Button>
      </div>
      <spinner v-if="loading"></spinner>
      <post
        v-for="post in posts"
        :key="post.postId"
        v-bind="post"
      />
      <Footer></Footer>
    </div>
</template>

<script>
import { apiGet } from '@/utils/api';
import Footer from '@/components/Footer.vue';
import Spinner from '@/components/Spinner.vue';
import Post from '@/components/Post.vue';
import Button from '@/components/Button.vue';
import { authStore } from "@/auth/store";


export default {
  name: 'PostsPage',
  props: {

  },
  data() {
    return {
      loading: false,
      posts: [],
      isAdmin: authStore.state.isAdmin,
    }
  },
  mounted() {
    this.loadPosts();
  },
  methods: {
    async loadPosts() {
      this.loading = true;
      try {
        const posts = await apiGet('/posts');
        this.posts = posts.items;
        this.loading = false;
      } catch (err) {
        // TODO: error message
        this.loading = false;
        console.log(err);
      }
    },
    newPost() {
      this.$router.push("/posts/new");
    }
  },
  components: {
    Footer,
    Spinner,
    Post,
    Button
  }
}
</script>
<style lang="scss" scoped>
.ps-posts-page {

  .buttons {
    display: flex;
    margin-bottom: 20px;
    gap: 10px;
  }
}
</style>