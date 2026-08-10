<template>
  <div class="page mukhunt-page">
    <div class="masthead">
      <h1>Muk Hunt</h1>
      <div class="kicker">Mukilteo, WA</div>
    </div>

    <div class="tabs">
      <div class="tab" :class="{active: currentTab === 0}" @click="setTab(0)">Hunt</div>
      <div class="tab" :class="{active: currentTab === 1}" @click="setTab(1)">My Photos</div>
      <div class="tab" v-if="shouldShowAdminPage" :class="{active: currentTab === 2}" @click="setTab(2)">Admin</div>
    </div>

    <div class="banner login" v-if="!loggedIn">
      This game requires an account to play. Please <router-link to="/auth/login">Login</router-link> or <router-link to="/auth/register">Register</router-link>.
    </div>
    <div class="banner error" v-if="errorMessage">{{ errorMessage }}</div>
    <div class="banner success" v-if="successMessage">{{ successMessage }}</div>
    <div class="loading" v-if="loading"><Spinner /></div>

    <SubmitPhotoModal
      :show="showSubmitModal"
      :clue="selectedClue"
      :existingSubmission="selectedClue ? submissionByClueId[selectedClue.clueId] : null"
      :revealedHint="selectedClue ? hintsUsed[selectedClue.clueId] : null"
      @close="closeSubmitModal"
      @submitted="onSubmitted"
      @deleted="onDeleted"
      @revealed="onHintRevealed"
    />

    <Modal :show="showDeleteModal" @close="closeDeleteModal">
      <template #header>
        <h2>Delete the "{{ cluePendingDelete?.title }}" clue?</h2>
        <p>It stops showing up in the hunt, but the record sticks around so any photos submitted against it can still be matched up later.</p>
      </template>
      <div></div>
      <template #actions>
        <Button cancel @press="deleteClue">Delete</Button>
      </template>
    </Modal>

    <div class="tab-content" v-if="currentTab === 0">
      <template v-if="hunt">
        <p class="hunt-blurb">{{ hunt.description }}</p>

        <!-- a compact line rather than a boxed panel: the window only really matters when the hunt
             isn't open, so open state is a quiet close-time reminder and the rest is a plain notice -->
        <div class="hunt-status" :class="huntState">
          <template v-if="huntState === 'open'">Closes {{ formatDate(hunt.endDate) }}</template>
          <template v-else-if="huntState === 'upcoming'">Opens {{ formatDate(hunt.startDate) }} &mdash; check back then!</template>
          <template v-else>This hunt has closed. Thanks for playing!</template>
        </div>

        <div class="stats" v-if="clues.length">
          <div class="stat">
            <div class="stat-value">{{ completedCount }}/{{ clues.length }}</div>
            <div class="stat-label">Found</div>
          </div>
          <div class="stat">
            <div class="stat-value">{{ myPoints }}</div>
            <div class="stat-label">Points</div>
          </div>
        </div>

        <template v-if="clues.length">
          <ClueCard
            v-for="clue in clues"
            :key="clue.clueId"
            :clue="clue"
            :submission="submissionByClueId[clue.clueId]"
            :revealedHint="hintsUsed[clue.clueId]"
            @press="openSubmitModal(clue)"
          />
        </template>
        <div class="empty" v-else-if="!loading">No clues have been posted yet. Check back closer to the hunt.</div>
      </template>
      <div class="empty" v-else-if="!loading && loggedIn">Couldn't load the hunt.</div>
    </div>

    <div class="tab-content" v-if="currentTab === 1">
      <template v-if="submissions.length">
        <div class="stats">
          <div class="stat">
            <div class="stat-value">{{ submissions.length }}</div>
            <div class="stat-label">Photos</div>
          </div>
          <div class="stat">
            <div class="stat-value">{{ myPoints }}</div>
            <div class="stat-label">Points</div>
          </div>
        </div>
        <div class="photo-grid">
          <div class="photo-card" v-for="submission in mySubmissionsInClueOrder" :key="submission.clueId">
            <img :src="submission.imageUrl" :alt="clueTitle(submission.clueId)" />
            <div class="photo-body">
              <div class="photo-title">{{ clueTitle(submission.clueId) }}</div>
              <p class="photo-caption" v-if="submission.caption">&ldquo;{{ submission.caption }}&rdquo;</p>
              <div class="photo-footer">
                <span class="photo-points">{{ submission.pointsAwarded }} pts</span>
                <Button info @press="openSubmitModalForSubmission(submission)">Replace</Button>
              </div>
            </div>
          </div>
        </div>
      </template>
      <div class="empty" v-else-if="!loading">
        No photos yet. Head to the Hunt tab and pick a clue to get started.
      </div>
    </div>

    <div class="tab-content" v-if="currentTab === 2 && shouldShowAdminPage">
      <div class="section-heading">
        <h2>Clues</h2>
        <Button info @press="getHunt">Refresh</Button>
      </div>

      <div class="clue-row" v-for="clue in clues" :key="clue.clueId">
        <div class="row-main">
          <div class="row-title">
            <span class="row-order">{{ clue.sortOrder }}</span>
            {{ clue.title }}
          </div>
          <code class="row-id">{{ clue.clueId }}</code>
          <div class="row-meta">{{ clue.points }} pts<template v-if="clue.selfie"> &middot; selfie</template></div>
        </div>
        <div class="row-actions">
          <Button info @press="editClue(clue)">Edit</Button>
          <Button cancel @press="openDeleteModal(clue)">Delete</Button>
        </div>
      </div>
      <div class="empty" v-if="!clues.length">No clues yet. Create the first one below.</div>

      <h2>{{ editingClueId ? `Edit "${editingClueId}"` : "New clue" }}</h2>
      <div class="clue-form">
        <label class="field">
          <span class="field-label">Clue id</span>
          <input type="text" v-model="clueForm.clueId" :disabled="editingClueId !== null" placeholder="lighthouse-selfie" />
        </label>
        <!-- the id is baked into the sort key of every submission, so it can't change once it exists -->
        <p class="field-hint" v-if="editingClueId === null">Lowercase letters, numbers, and single hyphens. Permanent once players start submitting, so pick something you'll still recognize later.</p>
        <p class="field-hint" v-else>The id can't change &mdash; photos already submitted are filed under it.</p>

        <label class="field">
          <span class="field-label">Title</span>
          <input type="text" v-model="clueForm.title" placeholder="Lighthouse selfie" />
        </label>

        <label class="field">
          <span class="field-label">Description</span>
          <textarea v-model="clueForm.description" rows="3" placeholder="Take a selfie in front of the Mukilteo Lighthouse."></textarea>
        </label>

        <div class="field-row">
          <label class="field">
            <span class="field-label">Points</span>
            <input type="number" inputmode="numeric" v-model.number="clueForm.points" min="0" />
          </label>
          <label class="field">
            <span class="field-label">Order</span>
            <input type="number" inputmode="numeric" v-model.number="clueForm.sortOrder" />
          </label>
        </div>

        <label class="checkbox-field">
          <input type="checkbox" v-model="clueForm.selfie" />
          <span>Prefer a selfie &mdash; opens the front camera on phones</span>
        </label>

        <label class="field">
          <span class="field-label">Hint <i>(optional)</i></span>
          <textarea v-model="clueForm.hint" rows="2" placeholder="It's the one with the red roof."></textarea>
        </label>
        <div class="field-row" v-if="clueForm.hint.trim()">
          <label class="field">
            <span class="field-label">Hint cost</span>
            <input type="number" inputmode="numeric" v-model.number="clueForm.hintPenalty" min="0" :max="clueForm.points" />
          </label>
          <div class="field hint-explainer">
            Deducted if a player reads the hint before submitting. Worth {{ Math.max(0, (Number(clueForm.points) || 0) - (Number(clueForm.hintPenalty) || 0)) }} pts with the hint.
          </div>
        </div>

        <div class="form-actions">
          <Button submit @press="saveClue">{{ editingClueId ? "Save changes" : "Create clue" }}</Button>
          <Button info v-if="editingClueId !== null" @press="resetClueForm">Cancel</Button>
        </div>
      </div>
    </div>

    <Footer></Footer>
  </div>
