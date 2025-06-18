<template>
  <div class="kyc-details">
    <div v-if="kycInfo" class="notification">
      <h4 class="title is-5">KYC Status</h4>

      <div class="content">
        <p>
          <strong>Status:</strong>
          <span v-if="kycInfo.is_active" class="tag is-success">
            <b-icon icon="check-circle" size="is-small"></b-icon>
            Verified
          </span>
          <span v-else class="tag is-danger">
            <b-icon icon="close-circle" size="is-small"></b-icon>
            Not Verified
          </span>
        </p>

        <p>
          <strong>Source:</strong>
          <span v-if="kycInfo.source === 'smart_contract'" class="tag is-info">
            <b-icon icon="ethereum" size="is-small"></b-icon>
            Smart Contract
          </span>
          <span v-else-if="kycInfo.source === 'localStorage'" class="tag is-warning">
            <b-icon icon="database" size="is-small"></b-icon>
            Local Storage
          </span>
          <span v-else class="tag is-danger">
            <b-icon icon="alert" size="is-small"></b-icon>
            Error
          </span>
        </p>

        <p>
          <strong>Wallet:</strong> <code>{{ walletAddress }}</code>
        </p>

        <div v-if="kycInfo.source === 'smart_contract'" class="notification is-info is-light mt-3">
          <p class="has-text-info">
            <b-icon icon="information" size="is-small"></b-icon>
            This status is verified directly from the blockchain using the KYC smart contract's
            <code>isKYC()</code> function.
          </p>
        </div>

        <div v-else-if="kycInfo.source === 'localStorage'" class="notification is-warning is-light mt-3">
          <p class="has-text-warning">
            <b-icon icon="alert" size="is-small"></b-icon>
            Unable to connect to blockchain. Status is from local storage (offline mode).
          </p>
        </div>

        <div v-if="kycInfo.source === 'smart_contract'" class="mt-3">
          <b-button size="is-small" type="is-info" outlined :loading="refreshing" @click="refreshKYCStatus">
            <b-icon icon="refresh" size="is-small"></b-icon>
            Refresh from Blockchain
          </b-button>
        </div>
      </div>
    </div>

    <div v-else class="notification is-light">
      <p>
        <b-icon icon="loading" class="fa-spin"></b-icon>
        Loading KYC information...
      </p>
    </div>
  </div>
</template>

<script>
import { checkKYCStatus } from '@/services/cycloneApi'

export default {
  name: 'KYCDetails',
  props: {
    walletAddress: {
      type: String,
      required: true
    }
  },
  data() {
    return {
      kycInfo: null,
      refreshing: false
    }
  },
  watch: {
    walletAddress: {
      handler() {
        this.loadKYCInfo()
      },
      immediate: true
    }
  },
  async mounted() {
    await this.loadKYCInfo()
  },
  methods: {
    async loadKYCInfo() {
      if (!this.walletAddress) {
        this.kycInfo = null
        return
      }

      try {
        const web3Provider = this.$store.state.metamask?.providerConfig?.provider || window.ethereum
        const netId = this.$store.getters['metamask/netId']

        this.kycInfo = await checkKYCStatus(this.walletAddress, web3Provider, netId)

        if (this.kycInfo) {
          this.$store.commit('application/SET_KYC', this.kycInfo.is_active)
        }
      } catch (error) {
        console.error('Error loading KYC info:', error)
        this.kycInfo = {
          is_active: false,
          source: 'error',
          wallet_address: this.walletAddress
        }
      }
    },

    async refreshKYCStatus() {
      this.refreshing = true
      try {
        await this.loadKYCInfo()
        this.$buefy.toast.open({
          message: 'KYC status refreshed from blockchain!',
          type: 'is-success'
        })

        this.$emit('kyc-updated', this.kycInfo)
      } catch (error) {
        this.$buefy.toast.open({
          message: 'Failed to refresh KYC status from blockchain',
          type: 'is-danger'
        })
      } finally {
        this.refreshing = false
      }
    }
  }
}
</script>

<style scoped>
.kyc-details {
  margin: 1rem 0;
}

.kyc-info {
  margin-top: 1rem;
}

.kyc-info .field {
  margin-bottom: 0.5rem;
}

.kyc-info .label {
  font-weight: 600;
  margin-bottom: 0.25rem;
  font-size: 0.875rem;
}

.contract-address {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.contract-address code {
  font-size: 0.75rem;
  word-break: break-all;
}

.notification {
  border-radius: 8px;
}

.notification .content {
  margin: 0;
}

.notification .title {
  margin-bottom: 0.5rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
</style>
