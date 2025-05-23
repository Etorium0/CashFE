<template>
  <img
    :src="require('@/assets/img/icons/logo.svg')"
    alt="Logo"
    class="logo"
    :style="{ width: width, height: height }"
  />
</template>

<script>
export default {
  props: {
    width: {
      type: String,
      default: '120px'
    },
    height: {
      type: String,
      default: 'auto'
    }
  }
}
</script>