</template>

<script>
import { defineComponent } from "vue";
import { API, Auth } from "aws-amplify";
import { authStore } from "@/auth/store";
import Button from "@/components/Button.vue";
import Modal from "@/components/Modal.vue";
import Footer from "@/components/Footer.vue";
import Spinner from "@/components/Spinner.vue";
import ClueCard from "@/components/mukhunt/ClueCard.vue";
import SubmitPhotoModal from "@/components/mukhunt/SubmitPhotoModal.vue";

// mirrors the server-side check in lib/lambda/mukhunt.ts, so a bad id is caught before the round trip.
const CLUE_ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const emptyClueForm = () => ({
  clueId: "",
  title: "",
  description: "",
  points: 10,
  sortOrder: 10,
  selfie: false,
  hint: "",
  hintPenalty: 0,
});

// defineComponent rather than a bare options object: the routes array is typed as
// RouteRecordRaw[], and a bare object with this data shape doesn't infer as a valid route
// component, which surfaces as a type error pointing at router.ts rather than at this file.
export default defineComponent({
  name: "MukHuntPage",
  data() {
    return {
      currentTab: 0,
      errorMessage: "",
      successMessage: "",
      loading: false,
      loggedIn: authStore.state.loggedIn,
      hunt: null,
      clues: [],
      submissions: [],
      userPoints: { points: 0, pointHistory: [] },
      // clueId -> { text, penalty } for hints this player has already paid for
      hintsUsed: {},
      showSubmitModal: false,
      selectedClue: null,

      // admin only
      shouldShowAdminPage: authStore.state.isAdmin,
      clueForm: emptyClueForm(),
      editingClueId: null,
      showDeleteModal: false,
      cluePendingDelete: null,
    }
  },
  computed: {
    totalPoints() {
      return this.clues.reduce((sum, clue) => sum + (clue.points ?? 0), 0);
    },
    submissionByClueId() {
      return this.submissions.reduce((map, submission) => {
        map[submission.clueId] = submission;
        return map;
      }, {});
    },
    myPoints() {
      return this.userPoints?.points ?? 0;
    },
    // only counts clues that still exist, so a soft-deleted one doesn't inflate the total
    completedCount() {
      return this.clues.filter(clue => this.submissionByClueId[clue.clueId]).length;
    },
    mySubmissionsInClueOrder() {
      const order = this.clues.map(clue => clue.clueId);
      return [...this.submissions].sort((a, b) => order.indexOf(a.clueId) - order.indexOf(b.clueId));
    },
    huntState() {
      if (!this.hunt) return "";
      const now = new Date().getTime();
      if (now < this.hunt.startDate) return "upcoming";
      return now <= this.hunt.endDate ? "open" : "closed";
    },
  },
  mounted() {
    if (this.loggedIn) {
      this.getHunt();
      this.getMySubmissions();
    }
  },
  methods: {
    setTab(tab) {
      this.resetMessages();
      this.currentTab = tab;
    },
    resetMessages() {
      this.errorMessage = "";
      this.successMessage = "";
    },
    formatDate(epochMs) {
      return new Date(epochMs).toLocaleString([], {
        weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
      });
    },
    async getHunt() {
      this.resetMessages();
      try {
        let token = (await Auth.currentSession()).getAccessToken().getJwtToken();
        this.loading = true;
        let response = await API.get('ps-api', '/games/mukhunt/hunt', {
          headers: {
            Authorization: `Bearer ${token}`,
          }
        });
        this.hunt = response.hunt;
        this.clues = response.clues ?? [];
        this.loading = false;
      } catch (err) {
        this.errorMessage = this.readError(err);
        this.loading = false;
      }
    },
    // amplify wraps a non-2xx into an axios-style error, where the handler's own message is nested.
    readError(err) {
      return err.response?.data?.message ?? err.message;
    },
    async getMySubmissions() {
      try {
        let token = (await Auth.currentSession()).getAccessToken().getJwtToken();
        let response = await API.get('ps-api', '/games/mukhunt/submissions', {
          headers: {
            Authorization: `Bearer ${token}`,
          }
        });
        this.submissions = response.submissions ?? [];
        this.userPoints = response.userPoints ?? { points: 0, pointHistory: [] };
        this.hintsUsed = response.hintsUsed ?? {};
      } catch (err) {
        this.errorMessage = this.readError(err);
      }
    },
    clueTitle(clueId) {
      // a submission can outlive its clue, since deleting one only flags it
      return this.clues.find(clue => clue.clueId === clueId)?.title ?? clueId;
    },
    openSubmitModal(clue) {
      this.resetMessages();
      this.selectedClue = clue;
      this.showSubmitModal = true;
    },
    openSubmitModalForSubmission(submission) {
      const clue = this.clues.find(c => c.clueId === submission.clueId);
      if (clue) this.openSubmitModal(clue);
    },
    closeSubmitModal() {
      this.showSubmitModal = false;
      this.selectedClue = null;
    },
    onSubmitted(response) {
      this.closeSubmitModal();
      this.successMessage = `Nice one! ${response.totalPoints} points so far.`;
      this.getMySubmissions();
    },
    onHintRevealed({ clueId, hint }) {
      this.hintsUsed = { ...this.hintsUsed, [clueId]: hint };
    },
    onDeleted(response) {
      this.closeSubmitModal();
      this.successMessage = `Photo deleted. ${response.totalPoints} points remaining.`;
      this.getMySubmissions();
    },
    editClue(clue) {
      this.resetMessages();
      this.clueForm = {
        clueId: clue.clueId,
        title: clue.title,
        description: clue.description,
        points: clue.points,
        sortOrder: clue.sortOrder ?? 0,
        selfie: clue.selfie ?? false,
        // getHunt only returns hint text to admins, so this is populated for the people who can edit
        hint: clue.hint ?? "",
        hintPenalty: clue.hintPenalty ?? 0,
      };
      this.editingClueId = clue.clueId;
    },
    resetClueForm() {
      this.resetMessages();
      this.clueForm = emptyClueForm();
      this.editingClueId = null;
    },
    async saveClue() {
      this.resetMessages();
      const clue = {
        clueId: this.clueForm.clueId.trim(),
        title: this.clueForm.title.trim(),
        description: this.clueForm.description.trim(),
        points: Number(this.clueForm.points),
        sortOrder: Number(this.clueForm.sortOrder),
        selfie: this.clueForm.selfie,
        hint: this.clueForm.hint.trim(),
        hintPenalty: Number(this.clueForm.hintPenalty) || 0,
      };
      if (!CLUE_ID_PATTERN.test(clue.clueId)) {
        this.errorMessage = 'Clue id must be lowercase letters, numbers, and single hyphens, e.g. "lighthouse-selfie".';
        return;
      }
      if (!clue.title || !clue.description) {
        this.errorMessage = "A clue needs a title and a description.";
        return;
      }
      if (Number.isNaN(clue.points) || clue.points < 0) {
        this.errorMessage = "Points must be a non-negative number.";
        return;
      }
      if (clue.hint && clue.hintPenalty > clue.points) {
        this.errorMessage = `Hint cost can't exceed the clue's ${clue.points} points.`;
        return;
      }
      try {
        let token = (await Auth.currentSession()).getAccessToken().getJwtToken();
        this.loading = true;
        let response = await API.post('ps-api', '/games/mukhunt/clues', {
          body: {
            clue: clue,
            // editing replaces the whole item; creating stays conditional so a reused id is rejected.
            allowOverwrite: this.editingClueId !== null,
          },
          headers: {
            Authorization: `Bearer ${token}`,
          }
        });
        this.successMessage = `Saved "${response.clueId}".`;
        this.loading = false;
        this.resetClueForm();
        this.getHunt();
      } catch (err) {
        this.errorMessage = this.readError(err);
        this.loading = false;
      }
    },
    openDeleteModal(clue) {
      this.resetMessages();
      this.cluePendingDelete = clue;
      this.showDeleteModal = true;
    },
    closeDeleteModal() {
      this.showDeleteModal = false;
      this.cluePendingDelete = null;
    },
    async deleteClue() {
      const clueId = this.cluePendingDelete?.clueId;
      this.closeDeleteModal();
      if (!clueId) return;
      this.resetMessages();
      try {
        let token = (await Auth.currentSession()).getAccessToken().getJwtToken();
        this.loading = true;
        await API.post('ps-api', '/games/mukhunt/clues/delete', {
          body: { clueId: clueId },
          headers: {
            Authorization: `Bearer ${token}`,
          }
        });
        this.successMessage = `Deleted "${clueId}".`;
        this.loading = false;
        if (this.editingClueId === clueId) {
          this.resetClueForm();
        }
        this.getHunt();
      } catch (err) {
        this.errorMessage = this.readError(err);
        this.loading = false;
      }
    },
  },
  components: {
    Button,
    Modal,
    Footer,
    Spinner,
    ClueCard,
    SubmitPhotoModal,
  }
})
</script>

