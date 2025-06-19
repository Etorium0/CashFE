<template>
  <b-navbar wrapper-class="container" class="header">
    <template slot="brand">
      <b-navbar-item tag="router-link" to="/" data-test="tornado_main_page" active-class="">
        <Logo />
      </b-navbar-item>
    </template>
    <template slot="start">
      <!-- <b-navbar-item
        v-if="isEnabledGovernance"
        tag="router-link"
        to="/governance"
        data-test="voting_link"
        :active="$route.path.includes('governance')"
        class="has-tag"
      >
        {{ $t('governance') }} <span v-if="hasActiveProposals" class="navbar-item--tag"></span>
      </b-navbar-item> -->
      <!-- <b-navbar-item tag="router-link" to="/compliance" data-test="compliance_link">
        {{ $t('compliance') }}
      </b-navbar-item> -->
      <!-- <b-navbar-item
        href="https://docs.tornado.cash"
        target="_blank"
        data-test="docs_link"
        rel="noopener noreferrer"
        class="has-tag"
      >
        <b-icon icon="open-book" size="is-small" class="mr-1" />
        <span>{{ $t('docs') }}</span>
      </b-navbar-item> -->
    </template>
    <template slot="end">
      <b-navbar-item tag="div">
        <div class="buttons">
          <network-navbar-icon />
          <metamask-navbar-icon data-test="metamask_connection_state" />
          <indicator data-test="note_account_connection_state" />
          <!-- Nút KYC mới -->
          <b-button
            icon-left="check"
            :type="isKYC ? 'is-success' : 'is-primary'"
            :outlined="!isKYC"
            class="kyc-button"
            @click="resetKycModal"
            :disabled="isKYC"
          >
            {{ isKYC ? 'KYC verified' : 'KYC' }}
          </b-button>
          <!-- Nút Settings giữ nguyên -->
          <b-button
            icon-left="settings"
            type="is-primary"
            outlined
            data-test="button_settings"
            @mousedown.prevent
            @click="onAccount"
          >
            {{ $t('settings') }}
          </b-button>
        </div>
        <!-- Modal KYC -->
        <KycModal :visible.sync="showKyc" @kyc-submitted="onKycSubmitted" />
      </b-navbar-item>
    </template>
  </b-navbar>
</template>

<script>
import { mapState, mapGetters } from 'vuex'
import Logo from '@/components/Logo'
import { Indicator } from '@/modules/account'
import MetamaskNavbarIcon from '@/components/MetamaskNavbarIcon'
import NetworkNavbarIcon from '@/components/NetworkNavbarIcon'
import KycModal from '@/components/KycModal.vue'

export default {
  components: {
    Logo,
    Indicator,
    NetworkNavbarIcon,
    MetamaskNavbarIcon,
    KycModal
  },
  data() {
    return {
      isActive: false,
      showKyc: false
    }
  },
  computed: {
    ...mapGetters('metamask', ['netId', 'isLoggedIn']),
    ...mapGetters('governance/gov', ['isEnabledGovernance']),
    ...mapGetters('application', ['isKYC']),
    ...mapState('governance/gov', ['hasActiveProposals'])
  },
  watch: {
    isKYC: {
      handler(newValue) {
        console.log('KYC status changed:', newValue)
      }
    }
  },
  methods: {
    onAccount() {
      this.$router.push('/account')
    },
    onKycSubmitted(data) {
      this.$buefy.toast.open({ message: 'KYC submitted and signed!', type: 'is-success' })
      // Xử lý dữ liệu KYC tại đây nếu cần
      console.log('KYC data:', data)
      console.log('KYC status after submission:', this.isKYC)
    },
    openKycModal() {
      console.log('Opening KYC modal. Current state:', this.showKyc)
      this.showKyc = true
      console.log('After setting showKyc = true:', this.showKyc)

      // Debug - kiểm tra KycModal
      this.$nextTick(() => {
        console.log('Modal visible after nextTick:', this.showKyc)
      })
    },
    resetKycModal() {
      if (this.isKYC) return
      this.showKyc = false
      this.$nextTick(() => {
        this.showKyc = true
        console.log('KYC modal reset and shown again')
      })
    }
  }
}
</script>
