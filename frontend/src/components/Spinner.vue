<template>
  <div class="ps-spinner"></div>
</template>
<script>
export default {
  data() {
    return {
      
    }
  },
}
</script>
<style lang="scss" scoped>
.ps-spinner {
  border: 4px solid #f3f3f3; /* Light grey */
  border-top: 4px solid #6d7f8b; /* Blue */
  border-radius: 50%;
  width: 30px;
  height: 30px;
  animation: spin 1s linear infinite;
  margin: 0 auto 20px auto;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
} 
</style>