<style lang="scss" scoped>
@import "../scss/mukhunt.scss";

.mukhunt-page {
  color: $mh-ink;
}

.masthead {
  // matches the default h1 top margin the other pages get (0.67em at their 32px h1), which our
  // font-size override and wrapper div would otherwise drop
  margin-top: 21px;
  margin-bottom: 16px;
  // the site centers h1 globally, so the kicker follows it rather than hanging off to the left
  text-align: center;

  h1 {
    margin: 0;
    font-size: 2.1rem;
    letter-spacing: -0.02em;
  }
  .kicker {
    @include mh-label;
    margin-top: 4px;
    color: $mh-pop;
  }
}

.tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;

  .tab {
    @include mh-tappable;
    @include mh-label;
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    color: $mh-ink;
    background-color: transparent;
    border: 2px solid $mh-ink;
    border-radius: $mh-radius;
    cursor: pointer;

    &.active {
      background-color: $mh-ink;
      color: $mh-paper;
      cursor: default;
    }
  }

  @media screen and (min-width: $mh-wide) {
    .tab {
      flex: 0 0 auto;
      padding: 0 22px;
    }
  }
}

.banner {
  @include mh-panel($bg: white, $offset: 2px);
  padding: 12px;
  margin-bottom: 14px;
  font-size: 0.95rem;

  &.login {
    border-color: $mh-pop;
    box-shadow: 2px 2px 0 $mh-pop;
  }

  a {
    color: $mh-pop;
    font-weight: 700;
  }
  &.error {
    border-color: $mh-pop;
    box-shadow: 2px 2px 0 $mh-pop;
    color: $mh-pop;
  }
  &.success {
    border-color: $ps-green;
    box-shadow: 2px 2px 0 $ps-green;
  }
}

