import { createRouter, createWebHashHistory } from 'vue-router'
import Home from "@/pages/Home.vue";
import PostsPage from "@/pages/PostsPage.vue";
import PostPage from "@/pages/PostPage.vue";
import MusicPage from "@/pages/MusicPage.vue";
import AuthPage from "@/pages/AuthPage.vue";
import EditorPage from "@/pages/EditorPage.vue";
import GamesPage from "@/pages/GamesPage.vue";
import SurvivorGamePage from "@/pages/SurvivorGamePage.vue";
import BattleTDPage from "@/pages/BattleTDPage.vue";
import RecipeListPage from "@/pages/recipes/RecipeListPage.vue";
import RecipePage from "@/pages/recipes/RecipePage.vue";
import RecipeEditorPage from "@/pages/recipes/RecipeEditorPage.vue";

const routes = [
  { path: '/', component: Home },
  { path: '/posts', component: PostsPage },
  { path: '/posts/new', component: EditorPage },
  { path: '/posts/:postId', component: PostPage, props: true },
  { path: '/recipes', component: RecipeListPage },
  { path: '/recipes/new', component: RecipeEditorPage },
  { path: '/recipes/:postId/edit', component: RecipeEditorPage, props: true },
  { path: '/recipes/:postId', component: RecipePage, props: true },
  { path: '/games', component: GamesPage },
  { path: '/games/FantasySurvivor', component: SurvivorGamePage },
  { path: '/games/BattleTD', component: BattleTDPage },
  { path: '/music', component: MusicPage },
  { path: '/auth/:flowRoute', component: AuthPage, props: true },
]
// TODO: don't use hash history
export const router = createRouter({
  history: createWebHashHistory(),
  routes: routes,
});