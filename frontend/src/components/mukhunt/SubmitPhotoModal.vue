<template>
  <Modal :show="show" @close="onClose">
    <template #header>
      <!-- lives in the header slot, positioned against the modal container -->
      <span class="close-x" :class="{ disabled: busy }" @click="onClose" role="button" aria-label="Close">&times;</span>
      <h2>{{ clue?.title }}</h2>
      <p>{{ clue?.description }}</p>
    </template>

    <div class="submit-body">
      <!-- sits directly under the clue text, since it's part of reading the clue -->
      <div class="hint-panel" v-if="revealedHint">
        <div class="hint-label">Hint<template v-if="revealedHint.penalty"> &middot; cost {{ revealedHint.penalty }} pts</template></div>
        <p class="hint-text">{{ revealedHint.text }}</p>
      </div>
      <div class="hint-offer" v-else-if="clue?.hasHint">
        <span class="hint-button" :class="{ disabled: revealingHint }" @click="revealHint">
          {{ revealingHint ? "Getting hint…" : hintOfferLabel }}
        </span>
      </div>

      <!-- once there's a photo, replacing it is a small swap button tucked into the corner rather
           than a full-width row, so the modal stays short enough to avoid scrolling on a phone -->
      <div class="preview" v-if="displayedImage">
        <div class="preview-label">{{ previewUrl ? "New photo" : "Your photo" }}</div>
        <img :src="displayedImage" alt="your photo" />
        <label class="replace-btn" :class="{ disabled: busy }" :title="replaceLabel" :aria-label="replaceLabel">
          <input
            type="file"
            accept="image/*"
            :capture="clue?.selfie ? 'user' : 'environment'"
            :disabled="busy"
            @change="onFileChange"
          />
          <!-- two arrows chasing round a circle: the standard swap/replace glyph -->
          <svg class="swap-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <polyline points="21 3 21 8 16 8" />
            <path d="M21 8A9 9 0 0 0 5.6 5.5L3 8" />
            <polyline points="3 21 3 16 8 16" />
            <path d="M3 16a9 9 0 0 0 15.4 2.5L21 16" />
          </svg>
        </label>
      </div>

      <!-- an empty dropzone the size a photo would take, so the modal doesn't jump when one is added -->
      <label class="photo-picker" v-else>
        <!-- capture opens the camera straight away on a phone; front-facing when the clue wants a selfie -->
        <input
          type="file"
          accept="image/*"
          :capture="clue?.selfie ? 'user' : 'environment'"
          :disabled="busy"
          @change="onFileChange"
        />
        <svg class="camera-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
          <circle cx="12" cy="13" r="4" />
        </svg>
        <span>{{ clue?.selfie ? "Take a selfie" : "Take a photo" }}</span>
      </label>

      <!-- the delete confirmation swaps in where the caption was, rather than pushing a new panel
           below it, so arming delete doesn't shift everything down -->
      <label class="caption-field" v-if="!confirmingDelete">
        <span class="field-label">Caption <i>(optional)</i></span>
        <textarea
          v-model="caption"
          rows="2"
          :maxlength="maxCaption"
          :disabled="busy"
          placeholder="Say something about it"
        ></textarea>
        <span class="caption-count" :class="{ near: caption.length > maxCaption - 40 }">{{ caption.length }}/{{ maxCaption }}</span>
      </label>
      <div class="delete-confirm" v-else>
        <span class="field-label">Delete this photo?</span>
        <p class="delete-confirm-text">This removes it for good, and takes back the {{ existingSubmission?.pointsAwarded }} points it earned.</p>
      </div>

      <!-- one bar for the whole submit. It holds at 0% through the encode, tracks the real percent
           through the upload, and holds at 99% through the save, so the feedback never flips between
           text and a bar and back. -->
      <div class="progress-track" v-if="uploadInProgress">
        <div class="progress-fill" :style="{ width: `${progressPercent}%` }"></div>
        <span class="progress-label">{{ progressLabel }}</span>
      </div>
      <div class="status-note" v-else-if="status === 'deleting'">Deleting&hellip;</div>
      <div class="status-error" v-if="errorMessage">{{ errorMessage }}</div>
    </div>

    <template #actions>
      <Button cancel v-if="existingSubmission && !busy" @press="onDeletePress">
        {{ confirmingDelete ? "Really delete?" : "Delete" }}
      </Button>
      <Button submit v-if="!busy" :class="{ inert: !hasChanges }" @press="submit">
        {{ existingSubmission ? "Confirm changes" : "Submit photo" }}
      </Button>
    </template>
  </Modal>
</template>

<script>
import { API, Auth } from "aws-amplify";
import Modal from "@/components/Modal.vue";
import Button from "@/components/Button.vue";