.loading {
  margin: 20px 0;
}

.empty {
  padding: 20px 14px;
  margin-bottom: 12px;
  text-align: center;
  color: $mh-muted;
  border: 2px dashed $mh-rule;
  border-radius: $mh-radius;
}

.hunt-blurb {
  margin: 0 0 14px;
  font-size: 1.05rem;
  line-height: 1.45;
}

.hunt-status {
  margin-bottom: 14px;
  font-size: 0.9rem;

  // open is the common case and just a quiet reminder, so it stays muted; the other two are
  // actionable ("come back later" / "you missed it") and get a coloured pill
  &.open {
    color: $mh-muted;
  }
  &.upcoming, &.closed {
    display: inline-block;
    padding: 6px 12px;
    border-radius: 20px;
    font-weight: 700;
    color: white;
  }
  &.upcoming { background-color: $mh-blue; }
  &.closed { background-color: $mh-muted; }
}

.stats {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;

  .stat {
    @include mh-panel($bg: $mh-ink, $offset: 2px);
    flex: 1;
    padding: 10px;
    text-align: center;

    .stat-value {
      font-family: $mh-mono;
      font-size: 1.6rem;
      font-weight: 700;
      line-height: 1;
      color: $mh-accent;
    }
    .stat-label {
      @include mh-label;
      color: $mh-paper;
      margin-top: 4px;
    }
  }
}

