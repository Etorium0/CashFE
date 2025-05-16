<template>
  <b-navbar wrapper-class="container" class="header">
    <template slot="brand">
      <b-navbar-item tag="router-link" to="/" data-test="tornado_main_page" active-class="">
        <Logo />
      </b-navbar-item>
    </template>
    <template slot="start">
      <b-navbar-item
        v-if="isEnabledGovernance"
        tag="router-link"
        to="/governance"
        data-test="voting_link"
        :active="$route.path.includes('governance')"
        class="has-tag"
      >
        {{ $t('governance') }} <span v-if="hasActiveProposals" class="navbar-item--tag"></span>
      </b-navbar-item>
      <b-navbar-item tag="router-link" to="/compliance" data-test="compliance_link">
        {{ $t('compliance') }}
      </b-navbar-item>
      <b-navbar-item
        href="https://docs.tornado.cash"
        target="_blank"
        data-test="docs_link"
        rel="noopener noreferrer"
        class="has-tag"
      >
        <b-icon icon="open-book" size="is-small" class="mr-1" />
        <span>{{ $t('docs') }}</span>
      </b-navbar-item>
    </template>
    <template slot="end">
      <b-navbar-item tag="div">
        <div class="buttons">
          <network-navbar-icon />
          <metamask-navbar-icon data-test="metamask_connection_state" />
          <indicator data-test="note_account_connection_state" />
          <!-- Nút KYC mới -->
          <b-button icon-left="user" type="is-primary" outlined @click="showKyc = true">
            KYC
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
    ...mapState('governance/gov', ['hasActiveProposals'])
  },
  methods: {
    onAccount() {
      this.$router.push('/account')
    },
    onKycSubmitted(data) {
      this.$buefy.toast.open({ message: 'KYC submitted and signed!', type: 'is-success' })
      // Xử lý dữ liệu KYC tại đây nếu cần
      console.log('KYC data:', data)
    }
  }
}
</script>
