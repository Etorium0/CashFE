import axios from 'axios'
import { createKYCContractService } from './kycContract'

const API_URL = process.env.URL

/**
 * Submit KYC data to backend API (to mint NFT)
 */
export const submitKYC = async (kycData) => {
  try {
    const response = await axios.post(`${API_URL}/kyc`, kycData)
    return response.data
  } catch (error) {
    throw error
  }
}

/**
 * Check KYC status from smart contract (using isKYC function)
 */
export async function checkKYCStatus(walletAddress, web3Provider, netId) {
  try {
    if (!walletAddress) {
      throw new Error('Wallet address is required')
    }

    if (!web3Provider || !netId) {
      console.warn('Web3 provider or netId missing, falling back to localStorage')
      return checkKYCFromLocalStorage(walletAddress)
    }

    console.log('🔍 Checking KYC status from smart contract...')
    const kycService = createKYCContractService(web3Provider, netId)

    const isKYC = await kycService.isKYC(walletAddress)
    console.log('KYC status from smart contract (isKYC):', isKYC)

    return {
      is_active: isKYC,
      source: 'smart_contract',
      contract_check: true,
      wallet_address: walletAddress
    }
  } catch (error) {
    console.error('Smart contract KYC check failed:', error)

    console.log('Falling back to localStorage...')
    return checkKYCFromLocalStorage(walletAddress)
  }
}

/**
 * Fallback: Check KYC from localStorage
 */
function checkKYCFromLocalStorage(walletAddress) {
  try {
    const kycMap = JSON.parse(localStorage.getItem('kycMap') || '{}')
    const localKYC = !!kycMap[walletAddress.toLowerCase()]

    console.log('KYC status from localStorage (fallback):', localKYC)

    return {
      is_active: localKYC,
      source: 'localStorage',
      contract_check: false,
      wallet_address: walletAddress
    }
  } catch (error) {
    console.error('Error reading from localStorage:', error)
    return {
      is_active: false,
      source: 'error',
      contract_check: false,
      wallet_address: walletAddress
    }
  }
}