.photo-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;

  // one per row on a phone so the photo stays big enough to actually look at
  @media screen and (min-width: $mh-wide) {
    grid-template-columns: repeat(2, 1fr);
  }

  .photo-card {
    @include mh-panel($bg: white);
    overflow: hidden;

    img {
      display: block;
      width: 100%;
      aspect-ratio: 4 / 3;
      object-fit: cover;
      border-bottom: 2px solid $mh-ink;
    }
    .photo-body {
      padding: 10px 12px 12px;
    }
    .photo-title {
      font-weight: 700;
    }
    .photo-caption {
      margin: 4px 0 0;
      font-size: 0.9rem;
      line-height: 1.4;
      color: $mh-muted;
    }
    .photo-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      margin-top: 10px;
    }
    .photo-points {
      @include mh-label;
      color: $mh-ink;
    }
  }
}

.section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;

  h2 { margin: 0; }
}

h2 {
  font-size: 1.3rem;
  margin: 24px 0 12px;
}

.clue-row {
  @include mh-panel($bg: white, $offset: 2px);
  padding: 12px;
  margin-bottom: 10px;

  .row-title {
    font-weight: 700;
    line-height: 1.3;
  }
  .row-order {
    display: inline-block;
    min-width: 22px;
    margin-right: 6px;
    padding: 1px 5px;
    border-radius: 4px;
    background-color: $mh-rule;
    font-family: $mh-mono;
    font-size: 0.8rem;
    text-align: center;
  }
  .row-id {
    display: block;
    margin-top: 3px;
    font-family: $mh-mono;
    font-size: 0.8rem;
    color: $mh-blue;
  }
  .row-meta {
    margin-top: 3px;
    font-size: 0.85rem;
    color: $mh-muted;
  }
  .row-actions {
    display: flex;
    gap: 8px;
    margin-top: 10px;
  }

  // side by side once there's room; stacked on a phone so the buttons stay full-size
  @media screen and (min-width: $mh-wide) {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;

    .row-actions {
      margin-top: 0;
      flex-shrink: 0;
    }
  }
}

