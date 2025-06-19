import Web3 from 'web3'
import networkConfig from '@/networkConfig'

// KYC NFT ABI - only isKYC function needed
const KYC_NFT_ABI = [
  {
    inputs: [{ internalType: 'address', name: 'account', type: 'address' }],
    name: 'isKYC',
    outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function'
  }
]

const TORNADO_PROXY_ABI = [
  {
    inputs: [],
    name: 'kycWalletNFT',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function'
  }
]

export class KYCContractService {
  constructor(web3Provider, netId) {
    this.web3 = new Web3(web3Provider)
    this.netId = netId
    this.config = networkConfig[`netId${netId}`]

    if (!this.config) {
      throw new Error(`Network configuration not found for netId: ${netId}`)
    }

    // Cache contract address to avoid repeated calls
    this.kycContractAddress = null
  }

  /**
   * Get KYC NFT contract address from TornadoProxy
   */
  async getKYCContractAddress() {
    if (this.kycContractAddress) {
      return this.kycContractAddress
    }

    try {
      const tornadoProxyAddress =
        this.config['tornado-proxy.contract.tornadocash.eth'] ||
        this.config['tornado-router.contract.tornadocash.eth'] ||
        this.config['tornado-proxy-light.contract.tornadocash.eth']

      if (!tornadoProxyAddress) {
        throw new Error('TornadoProxy address not found in network config')
      }

      const tornadoProxy = new this.web3.eth.Contract(TORNADO_PROXY_ABI, tornadoProxyAddress)
      this.kycContractAddress = await tornadoProxy.methods.kycWalletNFT().call()

      console.log('KYC NFT Contract Address:', this.kycContractAddress)
      return this.kycContractAddress
    } catch (error) {
      console.error('Error getting KYC contract address:', error)
      throw error
    }
  }

  /**
   * Check if an address has KYC using isKYC function
   */
  async isKYC(walletAddress) {
    try {
      if (!walletAddress) {
        throw new Error('Wallet address is required')
      }

      const kycContractAddress = await this.getKYCContractAddress()
      const kycContract = new this.web3.eth.Contract(KYC_NFT_ABI, kycContractAddress)

      const isKYC = await kycContract.methods.isKYC(walletAddress).call()

      console.log(`✅ isKYC check for ${walletAddress}:`, isKYC)

      return isKYC
    } catch (error) {
      console.error('Error calling isKYC function:', error)
      throw error
    }
  }
}

/**
 * Factory function to create KYCContractService
 */
export const createKYCContractService = (web3Provider, netId) => {
  return new KYCContractService(web3Provider, netId)
}
