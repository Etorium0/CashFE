<template>
  <img
    :src="require('@/assets/img/icons/logo1.png')"
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
      default: '110px'
    },
    height: {
      type: String,
      default: 'auto'
    }
  }
}
</script>