.clue-form {
  .field {
    display: block;
    margin-bottom: 12px;
  }
  .field-label {
    @include mh-label;
    display: block;
    margin-bottom: 4px;
  }
  input[type="text"], input[type="number"], textarea {
    @include mh-input;
  }
  textarea {
    resize: vertical;
    line-height: 1.4;
  }
  .field-hint {
    margin: -6px 0 12px;
    font-size: 0.82rem;
    line-height: 1.35;
    color: $mh-muted;
  }
  .field-row {
    display: flex;
    gap: 12px;

    .field { flex: 1; }
  }
  .hint-explainer {
    align-self: flex-end;
    padding-bottom: 10px;
    font-size: 0.82rem;
    line-height: 1.35;
    color: $mh-muted;
  }
  .checkbox-field {
    @include mh-tappable;
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 14px;
    font-size: 0.95rem;
    cursor: pointer;

    input {
      width: 20px;
      height: 20px;
      flex-shrink: 0;
    }
  }
  .form-actions {
    display: flex;
    gap: 10px;
  }
}

// Qualified by the page class so it outranks Button.vue's per-variant shadow rules; a bare
// .ps-button selector loses to them and the coloured buttons keep a mismatched shadow.
.mukhunt-page .ps-button {
  @include mh-button;
  @include mh-button-variants;
}
</style>
