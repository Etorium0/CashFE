<template>
  <b-modal :active.sync="visible" :can-cancel="['escape', 'x', 'outside']" has-modal-card>
    <form @submit.prevent="submitKyc">
      <div class="modal-card">
        <header class="modal-card-head">
          <p class="modal-card-title">Web3 KYC Verification</p>
          <button type="button" class="delete" @click="visible = false"></button>
        </header>
        <section class="modal-card-body">
          <b-field label="Full Name">
            <b-input v-model="form.name" required placeholder="Enter your full name"></b-input>
          </b-field>
          <b-field label="Email">
            <b-input v-model="form.email" type="email" required placeholder="Enter your email"></b-input>
          </b-field>
          <b-field label="Nationality">
            <b-input v-model="form.nationality" required placeholder="Enter your nationality"></b-input>
          </b-field>
          <b-field label="Phone Number">
            <b-input v-model="form.phone" required placeholder="Enter your phone number"></b-input>
          </b-field>
          <b-field label="Wallet Address">
            <b-input :value="walletAddress" readonly></b-input>
          </b-field>

          <div class="notification is-info is-light mt-4">
            <p>By submitting this form, you agree to:</p>
            <ul>
              <li>Sign this data with your wallet</li>
              <li>Have your KYC verification stored on the blockchain</li>
              <li>Receive a KYC NFT as proof of verification</li>
            </ul>
          </div>
        </section>
        <footer class="modal-card-foot">
          <b-button type="is-primary" native-type="submit" :loading="loading"
            >Submit & Sign with Wallet</b-button
          >
          <b-button type="is-text" @click="visible = false">Cancel</b-button>
        </footer>
      </div>
    </form>
  </b-modal>
</template>

<script>
export default {
  props: {
    visible: { type: Boolean, default: false }
  },
  data() {
    return {
      form: {
        name: '',
        email: '',
        nationality: '',
        phone: ''
      },
      walletAddress: '',
      loading: false
    }
  },
  async mounted() {
    // Try to get the wallet address when component is mounted
    try {
      if (window.ethereum) {
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' })
        if (accounts.length > 0) {
          this.walletAddress = accounts[0]
        }
      }
    } catch (error) {
      console.error('Failed to get wallet address:', error)
    }
  },
  methods: {
    async submitKyc() {
      this.loading = true
      try {
        // Connect to wallet if not already connected
        if (!this.walletAddress) {
          const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' })
          this.walletAddress = accounts[0]
        }

        // 1. Create KYC data object with timestamp and wallet address
        const kycData = {
          name: this.form.name,
          email: this.form.email,
          nationality: this.form.nationality,
          phone: this.form.phone,
          walletAddress: this.walletAddress,
          timestamp: Math.floor(Date.now() / 1000), // Unix timestamp
          nonce: this.generateNonce() // Add a nonce for additional security
        }

        // 2. Stringify for signing
        const message = JSON.stringify(kycData)

        // 3. Request signature from wallet
        const signature = await window.ethereum.request({
          method: 'personal_sign',
          params: [message, this.walletAddress]
        })

        // 4. Create final KYC verification object with data and signature
        const kycVerification = {
          kycData,
          signature,
          verificationTimestamp: Math.floor(Date.now() / 1000)
        }

        // 5. Emit the complete verification data
        this.$emit('kyc-submitted', kycVerification)

        // 6. Show success message
        this.$buefy.toast.open({
          message: 'KYC data successfully signed with your wallet!',
          type: 'is-success'
        })

        // 7. Close modal
        this.visible = false
        this.loading = false

        // New code block starts here
        const wallet = this.walletAddress.toLowerCase()
        const kycMap = JSON.parse(localStorage.getItem('kycMap') || '{}')
        kycMap[wallet] = true
        localStorage.setItem('kycMap', JSON.stringify(kycMap))
        this.$store.commit('application/SET_KYC', true)
        // New code block ends here
      } catch (error) {
        console.error('KYC submission error:', error)
        this.$buefy.toast.open({
          message: error.message || 'Failed to sign KYC data. Please try again.',
          type: 'is-danger',
          duration: 5000
        })
        this.loading = false
      }
    },

    generateNonce() {
      // Generate a random string to prevent replay attacks
      return (
        Math.random()
          .toString(36)
          .substring(2, 15) +
        Math.random()
          .toString(36)
          .substring(2, 15)
      )
    },

    onKycSubmitted(kycVerification) {
      this.$store.commit('application/SET_KYC', true)
    }
  }
}
</script>
