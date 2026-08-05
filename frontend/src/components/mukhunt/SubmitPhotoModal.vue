<template>
  <Modal :show="show" @close="onClose">
    <template #header>
      <h2>{{ existingSubmission ? "Replace your photo" : clue?.title }}</h2>
      <p v-if="!existingSubmission">{{ clue?.description }}</p>
      <p v-else class="replace-note">Swapping in a new photo for "{{ clue?.title }}". Your {{ existingSubmission.pointsAwarded }} points stay put.</p>
    </template>

    <div class="submit-body">
      <div class="preview" v-if="previewUrl">
        <img :src="previewUrl" alt="your photo" />
      </div>

      <label class="photo-picker" :class="{ compact: !!previewUrl }">
        <!-- capture opens the camera straight away on a phone; front-facing when the clue wants a selfie -->
        <input
          type="file"
          accept="image/*"
          :capture="clue?.selfie ? 'user' : 'environment'"
          :disabled="busy"
          @change="onFileChange"
        />
        <span v-if="!previewUrl">{{ clue?.selfie ? "Take a selfie" : "Take a photo" }}</span>
        <span v-else>Choose a different photo</span>
      </label>

      <label class="caption-field">
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

      <div class="progress-track" v-if="status === 'uploading'">
        <div class="progress-fill" :style="{ width: `${uploadPercent}%` }"></div>
        <span class="progress-label">Uploading&hellip; {{ uploadPercent }}%</span>
      </div>
      <div class="status-note" v-else-if="status === 'preparing'">Getting things ready&hellip;</div>
      <div class="status-note" v-else-if="status === 'submitting'">Saving your submission&hellip;</div>
      <div class="status-error" v-if="errorMessage">{{ errorMessage }}</div>
    </div>

    <template #actions>
      <Button submit v-if="!busy" @press="submit">{{ existingSubmission ? "Replace photo" : "Submit photo" }}</Button>
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
  },
  data() {
    return {
      file: null,
      previewUrl: "",
      caption: "",
      status: "idle", // idle | preparing | uploading | submitting
      uploadPercent: 0,
      errorMessage: "",
      maxCaption: MAX_CAPTION_LENGTH,
    }
  },
  computed: {
    busy() {
      return this.status !== "idle";
    },
  },
  watch: {
    // the parent keeps one modal instance around, so each open starts from a clean slate
    show(isOpen) {
      if (isOpen) {
        this.reset();
        this.caption = this.existingSubmission?.caption ?? "";
      } else {
        this.releasePreview();
      }
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
      this.releasePreview();
      this.file = file;
      this.previewUrl = URL.createObjectURL(file);
    },
    async submit() {
      if (!this.file) {
        this.errorMessage = "Pick a photo first.";
        return;
      }
      this.errorMessage = "";
      try {
        this.status = "preparing";
        const { blob, contentType, fileName } = await normalizeImage(this.file);

        const token = (await Auth.currentSession()).getAccessToken().getJwtToken();
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

        this.status = "submitting";
        const submitResponse = await API.post('ps-api', '/games/mukhunt/submissions', {
          body: {
            clueId: this.clue.clueId,
            imageId: urlResponse.imageId,
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

.replace-note {
  color: $mh-muted;
}

// A portrait photo preview plus the caption field can outgrow a phone screen, and the shared modal
// has no scrolling of its own - without this the actions end up below the fold and unreachable.
:deep(.modal-container) {
  max-height: 88vh;
  overflow-y: auto;
}

// match the buttons on the rest of the page, including Modal's own Close button
:deep(.ps-button) {
  @include mh-tappable;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 2px solid $mh-ink;
  border-radius: $mh-radius;
  box-shadow: 2px 2px 0 $mh-ink;
  padding: 0 16px;
  font-weight: 700;

  &:hover:active {
    box-shadow: 0 0 0 $mh-ink;
    transform: translate(2px, 2px);
  }
}

.submit-body {
  .preview {
    margin-bottom: 12px;
    border: 2px solid $mh-ink;
    border-radius: $mh-radius;
    overflow: hidden;
    background-color: $mh-ink;

    img {
      display: block;
      width: 100%;
      max-height: 45vh;
      object-fit: contain;
    }
  }

  .photo-picker {
    @include mh-panel($bg: $mh-accent, $offset: 3px);
    @include mh-pressable;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 64px;
    margin-bottom: 14px;
    padding: 12px;
    font-weight: 700;
    text-align: center;
    color: $mh-ink;

    // the real control is unusable on a phone, so the label is the button
    input {
      position: absolute;
      width: 1px;
      height: 1px;
      opacity: 0;
      pointer-events: none;
    }

    &.compact {
      min-height: 44px;
      font-weight: 400;
      font-size: 0.9rem;
      background-color: white;
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
      background-color: $mh-accent;
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