const MAX_CAPTION_LENGTH = 280;
// Phone cameras produce 3-12MB images, which is slow to upload on cell service and larger than the
// album will ever need. Re-encoding also converts iPhone HEIC into something every browser can show.
const MAX_EDGE_PX = 2000;
const JPEG_QUALITY = 0.85;

/**
 * Downscales and re-encodes to JPEG. Returns the original file untouched if the browser can't decode
 * it, so an unusual format still uploads rather than failing outright.
 */
async function normalizeImage(file) {
  try {
    // from-image applies the EXIF orientation, otherwise phone photos come out rotated.
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, MAX_EDGE_PX / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();

    const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
    if (!blob) return { blob: file, contentType: file.type || "image/jpeg", fileName: file.name };

    const fileName = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return { blob, contentType: "image/jpeg", fileName };
  } catch (err) {
    console.log("falling back to the original file", err);
    return { blob: file, contentType: file.type || "image/jpeg", fileName: file.name };
  }
}

/**
 * fetch can't report upload progress, and a photo on cell service takes long enough that a bare
 * spinner reads as broken. XHR can, so it's worth the older API here.
 */
function uploadWithProgress(url, blob, contentType, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    // must match the content type the url was signed with, or S3 rejects it
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed (${xhr.status}). Give it another go.`));
    };
    xhr.onerror = () => reject(new Error("Upload failed. Check your signal and try again."));
    xhr.send(blob);
  });
}

export default {
  name: "SubmitPhotoModal",
  props: {
    show: Boolean,
    clue: Object,
    existingSubmission: Object,
    // { text, penalty } once the player has paid for this clue's hint
    revealedHint: Object,
  },
  data() {
    return {
      file: null,
      previewUrl: "",
      caption: "",
      status: "idle", // idle | preparing | uploading | submitting | deleting
      uploadPercent: 0,
      errorMessage: "",
      confirmingDelete: false,
      revealingHint: false,
      maxCaption: MAX_CAPTION_LENGTH,
    }
  },
  computed: {
    busy() {
      return this.status !== "idle";
    },
    // a freshly picked file wins; otherwise fall back to whatever they submitted before
    displayedImage() {
      return this.previewUrl || this.existingSubmission?.imageUrl || "";
    },
    // the icon button has no visible text, so this rides on title/aria-label
    replaceLabel() {
      return this.existingSubmission && !this.previewUrl ? "Replace photo" : "Choose a different photo";
    },
    // the encode, upload, and save phases are one continuous progress bar
    uploadInProgress() {
      return ["preparing", "uploading", "submitting"].includes(this.status);
    },
    // 0% while encoding, the real percent while uploading (capped at 99 so it only reads full once
    // actually done), then held at 99% while the submission saves
    progressPercent() {
      if (this.status === "uploading") return Math.min(this.uploadPercent, 99);
      if (this.status === "submitting") return 99;
      return 0;
    },
    progressLabel() {
      return `Uploading… ${this.progressPercent}%`;
    },
    // a new submission needs a photo; an edit needs either a new photo or a changed caption,
    // so confirming can't be pressed until there's actually something to confirm
    // the cost goes in the label, so nobody spends points without having seen the price
    hintOfferLabel() {
      const penalty = this.clue?.hintPenalty ?? 0;
      if (this.existingSubmission) return "Show hint";
      return penalty > 0 ? `Show hint (costs ${penalty} pts)` : "Show hint";
    },
    hasChanges() {
      if (!this.existingSubmission) return !!this.file;
      const originalCaption = (this.existingSubmission.caption ?? "").trim();
      return !!this.file || this.caption.trim() !== originalCaption;
    },
  },
  watch: {
    // the parent keeps one modal instance around, so each open starts from a clean slate.
    // flush: post so the clue and submission props have settled before the caption is read from
    // them - otherwise opening on an existing submission starts with an empty caption box, which
    // then counts as an edit and enables the confirm button with nothing actually changed.
    show: {
      flush: 'post',
      handler(isOpen) {
        if (isOpen) {
          this.reset();
          this.caption = this.existingSubmission?.caption ?? "";
        } else {
          this.releasePreview();
        }
      },
    },
  },
  unmounted() {
    this.releasePreview();
  },
  methods: {
    reset() {
      this.releasePreview();
      this.file = null;
      this.caption = "";
      this.status = "idle";
      this.uploadPercent = 0;
      this.errorMessage = "";
      this.confirmingDelete = false;
    },
    releasePreview() {
      if (this.previewUrl) {
        URL.revokeObjectURL(this.previewUrl);
        this.previewUrl = "";
      }
    },
    onClose() {
      // don't yank the modal out from under an in-flight upload
      if (this.busy) return;
      this.$emit('close');
    },
    onFileChange(e) {
      const file = e.target.files?.[0];
      if (!file) return;
      this.errorMessage = "";
      // picking a photo is a clear signal they're not deleting after all
      this.confirmingDelete = false;
      this.releasePreview();
      this.file = file;
      this.previewUrl = URL.createObjectURL(file);
    },
    async revealHint() {
      if (this.revealingHint) return;
      this.errorMessage = "";
      this.revealingHint = true;
      try {
        const token = (await Auth.currentSession()).getAccessToken().getJwtToken();
        const response = await API.post('ps-api', '/games/mukhunt/hints', {
          body: { clueId: this.clue.clueId },
          headers: { Authorization: `Bearer ${token}` },
        });
        this.$emit('revealed', { clueId: this.clue.clueId, hint: response.hint });
      } catch (err) {
        this.errorMessage = err.response?.data?.message ?? err.message;
      } finally {
        this.revealingHint = false;
      }
    },
    // first press arms it, second one actually deletes. The confirmation replaces the caption in
    // place, so nothing shifts and there's no need to scroll the button back into view.
    onDeletePress() {
      if (!this.confirmingDelete) {
        this.confirmingDelete = true;
        return;
      }
      this.deleteSubmission();
    },
    async deleteSubmission() {
      this.errorMessage = "";
      try {
        this.status = "deleting";
        const token = (await Auth.currentSession()).getAccessToken().getJwtToken();
        const response = await API.post('ps-api', '/games/mukhunt/submissions/delete', {
          body: { clueId: this.clue.clueId },
          headers: { Authorization: `Bearer ${token}` },
        });
        this.status = "idle";
        this.confirmingDelete = false;
        this.$emit('deleted', response);
      } catch (err) {
        this.status = "idle";
        this.errorMessage = err.response?.data?.message ?? err.message;
      }
    },
    async submit() {
      if (!this.hasChanges) return;
      if (!this.file && !this.existingSubmission) {
        this.errorMessage = "Pick a photo first.";
        return;
      }
      this.errorMessage = "";
      try {
        const token = (await Auth.currentSession()).getAccessToken().getJwtToken();

        // a caption-only edit reuses the photo that's already up there, so it skips
        // straight to the submission call
        let imageId = this.existingSubmission?.imageId;
        if (this.file) {
          this.status = "preparing";
          const { blob, contentType, fileName } = await normalizeImage(this.file);

          // encoded because phone filenames carry spaces and parens that would break the path
          const urlResponse = await API.get(
            'ps-api',
            `/games/mukhunt/uploadUrl/${encodeURIComponent(fileName)}?contentType=${encodeURIComponent(contentType)}`,
            { headers: { Authorization: `Bearer ${token}` } }
          );

          this.status = "uploading";
          this.uploadPercent = 0;
          await uploadWithProgress(urlResponse.uploadUrl, blob, contentType, (pct) => {
            this.uploadPercent = pct;
          });
          imageId = urlResponse.imageId;
        }

        this.status = "submitting";
        const submitResponse = await API.post('ps-api', '/games/mukhunt/submissions', {
          body: {
            clueId: this.clue.clueId,
            imageId: imageId,
            caption: this.caption,
          },
          headers: { Authorization: `Bearer ${token}` },
        });

        this.status = "idle";
        this.$emit('submitted', submitResponse);
      } catch (err) {
        this.status = "idle";
        this.errorMessage = err.response?.data?.message ?? err.message;
      }
    },
  },
  components: {
    Modal,
    Button,
  }
}
</script>

<style lang="scss" scoped>
@import "../../scss/mukhunt.scss";

// anchor for the close X, which sits against the container rather than the header text
:deep(.modal-container) {
  position: relative;
}

.close-x {
  position: absolute;
  top: 4px;
  right: 8px;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.8rem;
  line-height: 1;
  color: $mh-ink;
  cursor: pointer;

  &.disabled {
    opacity: 0.35;
    cursor: default;
  }
}

// the header text shouldn't run under the X
:deep(.modal-header) h2 {
  padding-right: 36px;
}

// A portrait photo preview plus the caption field can outgrow a phone screen, and the shared modal
// has no scrolling of its own - without this the actions end up below the fold and unreachable.
:deep(.modal-container) {
  max-height: 88vh;
  overflow-y: auto;
}

// Matches the buttons on the rest of the page, including Modal's own Close button. Qualified by
// .modal-actions so it outranks Button.vue's per-variant shadow rules.
:deep(.modal-actions .ps-button) {
  @include mh-button;
  @include mh-button-variants;

  // Button.vue has no disabled state, so nothing-to-confirm is expressed here.
  // pointer-events blocks the press outright; submit() also guards on hasChanges.
  &.inert {
    opacity: 0.4;
    pointer-events: none;
  }
}

.submit-body {
  .hint-offer {
    margin-bottom: 12px;

    .hint-button {
      @include mh-tappable;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 10px;
      border: 2px dashed $mh-blue;
      border-radius: $mh-radius;
      color: $mh-blue;
      font-weight: 700;
      font-size: 0.9rem;
      cursor: pointer;

      &.disabled {
        opacity: 0.5;
        pointer-events: none;
      }
    }
  }

  .hint-panel {
    padding: 10px 12px;
    margin-bottom: 12px;
    border: 2px solid $mh-blue;
    border-radius: $mh-radius;
    background-color: rgba(97, 115, 155, 0.09);

    .hint-label {
      @include mh-label;
      color: $mh-blue;
    }
    .hint-text {
      margin: 4px 0 0;
      font-size: 0.95rem;
      line-height: 1.4;
    }
  }

  .preview {
    position: relative;
    margin-bottom: 12px;
    border: 2px solid $mh-ink;
    border-radius: $mh-radius;
    overflow: hidden;
    background-color: $mh-ink;

    .preview-label {
      @include mh-label;
      position: absolute;
      top: 8px;
      left: 8px;
      padding: 3px 8px;
      border-radius: 20px;
      background-color: $mh-ink;
      color: $mh-accent;
      font-size: 0.6rem;
    }

    img {
      display: block;
      width: 100%;
      max-height: 45vh;
      object-fit: contain;
    }

    // a square swap button floating just inside the bottom-right corner of the photo
    .replace-btn {
      position: absolute;
      right: 8px;
      bottom: 8px;
      width: 46px;
      height: 46px;
      display: flex;
      align-items: center;
      justify-content: center;
      background-color: rgba(34, 32, 44, 0.78);
      color: white;
      border-radius: $mh-radius - 2px;
      cursor: pointer;

      // the real control is unusable on a phone, so the label is the button
      input {
        position: absolute;
        width: 1px;
        height: 1px;
        opacity: 0;
        pointer-events: none;
      }
      .swap-icon {
        width: 24px;
        height: 24px;
      }
      &:active {
        background-color: rgba(34, 32, 44, 0.92);
      }
      &.disabled {
        opacity: 0.5;
        pointer-events: none;
      }
    }
  }

  // a dashed dropzone, photo-shaped and the size a photo would fill, echoing the empty My Photos
  // state: a camera icon over the prompt
  .photo-picker {
    @include mh-tappable;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    width: 100%;
    aspect-ratio: 4 / 3;
    // same cap the filled preview image uses, so the empty box matches a photo's footprint and
    // can't balloon past the viewport on a wide screen
    max-height: 45vh;
    margin-bottom: 14px;
    border: 2px dashed $wedding-sage-dark;
    border-radius: $mh-radius;
    color: $mh-muted;
    font-weight: 700;
    cursor: pointer;

    // the real control is unusable on a phone, so the label is the button
    input {
      position: absolute;
      width: 1px;
      height: 1px;
      opacity: 0;
      pointer-events: none;
    }
    .camera-icon {
      width: 44px;
      height: 44px;
    }
    &:active {
      background-color: rgba(113, 115, 98, 0.08);
    }
  }

  .caption-field {
    display: block;
    position: relative;
    margin-bottom: 12px;

    .field-label {
      @include mh-label;
      display: block;
      margin-bottom: 4px;

      i { text-transform: none; letter-spacing: 0; }
    }
    textarea {
      @include mh-input;
      resize: vertical;
      line-height: 1.4;
    }
    .caption-count {
      display: block;
      text-align: right;
      font-family: $mh-mono;
      font-size: 0.75rem;
      color: $mh-muted;

      &.near { color: $mh-pop; }
    }
  }

  // occupies the caption's slot while a delete is armed, so the layout holds still
  .delete-confirm {
    margin-bottom: 12px;

    .field-label {
      @include mh-label;
      display: block;
      margin-bottom: 4px;
      color: $mh-pop;
    }
    .delete-confirm-text {
      margin: 0;
      font-size: 0.9rem;
      line-height: 1.35;
      color: $mh-pop;
    }
  }

  .progress-track {
    position: relative;
    height: 28px;
    margin-bottom: 10px;
    border: 2px solid $mh-ink;
    border-radius: $mh-radius;
    overflow: hidden;
    background-color: white;

    .progress-fill {
      height: 100%;
      background-color: $mh-lavender;
      transition: width 0.15s linear;
    }
    .progress-label {
      @include mh-label;
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      color: $mh-ink;
    }
  }

  .status-note {
    @include mh-label;
    margin-bottom: 10px;
  }
  .status-error {
    color: $mh-pop;
    font-weight: 700;
    margin-bottom: 10px;
  }
}
</style>
