<template>
  <b-modal :active.sync="visible" :can-cancel="['escape', 'x', 'outside']" has-modal-card>
    <form @submit.prevent="submitKyc">
      <div class="modal-card">
        <header class="modal-card-head">
          <p class="modal-card-title">Web3 KYC Verification</p>
          <button type="button" class="delete" @click="visible = false"></button>
        </header>
        <section class="modal-card-body">
          <b-field label="Nationality">
            <b-input v-model="form.nationality" required placeholder="Enter your nationality"></b-input>
          </b-field>
          <b-field label="Citizen ID">
            <b-input v-model="form.citizenId" required placeholder="Enter your citizen ID"></b-input>
          </b-field>
          <b-field label="Full Name">
            <b-input v-model="form.name" required placeholder="Enter your full name"></b-input>
          </b-field>
          <b-field label="Email">
            <b-input v-model="form.email" type="email" required placeholder="Enter your email"></b-input>
          </b-field>
          <b-field label="Date of Birth">
            <b-datepicker
              v-model="form.dateOfBirth"
              placeholder="Click to select date"
              icon="calendar"
              :max-date="new Date()"
              required
            ></b-datepicker>
          </b-field>
          <b-field label="Phone Number">
            <b-input v-model="form.phone" required placeholder="Enter your phone number"></b-input>
          </b-field>
          <b-field label="Wallet Address">
            <b-input :value="walletAddress" readonly></b-input>
          </b-field>

          <div class="notification is-info is-dark mt-4 is-warning">
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
import { submitKYC, checkStatusKYC } from '@/services/cycloneApi'

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
        phone: '',
        dateOfBirth: new Date(),
        citizenId: ''
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

        // Validate date of birth
        this.validateDateOfBirth(this.form.dateOfBirth)

        // 1. Create KYC data object with timestamp and wallet address
        const kycData = {
          citizenId: this.form.citizenId,
          dateOfBirth: this.form.dateOfBirth,
          name: this.form.name,
          nationality: this.form.nationality,
          phone: this.form.phone,
          walletAddress: this.walletAddress,
          timestamp: Math.floor(Date.now() / 1000) // Unix timestamp
        }

        console.log('KYC Data before signing:', kycData)

        // 2. Stringify for signing
        const message = JSON.stringify(kycData)

        // 3. Request signature from wallet
        const signature = await this.signMessage(message)

        // 4. Create final KYC verification object with data and signature
        const kycVerification = {
          citizen_id: String(this.form.citizenId),
          full_name: String(this.form.name),
          phone_number: String(this.form.phone),
          date_of_birth: this.formatDate(this.form.dateOfBirth),
          nationality: String(this.form.nationality),
          wallet_address: String(this.walletAddress),
          wallet_signature: String(signature),
          is_active: false
        }

        console.log('Raw KYC data:', this.form)
        console.log('Formatted date:', this.formatDate(this.form.dateOfBirth))
        console.log('Final KYC Verification data to be submitted:', JSON.stringify(kycVerification, null, 2))

        // Submit KYC data
        console.log('Calling submitKYC API...')
        try {
          const response = await submitKYC(kycVerification)
          console.log('KYC submission response:', response)

          // 6. Emit the complete verification data
          this.$emit('kyc-submitted', kycVerification)

          // 7. Show success message
          this.$buefy.toast.open({
            message: 'KYC data successfully submitted and verified!',
            type: 'is-success'
          })

          // 8. Update local storage and store
          const wallet = this.walletAddress.toLowerCase()
          const kycMap = JSON.parse(localStorage.getItem('kycMap') || '{}')
          kycMap[wallet] = true
          localStorage.setItem('kycMap', JSON.stringify(kycMap))

          // Kiểm tra lại trạng thái KYC từ backend (theo wallet address) và cập nhật vào store
          console.log('Checking KYC status for wallet:', this.walletAddress)
          console.log('Wallet address length:', this.walletAddress.length)
          console.log('Wallet address (trimmed):', this.walletAddress.trim())

          try {
            const status = await checkStatusKYC(this.walletAddress.trim())
            console.log('KYC status from backend:', status)
            console.log('Setting isKYC to:', !!(status && status.is_active))

            // Commit mutation với namespace application (đúng cho Nuxt store modules)
            this.$store.commit('application/SET_KYC', !!(status && status.is_active))
            console.log('isKYC committed to store:', !!(status && status.is_active))
            console.log('isKYC in store after commit:', this.$store.getters['application/isKYC'])
            console.log('Store state application:', this.$store.state.application.isKYC)
          } catch (checkError) {
            console.warn('Cannot check KYC status from backend (API may be down):', checkError.message)
            // Fallback: Assume KYC is active after successful submission
            this.$store.commit('application/SET_KYC', true)
            console.log('Fallback: Set isKYC to true after successful submission')
          }

          // 9. Close modal
          this.visible = false
          this.loading = false
        } catch (error) {
          console.error('Error calling submitKYC:', error)
          console.error('Error details:', {
            message: error.message,
            response: error.response?.data,
            status: error.response?.status
          })
          this.$buefy.toast.open({
            message: error.message || 'Failed to submit KYC data. Please try again.',
            type: 'is-danger',
            duration: 5000
          })
          this.loading = false
        }
      } catch (error) {
        console.error('KYC submission error:', error)
        this.$buefy.toast.open({
          message: error.message || 'Failed to submit KYC data. Please try again.',
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

    formatDate(dateString) {
      if (!dateString) return ''
      const date = new Date(dateString)
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      return `${year}-${month}-${day}`
    },

    validateDateOfBirth(date) {
      const birthDate = new Date(date)
      const today = new Date()
      if (birthDate > today) {
        throw new Error('Date of birth cannot be in the future')
      }
      // Check if age is reasonable (e.g., at least 18 years old)
      const age = today.getFullYear() - birthDate.getFullYear()
      if (age < 18) {
        throw new Error('You must be at least 18 years old')
      }
      return true
    },

    async signMessage(message) {
      try {
        const signature = await window.ethereum.request({
          method: 'personal_sign',
          params: [message, this.walletAddress]
        })
        return signature
      } catch (error) {
        console.error('Error signing message:', error)
        throw new Error('Failed to sign message with wallet')
      }
    }
  }
}
</script>
