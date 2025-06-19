<template>
  <div class="account">
    <Settings />
    <NoteAccount />

    <!-- KYC Section -->
    <!-- <div class="kyc-section">
      <h3 class="title is-4">KYC Verification</h3>
      <KycModal v-if="!isKYC" :visible.sync="showKyc" @kyc-submitted="onKycSubmitted" />

      <div class="kyc-actions">
        <b-button type="is-primary" :disabled="isKYC" @click="openKycModal">
          <b-icon icon="account-check" size="is-small"></b-icon>
          <span>{{ isKYC ? 'KYC Verified' : 'Complete KYC' }}</span>
        </b-button>
      </div> -->

    <!-- KYC Details Component -->
    <!-- <KYCDetails v-if="ethAccount" :wallet-address="ethAccount" @kyc-updated="onKYCUpdated" />
    </div> -->
  </div>
</template>

<script>
import { mapGetters } from 'vuex'
import { Settings, NoteAccount } from './components'
// import KycModal from '@/components/KycModal.vue'
// import KYCDetails from '@/components/KYCDetails.vue'

export default {
  components: {
    Settings,
    NoteAccount
    // KycModal
    // KYCDetails
  },
  data() {
    return {
      showKyc: false
    }
  },
  computed: {
    ...mapGetters('metamask', ['ethAccount']),
    ...mapGetters('application', ['isKYC'])
  },
  methods: {
    openKycModal() {
      if (this.isKYC) return
      this.showKyc = true
    },
    onKycSubmitted(data) {
      this.$buefy.toast.open({
        message: 'KYC submitted and signed!',
        type: 'is-success'
      })
      console.log('KYC data:', data)
    },

    onKYCUpdated() {
      // KYC status was updated from the details component
      console.log('KYC status updated')
    }
  }
}
</script>

<style scoped>
.kyc-section {
  margin-top: 2rem;
  padding: 1.5rem;
  border: 1px solid #dbdbdb;
  border-radius: 8px;
  background-color: #fafafa;
}

.kyc-actions {
  margin-bottom: 1rem;
}

.kyc-section .title {
  margin-bottom: 1rem;
  color: #363636;
}
</style>
