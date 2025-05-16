<template>
  <div class="account">
    <Settings />
    <NoteAccount />
    <KycModal :visible.sync="showKyc" @kyc-submitted="onKycSubmitted" />
    <b-button type="is-primary" class="mt-4" @click="showKyc = true">
      Open KYC Modal
    </b-button>
  </div>
</template>

<script>
import { Settings, NoteAccount } from './components'
import KycModal from '@/components/KycModal.vue'

export default {
  components: {
    Settings,
    NoteAccount,
    KycModal
  },
  data() {
    return {
      showKyc: false
    }
  },
  methods: {
    onKycSubmitted(data) {
      this.$buefy.toast.open({ message: 'KYC submitted and signed!', type: 'is-success' })
      // Xử lý dữ liệu KYC tại đây nếu cần
      console.log('KYC data:', data)
    }
  }
}
</script>
