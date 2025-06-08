import axios from 'axios'

const API_URL = process.env.URL

export const submitKYC = async (kycData) => {
  try {
    const response = await axios.post(`${API_URL}/kyc`, kycData)
    return response.data
  } catch (error) {
    throw error
  }
}

async function checkStatusKYC(walletAddress) {
  try {
    const normalizedAddress = walletAddress.toLowerCase()
    const response = await axios.get(`${API_URL}/kyc/status/wallet/${normalizedAddress}`)
    return response.data
  } catch (error) {
    if (error.response) {
      console.error('Server Error:', error.response.status, error.response.data)
    } else if (error.request) {
      console.error('Network Error:', error.request)
    } else {
      console.error('Error:', error.message)
    }
    throw error
  }
}
export { checkStatusKYC }
